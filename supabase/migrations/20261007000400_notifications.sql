-- =============================================================================
-- Houcine Chapati — 004 · Notifications
-- -----------------------------------------------------------------------------
-- Chaque événement de commande crée une ligne dans public.notifications :
--   CLIENT  : reçue, confirmée, en préparation, prête, livreur assigné,
--             en livraison, livrée, annulée
--   ADMIN   : nouvelle commande, annulation par le client
--   LIVREUR : nouvelle commande assignée, commande retirée / annulée
--
-- Aujourd'hui : les applications reçoivent ces lignes via Supabase Realtime
-- (toast, son, vibration, notification du navigateur).
-- Plus tard : un Database Webhook sur INSERT appelle l'Edge Function
-- "dispatch-notification", qui envoie Push / WhatsApp / SMS selon `channels`
-- et trace chaque envoi dans public.notification_deliveries.
-- =============================================================================

create table public.notifications (
  id                 bigint generated always as identity primary key,
  audience           public.app_role not null,
  -- null = tous les administrateurs
  recipient_user_id  uuid references auth.users (id) on delete cascade,
  order_id           uuid references public.orders (id) on delete cascade,
  type               text not null,
  title              text not null,
  body               text not null,
  data               jsonb not null default '{}'::jsonb,
  -- canaux souhaités ; 'in_app' = Realtime. Ajouter 'push', 'whatsapp', 'sms' plus tard.
  channels           text[] not null default array['in_app'],
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  constraint notifications_recipient_check
    check (recipient_user_id is not null or audience = 'ADMIN')
);
create index notifications_recipient_idx on public.notifications (recipient_user_id, created_at desc);
create index notifications_admin_idx on public.notifications (created_at desc) where recipient_user_id is null;
create index notifications_order_idx on public.notifications (order_id);

-- Journal des envois externes (Push / WhatsApp / SMS) — utilisé par l'Edge Function
create table public.notification_deliveries (
  id                   bigint generated always as identity primary key,
  notification_id      bigint not null references public.notifications (id) on delete cascade,
  channel              text not null check (channel in ('push', 'whatsapp', 'sms')),
  status               text not null default 'PENDING'
                       check (status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts             integer not null default 0,
  provider_message_id  text,
  last_error           text,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);
create index notification_deliveries_notification_idx on public.notification_deliveries (notification_id);

-- Abonnements Web Push (prévu pour plus tard : un par navigateur)
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.notifications           enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.push_subscriptions      enable row level security;

revoke all on public.notifications, public.notification_deliveries, public.push_subscriptions
  from anon, authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.notification_deliveries to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

create policy "notifications: destinataire ou admins"
  on public.notifications for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or (recipient_user_id is null and audience = 'ADMIN' and (select private.is_admin()))
  );

create policy "notifications: marquer comme lue"
  on public.notifications for update to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or (recipient_user_id is null and audience = 'ADMIN' and (select private.is_admin()))
  )
  with check (
    recipient_user_id = (select auth.uid())
    or (recipient_user_id is null and audience = 'ADMIN' and (select private.is_admin()))
  );

create policy "notification deliveries: admin"
  on public.notification_deliveries for select to authenticated
  using ((select private.is_admin()));

create policy "push subscriptions: les siennes"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push subscriptions: ajouter la sienne"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "push subscriptions: supprimer la sienne"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Génération automatique à chaque événement de commande
-- -----------------------------------------------------------------------------
create or replace function private.driver_user_id(p_driver_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id from public.drivers d join public.profiles p on p.id = d.profile_id
  where d.id = p_driver_id;
$$;

create or replace function private.notify_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body  text;
  v_data  jsonb := jsonb_build_object(
    'order_id', new.id, 'order_number', new.order_number, 'status', new.status
  );
  v_driver_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (audience, recipient_user_id, order_id, type, title, body, data)
    values
      ('ADMIN', null, new.id, 'ORDER_CREATED',
       '🔔 Nouvelle commande ' || new.order_number,
       new.customer_name || ' · ' || new.commune || ' · ' || new.total || ' DA', v_data),
      ('CUSTOMER', new.customer_user_id, new.id, 'ORDER_STATUS',
       '🟡 Commande reçue',
       'Votre commande ' || new.order_number || ' a bien été reçue par le restaurant.', v_data);
    return null;
  end if;

  -- Changement de statut → client
  if new.status is distinct from old.status then
    if new.status = 'ASSIGNED' then
      select d.name into v_driver_name from public.drivers d where d.id = new.driver_id;
    end if;

    select t.title, t.body into v_title, v_body
    from (values
      ('CONFIRMED'::public.order_status, '✅ Commande confirmée', 'Le restaurant a accepté votre commande.'),
      ('PREPARING', '🟠 En préparation', 'Votre commande est en cours de préparation.'),
      ('READY', '🟢 Commande prête', 'Votre commande est prête, un livreur va la prendre en charge.'),
      ('ASSIGNED', '🛵 Livreur assigné',
         coalesce(v_driver_name, 'Un livreur') || ' va vous livrer.'),
      ('OUT_FOR_DELIVERY', '🔵 Livreur en route', 'Votre commande est en chemin.'),
      ('DELIVERED', '✅ Votre commande a été livrée', 'Bon appétit !'),
      ('CANCELLED', '❌ Commande annulée',
         coalesce('Motif : ' || new.cancel_reason, 'Votre commande a été annulée.'))
    ) as t(status, title, body)
    where t.status = new.status;

    if v_title is not null then
      insert into public.notifications (audience, recipient_user_id, order_id, type, title, body, data)
      values ('CUSTOMER', new.customer_user_id, new.id, 'ORDER_STATUS', v_title,
              new.order_number || ' · ' || v_body, v_data);
    end if;

    -- Annulation : prévenir les admins si c'est le client, le livreur s'il y en a un
    if new.status = 'CANCELLED' then
      if auth.uid() = new.customer_user_id then
        insert into public.notifications (audience, recipient_user_id, order_id, type, title, body, data)
        values ('ADMIN', null, new.id, 'ORDER_CANCELLED_BY_CUSTOMER',
                '❌ Commande ' || new.order_number || ' annulée par le client', new.customer_name, v_data);
      end if;
      if new.driver_id is not null and new.driver_id is not distinct from old.driver_id then
        insert into public.notifications (audience, recipient_user_id, order_id, type, title, body, data)
        values ('DRIVER', private.driver_user_id(new.driver_id), new.id, 'ORDER_CANCELLED',
                '❌ Commande ' || new.order_number || ' annulée', 'Ne pas livrer cette commande.', v_data);
      end if;
    end if;
  end if;

  -- Assignation / réassignation → livreurs
  if new.driver_id is distinct from old.driver_id then
    if new.driver_id is not null then
      insert into public.notifications (audience, recipient_user_id, order_id, type, title, body, data)
      values ('DRIVER', private.driver_user_id(new.driver_id), new.id, 'DRIVER_ASSIGNED',
              '🚴 Nouvelle commande ' || new.order_number,
              new.customer_address || ', ' || new.commune || ' · ' || new.total || ' DA', v_data);
    end if;
    if old.driver_id is not null then
      insert into public.notifications (audience, recipient_user_id, order_id, type, title, body, data)
      values ('DRIVER', private.driver_user_id(old.driver_id), new.id, 'DRIVER_UNASSIGNED',
              'Commande ' || new.order_number || ' retirée', 'Elle a été confiée à un autre livreur.', v_data);
    end if;
  end if;

  return null;
end;
$$;

create trigger orders_notify after insert or update of status, driver_id on public.orders
  for each row execute function private.notify_order_event();
