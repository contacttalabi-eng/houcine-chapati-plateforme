// =============================================================================
// Edge Function « dispatch-notification » — canaux externes (préparé pour plus tard)
// -----------------------------------------------------------------------------
// Aujourd'hui, les notifications sont livrées en temps réel dans les applications
// (Supabase Realtime sur public.notifications). Cette fonction est le point
// d'extension pour Push / WhatsApp / SMS :
//
//   1. Supabase → Database → Webhooks → « Create a new hook »
//      table public.notifications, événement INSERT, type « Supabase Edge Functions »,
//      fonction dispatch-notification, en-tête  x-webhook-secret: <NOTIFY_WEBHOOK_SECRET>
//   2. npx supabase secrets set NOTIFY_WEBHOOK_SECRET=... (+ les clés du fournisseur)
//   3. Ajouter 'whatsapp' / 'sms' / 'push' dans notifications.channels (trigger SQL
//      private.notify_order_event) pour les événements à envoyer.
//   4. Implémenter l'envoi dans le fournisseur voulu ci-dessous.
//
// Chaque tentative est tracée dans public.notification_deliveries.
// =============================================================================
import { corsHeaders, json, serviceClient } from "../_shared/supabase.ts";

type Channel = "push" | "whatsapp" | "sms";

interface NotificationRow {
  id: number;
  audience: "CUSTOMER" | "DRIVER" | "ADMIN";
  recipient_user_id: string | null;
  order_id: string | null;
  title: string;
  body: string;
  channels: string[];
}

interface Recipient {
  userId: string | null;
  phone: string | null;
}

interface SendResult {
  status: "SENT" | "FAILED" | "SKIPPED";
  providerMessageId?: string;
  error?: string;
}

type Provider = (n: NotificationRow, to: Recipient) => Promise<SendResult>;

/**
 * Fournisseurs. Chacun renvoie SKIPPED tant qu'il n'est pas configuré.
 * Brancher ici l'API choisie (ex. WhatsApp Cloud API de Meta, un opérateur SMS
 * algérien, Web Push avec les abonnements de public.push_subscriptions).
 */
const providers: Record<Channel, Provider> = {
  whatsapp: async (_n, to) => {
    if (!Deno.env.get("WHATSAPP_TOKEN") || !Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")) {
      return { status: "SKIPPED", error: "WhatsApp non configuré" };
    }
    if (!to.phone) return { status: "SKIPPED", error: "Pas de numéro" };
    // À implémenter : POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages
    // avec un modèle de message approuvé (obligatoire pour les messages initiés par l'entreprise).
    return { status: "SKIPPED", error: "Envoi WhatsApp à implémenter" };
  },
  sms: async (_n, to) => {
    if (!Deno.env.get("SMS_API_KEY")) return { status: "SKIPPED", error: "SMS non configuré" };
    if (!to.phone) return { status: "SKIPPED", error: "Pas de numéro" };
    // À implémenter : appel HTTP à l'API du fournisseur SMS.
    return { status: "SKIPPED", error: "Envoi SMS à implémenter" };
  },
  push: async (_n, to) => {
    if (!Deno.env.get("VAPID_PRIVATE_KEY")) return { status: "SKIPPED", error: "Web Push non configuré" };
    if (!to.userId) return { status: "SKIPPED", error: "Pas de destinataire" };
    // À implémenter : envoyer à chaque abonnement de public.push_subscriptions (user_id = to.userId).
    return { status: "SKIPPED", error: "Envoi Web Push à implémenter" };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("NOTIFY_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return json({ error: "Non autorisé" }, 401);
  }

  const payload = (await req.json().catch(() => null)) as { type?: string; record?: NotificationRow } | null;
  const n = payload?.record;
  if (payload?.type !== "INSERT" || !n) return json({ ignored: true });

  const channels = n.channels.filter((c): c is Channel => c === "push" || c === "whatsapp" || c === "sms");
  if (channels.length === 0) return json({ ignored: true });

  const db = serviceClient();
  const to = await resolveRecipient(db, n);
  const results: Record<string, SendResult> = {};

  for (const channel of channels) {
    let result: SendResult;
    try {
      result = await providers[channel](n, to);
    } catch (error) {
      result = { status: "FAILED", error: (error as Error).message };
    }
    results[channel] = result;
    await db.from("notification_deliveries").insert({
      notification_id: n.id,
      channel,
      status: result.status,
      attempts: 1,
      provider_message_id: result.providerMessageId ?? null,
      last_error: result.error ?? null,
      sent_at: result.status === "SENT" ? new Date().toISOString() : null,
    });
  }
  return json({ results });
});

async function resolveRecipient(db: ReturnType<typeof serviceClient>, n: NotificationRow): Promise<Recipient> {
  if (n.audience === "CUSTOMER" && n.order_id) {
    const { data } = await db.from("orders").select("customer_phone").eq("id", n.order_id).maybeSingle();
    return { userId: n.recipient_user_id, phone: (data?.customer_phone as string | undefined) ?? null };
  }
  if (n.audience === "DRIVER" && n.recipient_user_id) {
    const { data } = await db
      .from("drivers")
      .select("phone, profiles!inner(user_id)")
      .eq("profiles.user_id", n.recipient_user_id)
      .maybeSingle();
    return { userId: n.recipient_user_id, phone: (data?.phone as string | undefined) ?? null };
  }
  return { userId: n.recipient_user_id, phone: Deno.env.get("ADMIN_ALERT_PHONE") ?? null };
}
