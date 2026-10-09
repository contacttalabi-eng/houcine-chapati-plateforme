-- =============================================================================
-- Houcine Chapati — 007 · Inscription des livreurs (demande + validation)
-- =============================================================================
-- Migration ADDITIVE : nouvelle table + nouvelles fonctions. Rien n'est
-- supprimé ni modifié dans les tables existantes.
--
-- Un livreur peut s'inscrire lui-même depuis l'application livreur :
--   1. il se connecte avec Google (identité et email vérifiés par Google) ;
--   2. il donne son prénom, son nom et son téléphone → demande « PENDING » ;
--   3. un administrateur approuve (le compte devient DRIVER, fiche livreur
--      créée par private.make_driver) ou refuse.
-- Tant que la demande n'est pas approuvée, le compte reste CUSTOMER : il ne
-- voit aucune commande ni aucune donnée client (RLS inchangée).
-- =============================================================================

create type public.driver_application_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create table public.driver_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  first_name  text not null check (char_length(first_name) between 2 and 40),
  last_name   text not null check (char_length(last_name) between 2 and 40),
  phone       text not null check (char_length(phone) between 9 and 20),
  email       text not null check (char_length(email) between 3 and 254),
  status      public.driver_application_status not null default 'PENDING',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references auth.users (id) on delete set null
);
create index driver_applications_pending_idx on public.driver_applications (created_at) where status = 'PENDING';

-- ----------------------------------------------------------------------------- sécurité
alter table public.driver_applications enable row level security;
revoke all on public.driver_applications from anon, authenticated;
grant select on public.driver_applications to authenticated;

-- Lecture : sa propre demande, ou toutes pour un administrateur.
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.
create policy "driver_applications: la sienne ou admin"
  on public.driver_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ----------------------------------------------------------------------------- demande
-- Appelée par l'application livreur après la connexion Google.
create or replace function public.driver_apply(p_first_name text, p_last_name text, p_phone text)
returns public.driver_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_claims     jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_first      text := btrim(coalesce(p_first_name, ''));
  v_last       text := btrim(coalesce(p_last_name, ''));
  v_phone      text := private.normalize_dz_phone(p_phone);
  v_email      text;
  v_role       public.app_role;
  v_app        public.driver_applications;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  -- Compte vérifié par Google uniquement (pas de session invité, pas de simple email)
  if coalesce((v_claims ->> 'is_anonymous')::boolean, false)
     or not (coalesce(v_claims -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
             or v_claims -> 'app_metadata' ->> 'provider' = 'google') then
    raise exception 'GOOGLE_REQUIRED' using errcode = '42501';
  end if;

  select p.role into v_role from public.profiles p where p.user_id = v_uid;
  if v_role is distinct from 'CUSTOMER' then
    raise exception 'ALREADY_STAFF';
  end if;

  if char_length(v_first) not between 2 and 40 then raise exception 'INVALID_FIRST_NAME'; end if;
  if char_length(v_last) not between 2 and 40 then raise exception 'INVALID_LAST_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is null or v_email = '' then
    raise exception 'GOOGLE_REQUIRED' using errcode = '42501';
  end if;

  -- Nouvelle demande, ou nouvelle tentative après un refus ; une demande
  -- déjà approuvée n'est jamais modifiée ici.
  insert into public.driver_applications (user_id, first_name, last_name, phone, email)
  values (v_uid, v_first, v_last, v_phone, v_email)
  on conflict (user_id) do update set
    first_name = excluded.first_name, last_name = excluded.last_name, phone = excluded.phone,
    email = excluded.email, status = 'PENDING', created_at = now(), decided_at = null, decided_by = null
  where public.driver_applications.status <> 'APPROVED'
  returning * into v_app;

  if v_app.id is null then
    raise exception 'ALREADY_STAFF';
  end if;

  update public.profiles set name = v_first || ' ' || v_last, phone = v_phone where user_id = v_uid;

  -- Prévient les administrateurs (toast + son dans l'administration)
  insert into public.notifications (audience, recipient_user_id, type, title, body, data)
  values ('ADMIN', null, 'driver_application', 'Nouvelle demande de livreur',
          v_first || ' ' || v_last || ' · ' || v_phone,
          jsonb_build_object('application_id', v_app.id));

  return v_app;
end;
$$;

-- ----------------------------------------------------------------------------- décision
create or replace function public.admin_decide_driver_application(p_application_id uuid, p_approve boolean)
returns public.driver_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.driver_applications;
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_app from public.driver_applications where id = p_application_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_app.status <> 'PENDING' then raise exception 'ALREADY_DECIDED'; end if;

  if p_approve then
    -- Compte DRIVER + fiche livreur (même fonction que la création par l'administration)
    perform private.make_driver(v_app.user_id, v_app.first_name || ' ' || v_app.last_name, v_app.phone, v_app.email);
  end if;

  update public.driver_applications
  set status = case when p_approve then 'APPROVED'::public.driver_application_status else 'REJECTED' end,
      decided_at = now(), decided_by = auth.uid()
  where id = p_application_id
  returning * into v_app;

  insert into public.notifications (audience, recipient_user_id, type, title, body, data)
  values ('DRIVER', v_app.user_id, 'driver_application_decision',
          case when p_approve then 'Compte livreur validé' else 'Demande de livreur refusée' end,
          case when p_approve then 'Bienvenue chez Houcine Chapati ! Vous pouvez recevoir des commandes.'
               else 'Le restaurant n''a pas validé votre demande. Contactez-le pour plus d''informations.' end,
          jsonb_build_object('application_id', v_app.id, 'status', v_app.status));

  return v_app;
end;
$$;

revoke all on function public.driver_apply(text, text, text) from public, anon;
grant execute on function public.driver_apply(text, text, text) to authenticated;
revoke all on function public.admin_decide_driver_application(uuid, boolean) from public, anon;
grant execute on function public.admin_decide_driver_application(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------- temps réel
-- Administration : nouvelles demandes en direct ; livreur : validation en direct.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_applications') then
    alter publication supabase_realtime add table public.driver_applications;
  end if;
end;
$$;
