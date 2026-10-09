-- =============================================================================
-- Houcine Chapati — 009 · Inscription des livreurs par code reçu par email
-- =============================================================================
-- Migration NON DESTRUCTIVE : remplace uniquement la fonction driver_apply
-- (aucune table, aucune donnée modifiée).
--
-- Avant : la demande exigeait une connexion Google.
-- Maintenant : elle exige un email PROUVÉ, c'est-à-dire une session ouverte
-- avec le code à 6 chiffres reçu par email (« Email OTP » de Supabase) ou
-- avec Google. Une session ouverte par simple mot de passe ne suffit pas
-- (rien ne prouve que la personne possède l'adresse), une session invité non
-- plus. La preuve est lue dans le jeton signé par Supabase (claim « amr » :
-- méthodes d'authentification utilisées), pas dans ce qu'envoie le navigateur.
-- =============================================================================

create or replace function public.driver_apply(p_first_name text, p_last_name text, p_phone text)
returns public.driver_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_claims     jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_amr        jsonb;
  v_first      text := btrim(coalesce(p_first_name, ''));
  v_last       text := btrim(coalesce(p_last_name, ''));
  v_phone      text := private.normalize_dz_phone(p_phone);
  v_email      text;
  v_confirmed  timestamptz;
  v_role       public.app_role;
  v_app        public.driver_applications;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- Email prouvé : session ouverte par code email (otp / magiclink) ou par Google (oauth)
  v_amr := case when jsonb_typeof(v_claims -> 'amr') = 'array' then v_claims -> 'amr' else '[]'::jsonb end;
  if coalesce((v_claims ->> 'is_anonymous')::boolean, false)
     or not exists (
       select 1 from jsonb_array_elements(v_amr) as m(entry)
       where m.entry ->> 'method' in ('otp', 'magiclink', 'oauth')
     ) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = '42501';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_email is null or v_email = '' or v_confirmed is null then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = '42501';
  end if;

  select p.role into v_role from public.profiles p where p.user_id = v_uid;
  if v_role is distinct from 'CUSTOMER' then
    raise exception 'ALREADY_STAFF';
  end if;

  if char_length(v_first) not between 2 and 40 then raise exception 'INVALID_FIRST_NAME'; end if;
  if char_length(v_last) not between 2 and 40 then raise exception 'INVALID_LAST_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;

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

revoke all on function public.driver_apply(text, text, text) from public, anon;
grant execute on function public.driver_apply(text, text, text) to authenticated;
