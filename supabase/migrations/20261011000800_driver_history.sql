-- =============================================================================
-- Houcine Chapati — 008 · Historique des courses du livreur
-- =============================================================================
-- Migration ADDITIVE : une nouvelle fonction, rien n'est modifié.
--
-- Un livreur ne lit une commande que jusqu'à 24 h après sa fin (RLS de la
-- migration 002) : ses données personnelles (nom, téléphone, adresse, GPS du
-- client) ne restent pas sur le téléphone du livreur. Cette fonction lui donne
-- tout de même l'historique complet de SES courses, mais SANS aucune donnée
-- personnelle du client : numéro, dates, commune, montant, nombre d'articles.
-- =============================================================================

create or replace function public.driver_delivery_history(p_limit integer default 200)
returns table (
  order_id      uuid,
  order_number  text,
  status        public.order_status,
  wilaya        text,
  commune       text,
  total         integer,
  items_count   integer,
  assigned_at   timestamptz,
  delivered_at  timestamptz,
  cancelled_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_driver uuid := private.current_driver_id();
begin
  if v_driver is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select o.id, o.order_number, o.status, o.wilaya, o.commune, o.total,
           coalesce((select sum(i.quantity)::integer from public.order_items i where i.order_id = o.id), 0),
           o.assigned_at, o.delivered_at, o.cancelled_at
    from public.orders o
    where o.driver_id = v_driver
      and o.status in ('DELIVERED', 'CANCELLED')
    order by coalesce(o.delivered_at, o.cancelled_at, o.updated_at) desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.driver_delivery_history(integer) from public, anon;
grant execute on function public.driver_delivery_history(integer) to authenticated;
