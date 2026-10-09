-- =============================================================================
-- Houcine Chapati — 005 · Realtime, Storage et verrouillage final
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Supabase Realtime : tables diffusées (chaque abonné ne reçoit que les lignes
-- que la RLS l'autorise à lire).
--   orders                 → admin (toutes), client (les siennes), livreur (assignées)
--   notifications          → destinataire / admins
--   drivers                → admin (statuts + positions en direct)
--   menu + réglages        → application client (mise à jour du menu sans recharger)
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach v_table in array array[
    'orders', 'notifications', 'drivers', 'categories', 'products',
    'product_option_groups', 'product_options', 'restaurant_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storage : photos des produits et catégories
-- Bucket public en lecture (URL publiques), écriture réservée aux admins.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "product images: admin lit"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()));

create policy "product images: admin ajoute"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select private.is_admin()));

create policy "product images: admin modifie"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()))
  with check (bucket_id = 'product-images' and (select private.is_admin()));

create policy "product images: admin supprime"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Verrouillage : aucune fonction du schéma private n'est exécutable par les
-- rôles API, sauf les 3 fonctions utilisées dans les politiques RLS.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_app_role() to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.current_driver_id() to anon, authenticated;
