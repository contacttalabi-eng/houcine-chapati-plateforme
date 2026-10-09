-- =============================================================================
-- Houcine Chapati — 001 · Schéma de base
-- -----------------------------------------------------------------------------
-- Tables métier, relations, contraintes et index.
-- Montants : entiers en dinars algériens (DA). Heures : timestamptz (UTC en base,
-- affichées à l'heure d'Alger côté interface).
-- La sécurité (RLS, droits) est dans 002, la logique métier (RPC) dans 003.
-- =============================================================================

-- Schéma interne : jamais exposé par l'API (PostgREST n'expose que "public").
create schema if not exists private;
revoke all on schema private from public;
-- Les politiques RLS appellent des fonctions de ce schéma : les rôles API
-- doivent pouvoir y "entrer", mais chaque fonction garde ses propres droits.
grant usage on schema private to anon, authenticated, service_role;
-- (les droits EXECUTE des fonctions de ce schéma sont verrouillés en fin de 005)

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('CUSTOMER', 'DRIVER', 'ADMIN');

create type public.order_status as enum (
  'PENDING',          -- commande reçue
  'CONFIRMED',        -- acceptée par le restaurant
  'PREPARING',        -- en cuisine
  'READY',            -- prête, en attente d'un livreur
  'ASSIGNED',         -- livreur assigné
  'OUT_FOR_DELIVERY', -- livreur en route
  'DELIVERED',        -- livrée
  'CANCELLED'         -- annulée
);

create type public.driver_status as enum ('AVAILABLE', 'BUSY', 'OFFLINE');

create type public.option_selection as enum ('SINGLE', 'MULTIPLE');

-- -----------------------------------------------------------------------------
-- Utilitaires
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles : un profil par compte Supabase Auth (créé automatiquement)
-- Le rôle n'est JAMAIS modifiable par l'utilisateur lui-même (voir 002).
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  name        text check (char_length(name) <= 80),
  phone       text check (char_length(phone) <= 20),
  role        public.app_role not null default 'CUSTOMER',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Rôle CUSTOMER par défaut. Les métadonnées envoyées par le navigateur
  -- (raw_user_meta_data) ne sont volontairement PAS utilisées pour le rôle.
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Comptes déjà existants avant la migration
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- restaurant_settings : réglages du restaurant (une seule ligne, id = 1)
-- -----------------------------------------------------------------------------
create table public.restaurant_settings (
  id                       smallint primary key default 1
                           constraint restaurant_settings_singleton check (id = 1),
  name                     text not null default 'Houcine Chapati',
  phone                    text,
  address                  text,
  latitude                 double precision check (latitude between -90 and 90),
  longitude                double precision check (longitude between -180 and 180),
  accepting_orders         boolean not null default true,
  delivery_fee             integer not null default 0 check (delivery_fee >= 0),
  free_delivery_threshold  integer check (free_delivery_threshold >= 0),
  min_order_amount         integer not null default 0 check (min_order_amount >= 0),
  delivery_radius_km       numeric(6, 1) check (delivery_radius_km > 0),
  -- Préparé pour plus tard : montrer la position du livreur au client
  share_driver_location    boolean not null default false,
  updated_at               timestamptz not null default now()
);

create trigger restaurant_settings_updated_at before update on public.restaurant_settings
  for each row execute function private.set_updated_at();

insert into public.restaurant_settings (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- customers : coordonnées de livraison d'un client (une ligne par compte,
-- mise à jour à chaque commande). Chaque commande garde sa propre copie.
-- -----------------------------------------------------------------------------
create table public.customers (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references auth.users (id) on delete cascade,
  name                   text not null check (char_length(name) between 2 and 80),
  phone                  text not null check (phone ~ '^0[567][0-9]{8}$'),
  address                text not null check (char_length(address) between 5 and 300),
  wilaya                 text not null check (char_length(wilaya) between 2 and 60),
  commune                text not null check (char_length(commune) between 2 and 80),
  latitude               double precision check (latitude between -90 and 90),
  longitude              double precision check (longitude between -180 and 180),
  delivery_instructions  text check (char_length(delivery_instructions) <= 500),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger customers_updated_at before update on public.customers
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- drivers : livreurs (liés à un profil de rôle DRIVER)
-- -----------------------------------------------------------------------------
create table public.drivers (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null unique references public.profiles (id) on delete cascade,
  name                  text not null check (char_length(name) between 2 and 80),
  phone                 text not null check (char_length(phone) between 9 and 20),
  email                 text,
  status                public.driver_status not null default 'OFFLINE',
  active                boolean not null default true,
  current_latitude      double precision check (current_latitude between -90 and 90),
  current_longitude     double precision check (current_longitude between -180 and 180),
  last_location_update  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index drivers_status_idx on public.drivers (status) where active;

create trigger drivers_updated_at before update on public.drivers
  for each row execute function private.set_updated_at();

-- Un livreur désactivé passe automatiquement hors ligne.
create or replace function private.driver_deactivated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.active then
    new.status := 'OFFLINE';
  end if;
  return new;
end;
$$;

create trigger drivers_deactivated before update of active on public.drivers
  for each row execute function private.driver_deactivated();

-- -----------------------------------------------------------------------------
-- Menu : categories → products → option groups → options
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  image       text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index categories_sort_idx on public.categories (sort_order, name);

create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  -- restrict : on ne supprime pas une catégorie qui contient encore des produits
  category_id  uuid not null references public.categories (id) on delete restrict,
  name         text not null check (char_length(name) between 1 and 120),
  description  text check (char_length(description) <= 500),
  price        integer not null check (price >= 0),
  image_url    text,
  available    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index products_category_idx on public.products (category_id, sort_order);

create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

-- Options : ex. groupe "Taille" (SINGLE, obligatoire) ou "Suppléments" (MULTIPLE)
create table public.product_option_groups (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  selection   public.option_selection not null default 'MULTIPLE',
  required    boolean not null default false,
  max_select  integer check (max_select > 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index product_option_groups_product_idx on public.product_option_groups (product_id, sort_order);

create table public.product_options (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.product_option_groups (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  price_delta  integer not null default 0 check (price_delta >= 0),
  available    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index product_options_group_idx on public.product_options (group_id, sort_order);

-- -----------------------------------------------------------------------------
-- orders : commandes
-- Les coordonnées du client sont copiées dans la commande (historique fiable
-- même si le client change d'adresse ensuite).
-- -----------------------------------------------------------------------------
create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           text not null unique,
  customer_id            uuid not null references public.customers (id) on delete restrict,
  -- dupliqué depuis customers pour des politiques RLS et des filtres Realtime simples
  customer_user_id       uuid not null references auth.users (id) on delete cascade,
  driver_id              uuid references public.drivers (id) on delete set null,
  status                 public.order_status not null default 'PENDING',
  subtotal               integer not null check (subtotal >= 0),
  delivery_fee           integer not null default 0 check (delivery_fee >= 0),
  total                  integer not null,
  customer_name          text not null,
  customer_phone         text not null,
  customer_address       text not null,
  wilaya                 text not null,
  commune                text not null,
  customer_latitude      double precision not null check (customer_latitude between -90 and 90),
  customer_longitude     double precision not null check (customer_longitude between -180 and 180),
  delivery_instructions  text,
  additional_info        text,
  cancel_reason          text,
  confirmed_at           timestamptz,
  preparing_at           timestamptz,
  ready_at               timestamptz,
  assigned_at            timestamptz,
  out_for_delivery_at    timestamptz,
  delivered_at           timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint orders_total_check check (total = subtotal + delivery_fee),
  constraint orders_driver_required check (
    status not in ('ASSIGNED', 'OUT_FOR_DELIVERY') or driver_id is not null
  )
);
create index orders_status_idx on public.orders (status);
create index orders_created_idx on public.orders (created_at desc);
create index orders_customer_idx on public.orders (customer_user_id, created_at desc);
create index orders_driver_idx on public.orders (driver_id, status) where driver_id is not null;

create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  -- set null : supprimer un produit du menu ne casse pas l'historique
  product_id    uuid references public.products (id) on delete set null,
  product_name  text not null,
  -- copie des options choisies : [{ "id", "group", "name", "price" }]
  options       jsonb not null default '[]'::jsonb,
  quantity      integer not null check (quantity between 1 and 50),
  unit_price    integer not null check (unit_price >= 0),
  total         integer not null,
  created_at    timestamptz not null default now(),
  constraint order_items_total_check check (total = unit_price * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- Historique des statuts (frise de suivi, audit)
create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  status      public.order_status not null,
  changed_by  uuid references auth.users (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create or replace function private.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status, changed_by, note)
    values (new.id, new.status, auth.uid(),
            case when new.status = 'CANCELLED' then new.cancel_reason end);
  end if;
  return null;
end;
$$;

create trigger orders_log_status after insert or update of status on public.orders
  for each row execute function private.log_order_status();

-- -----------------------------------------------------------------------------
-- driver_locations : positions GPS envoyées par les livreurs
-- (la dernière position est aussi copiée dans drivers.current_*)
-- -----------------------------------------------------------------------------
create table public.driver_locations (
  id          bigint generated always as identity primary key,
  driver_id   uuid not null references public.drivers (id) on delete cascade,
  order_id    uuid references public.orders (id) on delete set null,
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  accuracy    real check (accuracy >= 0),
  created_at  timestamptz not null default now()
);
create index driver_locations_driver_idx on public.driver_locations (driver_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Numérotation des commandes : HC-AAMMJJ-NNN, compteur par jour (heure d'Alger)
-- -----------------------------------------------------------------------------
create table private.order_counters (
  day         date primary key,
  last_value  integer not null
);
revoke all on private.order_counters from public, anon, authenticated;
