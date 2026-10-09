-- =============================================================================
-- Houcine Chapati — 003 · Logique métier (fonctions RPC)
-- -----------------------------------------------------------------------------
-- Toutes les écritures métier passent ici. Chaque fonction :
--   * est SECURITY DEFINER avec search_path vide (pas de détournement possible),
--   * vérifie elle-même le rôle de l'appelant,
--   * applique les transitions de statut autorisées,
--   * lève des erreurs à code stable (ex. 'ORDER_NOT_READY') que les
--     applications traduisent en français (packages/shared/src/domain/errors.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilitaires internes
-- -----------------------------------------------------------------------------
create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

-- Téléphone mobile algérien → format 0XXXXXXXXX (05, 06, 07), sinon null.
-- Accepte : 0556 72 56 81, +213 556 72 56 81, 00213556725681, +213 0556...
create or replace function private.normalize_dz_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d ~ '^0[567][0-9]{8}$' then d end
  from (
    select regexp_replace(
             regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'),
             '^(\+213|00213|213)0?', '0') as d
  ) s;
$$;

-- Distance à vol d'oiseau en km (formule de haversine)
create or replace function private.distance_km(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ));
$$;

-- Coordonnées dans l'emprise de l'Algérie (garde-fou grossier)
create or replace function private.is_in_algeria(p_lat double precision, p_lng double precision)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_lat between 18.9 and 37.6 and p_lng between -8.7 and 12.0;
$$;

create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_driver()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := private.current_driver_id();
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if v_driver_id is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_driver_id;
end;
$$;

-- Transitions autorisées, par acteur. Source unique de vérité côté serveur
-- (reprise côté interface dans packages/shared/src/domain/status.ts).
--   ADMIN    : PENDING→CONFIRMED→PREPARING→READY, annulation tant que non livrée,
--              et reprise manuelle de la livraison si le livreur ne peut pas.
--   (READY→ASSIGNED se fait uniquement via admin_assign_driver.)
--   DRIVER   : ASSIGNED→OUT_FOR_DELIVERY→DELIVERED
--   CUSTOMER : annulation tant que la commande est PENDING
create or replace function private.is_valid_transition(
  p_from public.order_status, p_to public.order_status, p_actor public.app_role
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_actor
    when 'ADMIN' then
      (p_from::text || '>' || p_to::text) = any (array[
        'PENDING>CONFIRMED', 'CONFIRMED>PREPARING', 'PREPARING>READY',
        'ASSIGNED>OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY>DELIVERED'
      ])
      or (p_to = 'CANCELLED' and p_from not in ('DELIVERED', 'CANCELLED'))
    when 'DRIVER' then
      (p_from::text || '>' || p_to::text) = any (array[
        'ASSIGNED>OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY>DELIVERED'
      ])
    when 'CUSTOMER' then
      p_from = 'PENDING' and p_to = 'CANCELLED'
    else false
  end;
$$;

-- Recalcule le statut d'un livreur selon ses commandes en cours :
-- commandes actives → BUSY ; plus rien et BUSY → AVAILABLE ; OFFLINE reste OFFLINE.
create or replace function private.refresh_driver_status(p_driver_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.drivers d
  set status = case
    when exists (
      select 1 from public.orders o
      where o.driver_id = d.id and o.status in ('ASSIGNED', 'OUT_FOR_DELIVERY')
    ) then 'BUSY'::public.driver_status
    when d.status = 'BUSY' then 'AVAILABLE'::public.driver_status
    else d.status
  end
  where d.id = p_driver_id and d.active;
$$;

-- Applique un changement de statut (verrouille la commande, vérifie la transition,
-- horodate l'étape, libère le livreur si besoin). Retourne la commande à jour.
create or replace function private.apply_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_actor public.app_role,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if not private.is_valid_transition(v_order.status, p_status, p_actor) then
    raise exception 'INVALID_STATUS_TRANSITION'
      using detail = v_order.status::text || ' → ' || p_status::text;
  end if;

  update public.orders set
    status              = p_status,
    confirmed_at        = case when p_status = 'CONFIRMED'        then now() else confirmed_at end,
    preparing_at        = case when p_status = 'PREPARING'        then now() else preparing_at end,
    ready_at            = case when p_status = 'READY'            then now() else ready_at end,
    out_for_delivery_at = case when p_status = 'OUT_FOR_DELIVERY' then now() else out_for_delivery_at end,
    delivered_at        = case when p_status = 'DELIVERED'        then now() else delivered_at end,
    cancelled_at        = case when p_status = 'CANCELLED'        then now() else cancelled_at end,
    cancel_reason       = case when p_status = 'CANCELLED'
                               then nullif(left(btrim(coalesce(p_reason, '')), 300), '')
                               else cancel_reason end
  where id = p_order_id
  returning * into v_order;

  if v_order.driver_id is not null then
    perform private.refresh_driver_status(v_order.driver_id);
  end if;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- CLIENT · Passer une commande
-- -----------------------------------------------------------------------------
-- p_order = {
--   "name", "phone", "address", "wilaya", "commune",
--   "latitude", "longitude",                  -- GPS ou marqueur confirmé
--   "delivery_instructions", "additional_info",
--   "items": [{ "product_id", "quantity", "option_ids": [uuid, ...] }]
-- }
-- Les prix envoyés par le navigateur sont ignorés : tout est recalculé ici.
create or replace function public.place_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := auth.uid();
  v_settings      public.restaurant_settings;
  v_name          text := btrim(coalesce(p_order ->> 'name', ''));
  v_phone         text := private.normalize_dz_phone(p_order ->> 'phone');
  v_address       text := btrim(coalesce(p_order ->> 'address', ''));
  v_wilaya        text := btrim(coalesce(p_order ->> 'wilaya', ''));
  v_commune       text := btrim(coalesce(p_order ->> 'commune', ''));
  v_instructions  text := nullif(btrim(coalesce(p_order ->> 'delivery_instructions', '')), '');
  v_info          text := nullif(btrim(coalesce(p_order ->> 'additional_info', '')), '');
  v_items         jsonb := p_order -> 'items';
  v_lat           double precision;
  v_lng           double precision;
  v_item          jsonb;
  v_product       record;
  v_bad_group     text;
  v_option_ids    uuid[];
  v_qty           integer;
  v_unit          integer;
  v_options       jsonb;
  v_lines         jsonb := '[]'::jsonb;
  v_subtotal      integer := 0;
  v_fee           integer;
  v_customer_id   uuid;
  v_order_id      uuid;
  v_day           date := (now() at time zone 'Africa/Algiers')::date;
  v_seq           integer;
  v_number        text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_settings from public.restaurant_settings where id = 1;
  if not found or not v_settings.accepting_orders then
    raise exception 'ORDERS_CLOSED';
  end if;

  -- Coordonnées du client
  if char_length(v_name) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if char_length(v_address) not between 5 and 300 then raise exception 'INVALID_ADDRESS'; end if;
  if char_length(v_wilaya) not between 2 and 60 then raise exception 'INVALID_WILAYA'; end if;
  if char_length(v_commune) not between 2 and 80 then raise exception 'INVALID_COMMUNE'; end if;
  if char_length(coalesce(v_instructions, '')) > 500 or char_length(coalesce(v_info, '')) > 500 then
    raise exception 'TEXT_TOO_LONG';
  end if;

  -- Position GPS (obligatoire, vient du téléphone ou du marqueur confirmé)
  begin
    v_lat := (p_order ->> 'latitude')::double precision;
    v_lng := (p_order ->> 'longitude')::double precision;
  exception when others then
    raise exception 'INVALID_LOCATION';
  end;
  if v_lat is null or v_lng is null then raise exception 'LOCATION_REQUIRED'; end if;
  if not private.is_in_algeria(v_lat, v_lng) then raise exception 'LOCATION_OUT_OF_AREA'; end if;
  if v_settings.delivery_radius_km is not null
     and v_settings.latitude is not null and v_settings.longitude is not null
     and private.distance_km(v_settings.latitude, v_settings.longitude, v_lat, v_lng) > v_settings.delivery_radius_km
  then
    raise exception 'OUT_OF_DELIVERY_ZONE' using detail = v_settings.delivery_radius_km::text;
  end if;

  -- Anti-abus : commandes actives et fréquence
  if (select count(*) from public.orders o
      where o.customer_user_id = v_uid and o.status not in ('DELIVERED', 'CANCELLED')) >= 3 then
    raise exception 'TOO_MANY_ACTIVE_ORDERS';
  end if;
  if (select count(*) from public.orders o
      where o.customer_user_id = v_uid and o.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'RATE_LIMITED';
  end if;

  -- Panier
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if jsonb_array_length(v_items) > 30 then raise exception 'CART_TOO_LARGE'; end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    begin
      v_qty := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'INVALID_QUANTITY';
    end;
    if v_qty is null or v_qty not between 1 and 50 then raise exception 'INVALID_QUANTITY'; end if;

    select p.id, p.name, p.price, p.available, c.active as category_active
      into v_product
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.id = private.try_uuid(v_item ->> 'product_id');
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if not v_product.available or not v_product.category_active then
      raise exception 'PRODUCT_UNAVAILABLE' using detail = v_product.name;
    end if;

    -- Options choisies (identifiants uniques)
    begin
      select coalesce(array_agg(distinct x::uuid), '{}')
        into v_option_ids
      from jsonb_array_elements_text(coalesce(v_item -> 'option_ids', '[]'::jsonb)) as t(x);
    exception when others then
      raise exception 'INVALID_OPTION' using detail = v_product.name;
    end;

    -- Chaque option doit appartenir à ce produit et être disponible
    if exists (
      select 1 from unnest(v_option_ids) as sel(option_id)
      where not exists (
        select 1
        from public.product_options po
        join public.product_option_groups g on g.id = po.group_id
        where po.id = sel.option_id and g.product_id = v_product.id and po.available
      )
    ) then
      raise exception 'OPTION_UNAVAILABLE' using detail = v_product.name;
    end if;

    -- Règles des groupes : obligatoire, choix unique, maximum
    select g.name into v_bad_group
    from public.product_option_groups g
    cross join lateral (
      select count(*) as n from public.product_options po
      where po.group_id = g.id and po.id = any (v_option_ids)
    ) chosen
    where g.product_id = v_product.id
      and (
        (g.required and chosen.n = 0)
        or (g.selection = 'SINGLE' and chosen.n > 1)
        or (g.max_select is not null and chosen.n > g.max_select)
      )
    order by g.sort_order
    limit 1;
    if v_bad_group is not null then
      raise exception 'OPTION_RULE_VIOLATION' using detail = v_product.name || ' — ' || v_bad_group;
    end if;

    select coalesce(sum(po.price_delta), 0)::integer,
           coalesce(jsonb_agg(jsonb_build_object(
             'id', po.id, 'group', g.name, 'name', po.name, 'price', po.price_delta
           ) order by g.sort_order, po.sort_order), '[]'::jsonb)
      into v_unit, v_options
    from public.product_options po
    join public.product_option_groups g on g.id = po.group_id
    where po.id = any (v_option_ids);

    v_unit := v_unit + v_product.price;
    v_subtotal := v_subtotal + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name,
      'options', v_options, 'quantity', v_qty, 'unit_price', v_unit
    ));
  end loop;

  if v_subtotal < v_settings.min_order_amount then
    raise exception 'MIN_ORDER_NOT_REACHED' using detail = v_settings.min_order_amount::text;
  end if;

  v_fee := case
    when v_settings.free_delivery_threshold is not null
         and v_subtotal >= v_settings.free_delivery_threshold then 0
    else v_settings.delivery_fee
  end;

  -- Fiche client (dernières coordonnées utilisées)
  insert into public.customers as c
    (user_id, name, phone, address, wilaya, commune, latitude, longitude, delivery_instructions)
  values
    (v_uid, v_name, v_phone, v_address, v_wilaya, v_commune, v_lat, v_lng, v_instructions)
  on conflict (user_id) do update set
    name = excluded.name, phone = excluded.phone, address = excluded.address,
    wilaya = excluded.wilaya, commune = excluded.commune,
    latitude = excluded.latitude, longitude = excluded.longitude,
    delivery_instructions = excluded.delivery_instructions
  returning c.id into v_customer_id;

  -- Numéro unique : HC-AAMMJJ-NNN (compteur du jour, verrou de ligne = sans doublon)
  insert into private.order_counters as oc (day, last_value) values (v_day, 1)
  on conflict (day) do update set last_value = oc.last_value + 1
  returning oc.last_value into v_seq;
  v_number := 'HC-' || to_char(v_day, 'YYMMDD') || '-'
              || lpad(v_seq::text, greatest(3, char_length(v_seq::text)), '0');

  insert into public.orders (
    order_number, customer_id, customer_user_id, status, subtotal, delivery_fee, total,
    customer_name, customer_phone, customer_address, wilaya, commune,
    customer_latitude, customer_longitude, delivery_instructions, additional_info
  ) values (
    v_number, v_customer_id, v_uid, 'PENDING', v_subtotal, v_fee, v_subtotal + v_fee,
    v_name, v_phone, v_address, v_wilaya, v_commune,
    v_lat, v_lng, v_instructions, v_info
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, options, quantity, unit_price, total)
  select v_order_id,
         (l ->> 'product_id')::uuid,
         l ->> 'product_name',
         l -> 'options',
         (l ->> 'quantity')::integer,
         (l ->> 'unit_price')::integer,
         (l ->> 'quantity')::integer * (l ->> 'unit_price')::integer
  from jsonb_array_elements(v_lines) as t(l);

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_number,
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'total', v_subtotal + v_fee
  );
end;
$$;

-- CLIENT · Annuler sa commande tant qu'elle n'est pas confirmée
create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.orders where id = p_order_id and customer_user_id = auth.uid()
  ) then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  return private.apply_order_status(p_order_id, 'CANCELLED', 'CUSTOMER',
                                    coalesce(p_reason, 'Annulée par le client'));
end;
$$;

-- CLIENT · Infos du livreur de sa commande (nom, téléphone, et position si le
-- restaurant active le partage). Prêt pour le suivi du livreur côté client.
create or replace function public.get_order_driver(p_order_id uuid)
returns table (
  name text,
  phone text,
  latitude double precision,
  longitude double precision,
  last_location_update timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_share boolean;
begin
  select * into v_order from public.orders
  where id = p_order_id and customer_user_id = auth.uid();
  if not found or v_order.driver_id is null
     or v_order.status not in ('ASSIGNED', 'OUT_FOR_DELIVERY') then
    return;
  end if;

  select s.share_driver_location into v_share from public.restaurant_settings s where s.id = 1;

  return query
  select d.name, d.phone,
         case when v_share and v_order.status = 'OUT_FOR_DELIVERY' then d.current_latitude end,
         case when v_share and v_order.status = 'OUT_FOR_DELIVERY' then d.current_longitude end,
         case when v_share and v_order.status = 'OUT_FOR_DELIVERY' then d.last_location_update end
  from public.drivers d
  where d.id = v_order.driver_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- ADMIN · Commandes
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_order_status(
  p_order_id uuid, p_status public.order_status, p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return private.apply_order_status(p_order_id, p_status, 'ADMIN', p_reason);
end;
$$;

-- Assigner (ou réassigner) un livreur à une commande prête
create or replace function public.admin_assign_driver(p_order_id uuid, p_driver_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_driver public.drivers;
  v_prev   uuid;
begin
  perform private.require_admin();

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('READY', 'ASSIGNED') then
    raise exception 'ORDER_NOT_READY' using detail = v_order.status::text;
  end if;

  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found or not v_driver.active then raise exception 'DRIVER_NOT_FOUND'; end if;
  if v_driver.status = 'OFFLINE' then raise exception 'DRIVER_OFFLINE'; end if;

  v_prev := v_order.driver_id;

  update public.orders
  set driver_id = p_driver_id, status = 'ASSIGNED', assigned_at = now()
  where id = p_order_id
  returning * into v_order;

  perform private.refresh_driver_status(p_driver_id);
  if v_prev is not null and v_prev <> p_driver_id then
    perform private.refresh_driver_status(v_prev);
  end if;

  return v_order;
end;
$$;

-- Indicateurs du tableau de bord (journée à l'heure d'Alger)
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz :=
    date_trunc('day', now() at time zone 'Africa/Algiers') at time zone 'Africa/Algiers';
  v_result jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'orders_today',     count(*) filter (where o.created_at >= v_day_start),
    'pending',          count(*) filter (where o.status = 'PENDING'),
    'confirmed',        count(*) filter (where o.status = 'CONFIRMED'),
    'preparing',        count(*) filter (where o.status = 'PREPARING'),
    'ready',            count(*) filter (where o.status = 'READY'),
    'in_delivery',      count(*) filter (where o.status in ('ASSIGNED', 'OUT_FOR_DELIVERY')),
    'delivered_today',  count(*) filter (where o.status = 'DELIVERED' and o.delivered_at >= v_day_start),
    'cancelled_today',  count(*) filter (where o.status = 'CANCELLED' and o.cancelled_at >= v_day_start),
    'revenue_today',    coalesce(sum(o.total) filter (
                          where o.status = 'DELIVERED' and o.delivered_at >= v_day_start), 0),
    'revenue_expected', coalesce(sum(o.total) filter (
                          where o.created_at >= v_day_start and o.status <> 'CANCELLED'), 0),
    'day_start',        v_day_start
  )
  into v_result
  from public.orders o
  where o.created_at >= v_day_start
     or o.status not in ('DELIVERED', 'CANCELLED')
     or o.delivered_at >= v_day_start
     or o.cancelled_at >= v_day_start;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- ADMIN · Options d'un produit (remplacement atomique, identifiants conservés)
-- p_groups = [{ "id"?, "name", "selection": "SINGLE"|"MULTIPLE", "required",
--               "max_select"?, "options": [{ "id"?, "name", "price_delta", "available" }] }]
-- -----------------------------------------------------------------------------
create or replace function public.admin_save_product_options(p_product_id uuid, p_groups jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group     jsonb;
  v_option    jsonb;
  v_group_id  uuid;
  v_option_id uuid;
  v_g_index   integer := 0;
  v_o_index   integer;
  v_keep_g    uuid[] := '{}';
  v_keep_o    uuid[];
begin
  perform private.require_admin();

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' then
    raise exception 'INVALID_OPTIONS';
  end if;

  for v_group in select value from jsonb_array_elements(p_groups) loop
    v_group_id := private.try_uuid(v_group ->> 'id');
    if v_group_id is not null and exists (
      select 1 from public.product_option_groups
      where id = v_group_id and product_id = p_product_id
    ) then
      update public.product_option_groups set
        name = btrim(v_group ->> 'name'),
        selection = coalesce((v_group ->> 'selection')::public.option_selection, 'MULTIPLE'),
        required = coalesce((v_group ->> 'required')::boolean, false),
        max_select = nullif(v_group ->> 'max_select', '')::integer,
        sort_order = v_g_index
      where id = v_group_id;
    else
      insert into public.product_option_groups (product_id, name, selection, required, max_select, sort_order)
      values (
        p_product_id,
        btrim(v_group ->> 'name'),
        coalesce((v_group ->> 'selection')::public.option_selection, 'MULTIPLE'),
        coalesce((v_group ->> 'required')::boolean, false),
        nullif(v_group ->> 'max_select', '')::integer,
        v_g_index
      )
      returning id into v_group_id;
    end if;
    v_keep_g := v_keep_g || v_group_id;

    v_keep_o := '{}';
    v_o_index := 0;
    for v_option in select value from jsonb_array_elements(coalesce(v_group -> 'options', '[]'::jsonb)) loop
      v_option_id := private.try_uuid(v_option ->> 'id');
      if v_option_id is not null and exists (
        select 1 from public.product_options where id = v_option_id and group_id = v_group_id
      ) then
        update public.product_options set
          name = btrim(v_option ->> 'name'),
          price_delta = coalesce((v_option ->> 'price_delta')::integer, 0),
          available = coalesce((v_option ->> 'available')::boolean, true),
          sort_order = v_o_index
        where id = v_option_id;
      else
        insert into public.product_options (group_id, name, price_delta, available, sort_order)
        values (
          v_group_id,
          btrim(v_option ->> 'name'),
          coalesce((v_option ->> 'price_delta')::integer, 0),
          coalesce((v_option ->> 'available')::boolean, true),
          v_o_index
        )
        returning id into v_option_id;
      end if;
      v_keep_o := v_keep_o || v_option_id;
      v_o_index := v_o_index + 1;
    end loop;

    delete from public.product_options where group_id = v_group_id and id <> all (v_keep_o);
    v_g_index := v_g_index + 1;
  end loop;

  delete from public.product_option_groups
  where product_id = p_product_id and id <> all (v_keep_g);
end;
$$;

-- -----------------------------------------------------------------------------
-- LIVREUR
-- -----------------------------------------------------------------------------
-- Disponible / hors ligne. BUSY est géré automatiquement selon les commandes.
create or replace function public.driver_set_availability(p_available boolean)
returns public.driver_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := private.require_driver();
  v_status public.driver_status;
begin
  if not p_available and exists (
    select 1 from public.orders
    where driver_id = v_driver_id and status in ('ASSIGNED', 'OUT_FOR_DELIVERY')
  ) then
    raise exception 'DRIVER_HAS_ACTIVE_ORDERS';
  end if;

  update public.drivers
  set status = case when p_available then 'AVAILABLE' else 'OFFLINE' end::public.driver_status
  where id = v_driver_id;

  perform private.refresh_driver_status(v_driver_id);

  select status into v_status from public.drivers where id = v_driver_id;
  return v_status;
end;
$$;

-- Le livreur part livrer (ASSIGNED → OUT_FOR_DELIVERY)
create or replace function public.driver_start_delivery(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := private.require_driver();
begin
  if not exists (select 1 from public.orders where id = p_order_id and driver_id = v_driver_id) then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  return private.apply_order_status(p_order_id, 'OUT_FOR_DELIVERY', 'DRIVER');
end;
$$;

-- Le livreur confirme la livraison (OUT_FOR_DELIVERY → DELIVERED)
create or replace function public.driver_complete_delivery(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := private.require_driver();
begin
  if not exists (select 1 from public.orders where id = p_order_id and driver_id = v_driver_id) then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  return private.apply_order_status(p_order_id, 'DELIVERED', 'DRIVER');
end;
$$;

-- Position GPS du livreur. Met à jour drivers.current_* à chaque appel
-- (Realtime → carte admin) et archive un point au plus toutes les 10 s.
create or replace function public.driver_report_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy real default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := private.require_driver();
  v_order_id uuid;
begin
  if p_latitude is null or p_longitude is null
     or not private.is_in_algeria(p_latitude, p_longitude) then
    raise exception 'INVALID_LOCATION';
  end if;

  update public.drivers
  set current_latitude = p_latitude,
      current_longitude = p_longitude,
      last_location_update = now()
  where id = v_driver_id;

  if not exists (
    select 1 from public.driver_locations
    where driver_id = v_driver_id and created_at > now() - interval '10 seconds'
  ) then
    select id into v_order_id from public.orders
    where driver_id = v_driver_id and status = 'OUT_FOR_DELIVERY'
    order by out_for_delivery_at desc nulls last
    limit 1;

    insert into public.driver_locations (driver_id, order_id, latitude, longitude, accuracy)
    values (v_driver_id, v_order_id, p_latitude, p_longitude,
            case when p_accuracy >= 0 then p_accuracy end);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gestion des comptes (hors navigateur)
-- -----------------------------------------------------------------------------
-- Crée/active la fiche livreur d'un compte Auth existant. Réservée au serveur :
-- appelée par l'Edge Function manage-drivers (clé secrète) ou depuis le SQL Editor.
create or replace function private.make_driver(
  p_user_id uuid, p_name text, p_phone text, p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_driver_id uuid;
begin
  update public.profiles
  set role = 'DRIVER', name = btrim(p_name), phone = btrim(p_phone)
  where user_id = p_user_id and role <> 'ADMIN'
  returning id into v_profile_id;
  if v_profile_id is null then
    raise exception 'USER_NOT_FOUND_OR_ADMIN';
  end if;

  insert into public.drivers (profile_id, name, phone, email, status, active)
  values (v_profile_id, btrim(p_name), btrim(p_phone), p_email, 'OFFLINE', true)
  on conflict (profile_id) do update set
    name = excluded.name, phone = excluded.phone,
    email = coalesce(excluded.email, public.drivers.email), active = true
  returning id into v_driver_id;

  return v_driver_id;
end;
$$;

create or replace function public.service_create_driver(
  p_user_id uuid, p_name text, p_phone text, p_email text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.make_driver(p_user_id, p_name, p_phone, p_email);
$$;

-- À lancer dans le SQL Editor : select private.promote_to_admin('vous@exemple.com');
create or replace function private.promote_to_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'Aucun compte Auth avec l''email %', p_email;
  end if;
  insert into public.profiles (user_id, role) values (v_user_id, 'ADMIN')
  on conflict (user_id) do update set role = 'ADMIN';
end;
$$;

-- À lancer dans le SQL Editor : select private.promote_to_driver('livreur@exemple.com', 'Nom', '0555123456');
create or replace function private.promote_to_driver(p_email text, p_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'Aucun compte Auth avec l''email %', p_email;
  end if;
  return private.make_driver(v_user_id, p_name, p_phone, lower(btrim(p_email)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution : personne par défaut, puis le strict nécessaire
-- -----------------------------------------------------------------------------
revoke execute on function
  public.place_order(jsonb),
  public.customer_cancel_order(uuid, text),
  public.get_order_driver(uuid),
  public.admin_set_order_status(uuid, public.order_status, text),
  public.admin_assign_driver(uuid, uuid),
  public.admin_dashboard_stats(),
  public.admin_save_product_options(uuid, jsonb),
  public.driver_set_availability(boolean),
  public.driver_start_delivery(uuid),
  public.driver_complete_delivery(uuid),
  public.driver_report_location(double precision, double precision, real),
  public.service_create_driver(uuid, text, text, text)
from public, anon, authenticated;

-- Comptes connectés (y compris clients anonymes) ; chaque fonction vérifie le rôle.
grant execute on function
  public.place_order(jsonb),
  public.customer_cancel_order(uuid, text),
  public.get_order_driver(uuid),
  public.admin_set_order_status(uuid, public.order_status, text),
  public.admin_assign_driver(uuid, uuid),
  public.admin_dashboard_stats(),
  public.admin_save_product_options(uuid, jsonb),
  public.driver_set_availability(boolean),
  public.driver_start_delivery(uuid),
  public.driver_complete_delivery(uuid),
  public.driver_report_location(double precision, double precision, real)
to authenticated;

-- Serveur uniquement (Edge Function avec la clé secrète)
grant execute on function public.service_create_driver(uuid, text, text, text) to service_role;
