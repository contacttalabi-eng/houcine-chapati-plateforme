-- =============================================================================
-- Houcine Chapati — 006 · Adresse de livraison modifiable depuis le profil
-- -----------------------------------------------------------------------------
-- Migration additive : une seule nouvelle fonction, aucune table ni donnée
-- existante modifiée.
--
-- Le client ne peut toujours pas écrire directement dans public.customers
-- (aucun droit INSERT/UPDATE). Cette fonction enregistre son adresse avec les
-- mêmes validations que place_order. Le nom et le téléphone viennent de son
-- profil (public.profiles), source unique ; la dernière position GPS connue
-- est conservée et reste à reconfirmer à chaque commande.
-- =============================================================================

create or replace function public.customer_save_address(
  p_address text,
  p_wilaya text,
  p_commune text,
  p_instructions text default null
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_profile      public.profiles;
  v_phone        text;
  v_address      text := btrim(coalesce(p_address, ''));
  v_wilaya       text := btrim(coalesce(p_wilaya, ''));
  v_commune      text := btrim(coalesce(p_commune, ''));
  v_instructions text := nullif(btrim(coalesce(p_instructions, '')), '');
  v_row          public.customers;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid;
  v_phone := private.normalize_dz_phone(v_profile.phone);
  if v_profile.name is null or char_length(btrim(v_profile.name)) < 2 or v_phone is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if char_length(v_address) not between 5 and 300 then raise exception 'INVALID_ADDRESS'; end if;
  if char_length(v_wilaya) not between 2 and 60 then raise exception 'INVALID_WILAYA'; end if;
  if char_length(v_commune) not between 2 and 80 then raise exception 'INVALID_COMMUNE'; end if;
  if char_length(coalesce(v_instructions, '')) > 500 then raise exception 'TEXT_TOO_LONG'; end if;

  insert into public.customers as c
    (user_id, name, phone, address, wilaya, commune, delivery_instructions)
  values
    (v_uid, btrim(v_profile.name), v_phone, v_address, v_wilaya, v_commune, v_instructions)
  on conflict (user_id) do update set
    name = excluded.name,
    phone = excluded.phone,
    address = excluded.address,
    wilaya = excluded.wilaya,
    commune = excluded.commune,
    delivery_instructions = excluded.delivery_instructions
    -- latitude / longitude : volontairement conservées
  returning c.* into v_row;

  return v_row;
end;
$$;

revoke execute on function public.customer_save_address(text, text, text, text) from public, anon, authenticated;
grant execute on function public.customer_save_address(text, text, text, text) to authenticated;
