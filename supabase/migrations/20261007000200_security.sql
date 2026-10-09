-- =============================================================================
-- Houcine Chapati — 002 · Sécurité : rôles, Row Level Security, droits
-- -----------------------------------------------------------------------------
-- Principes :
--   * RLS activée sur TOUTES les tables exposées.
--   * Le navigateur ne fait que des SELECT (filtrés par RLS) et quelques UPDATE
--     limités à des colonnes précises. Tout changement d'état métier (commande,
--     statut, assignation, position) passe par des fonctions RPC (003) qui
--     vérifient le rôle et les transitions autorisées.
--   * Le rôle d'un compte est lu dans public.profiles, que l'utilisateur ne peut
--     pas modifier (droit UPDATE limité aux colonnes name et phone).
--   * Les clés publiques (publishable / anon) ne donnent accès qu'à ce que ces
--     politiques autorisent. La clé secrète (service_role / sb_secret) ne sort
--     jamais du serveur (Edge Functions).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY DEFINER : lisent profiles sans boucle RLS)
-- -----------------------------------------------------------------------------
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = (select auth.uid());
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_app_role()) = 'ADMIN', false);
$$;

-- Identifiant du livreur connecté (null si pas livreur ou livreur désactivé)
create or replace function private.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.user_id = (select auth.uid())
    and p.role = 'DRIVER'
    and d.active;
$$;

grant execute on function private.current_app_role() to anon, authenticated, service_role;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.current_driver_id() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Activation de RLS
-- -----------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.restaurant_settings   enable row level security;
alter table public.customers             enable row level security;
alter table public.drivers               enable row level security;
alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.product_options       enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.driver_locations      enable row level security;

-- -----------------------------------------------------------------------------
-- Droits de base : on part de zéro, puis on accorde le strict nécessaire.
-- (Supabase accorde par défaut ALL aux rôles anon/authenticated.)
-- -----------------------------------------------------------------------------
revoke all on
  public.profiles, public.restaurant_settings, public.customers, public.drivers,
  public.categories, public.products, public.product_option_groups, public.product_options,
  public.orders, public.order_items, public.order_status_history, public.driver_locations
from anon, authenticated;

-- Menu et réglages : lisibles par tous (même sans compte)
grant select on public.restaurant_settings, public.categories, public.products,
  public.product_option_groups, public.product_options to anon, authenticated;

-- Données privées : uniquement pour les comptes connectés (puis filtrées par RLS)
grant select on public.profiles, public.customers, public.drivers, public.orders,
  public.order_items, public.order_status_history, public.driver_locations to authenticated;

-- Écritures directes autorisées (toujours filtrées par RLS ci-dessous)
grant update (name, phone) on public.profiles to authenticated;                -- son propre profil
grant insert, update, delete on public.categories, public.products,
  public.product_option_groups, public.product_options to authenticated;      -- admin
grant update (name, phone, address, latitude, longitude, accepting_orders, delivery_fee,
  free_delivery_threshold, min_order_amount, delivery_radius_km, share_driver_location)
  on public.restaurant_settings to authenticated;                              -- admin
grant update (name, phone, active) on public.drivers to authenticated;         -- admin

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy "profiles: lire son profil ou admin"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "profiles: modifier son profil"
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- restaurant_settings
-- -----------------------------------------------------------------------------
create policy "settings: lecture publique"
  on public.restaurant_settings for select to anon, authenticated
  using (true);

create policy "settings: admin modifie"
  on public.restaurant_settings for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- customers (écriture uniquement via place_order)
-- -----------------------------------------------------------------------------
create policy "customers: lire sa fiche ou admin"
  on public.customers for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- drivers
-- -----------------------------------------------------------------------------
create policy "drivers: admin ou soi-même"
  on public.drivers for select to authenticated
  using ((select private.is_admin()) or id = (select private.current_driver_id()));

create policy "drivers: admin modifie"
  on public.drivers for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Menu : public en lecture (catégories actives), admin en écriture
-- -----------------------------------------------------------------------------
create policy "categories: lecture publique des actives"
  on public.categories for select to anon, authenticated
  using (active or (select private.is_admin()));

create policy "categories: admin ajoute"
  on public.categories for insert to authenticated
  with check ((select private.is_admin()));
create policy "categories: admin modifie"
  on public.categories for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "categories: admin supprime"
  on public.categories for delete to authenticated
  using ((select private.is_admin()));

create policy "products: lecture publique (catégorie active)"
  on public.products for select to anon, authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.categories c where c.id = category_id and c.active)
  );

create policy "products: admin ajoute"
  on public.products for insert to authenticated
  with check ((select private.is_admin()));
create policy "products: admin modifie"
  on public.products for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "products: admin supprime"
  on public.products for delete to authenticated
  using ((select private.is_admin()));

-- Les options suivent la visibilité de leur produit (RLS de products appliquée)
create policy "option groups: lecture selon le produit"
  on public.product_option_groups for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

create policy "option groups: admin ajoute"
  on public.product_option_groups for insert to authenticated
  with check ((select private.is_admin()));
create policy "option groups: admin modifie"
  on public.product_option_groups for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "option groups: admin supprime"
  on public.product_option_groups for delete to authenticated
  using ((select private.is_admin()));

create policy "options: lecture selon le groupe"
  on public.product_options for select to anon, authenticated
  using (exists (select 1 from public.product_option_groups g where g.id = group_id));

create policy "options: admin ajoute"
  on public.product_options for insert to authenticated
  with check ((select private.is_admin()));
create policy "options: admin modifie"
  on public.product_options for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "options: admin supprime"
  on public.product_options for delete to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- orders : client = ses commandes ; livreur = celles qui lui sont assignées
-- (terminées depuis moins de 24 h incluses) ; admin = toutes.
-- Aucune écriture directe : uniquement via les RPC de 003.
-- -----------------------------------------------------------------------------
create policy "orders: client, livreur assigné ou admin"
  on public.orders for select to authenticated
  using (
    customer_user_id = (select auth.uid())
    or (select private.is_admin())
    or (
      driver_id = (select private.current_driver_id())
      and (
        status not in ('DELIVERED', 'CANCELLED')
        or updated_at > now() - interval '24 hours'
      )
    )
  );

-- Lignes et historique : visibles si la commande est visible (RLS de orders)
create policy "order items: selon la commande"
  on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy "order history: selon la commande"
  on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- -----------------------------------------------------------------------------
-- driver_locations : admin, ou le livreur pour ses propres positions
-- -----------------------------------------------------------------------------
create policy "driver locations: admin ou soi-même"
  on public.driver_locations for select to authenticated
  using ((select private.is_admin()) or driver_id = (select private.current_driver_id()));
