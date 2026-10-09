// =============================================================================
// Edge Function « manage-drivers » — gestion des comptes livreurs
// -----------------------------------------------------------------------------
// Créer un compte Auth exige la clé secrète : impossible (et interdit) depuis le
// navigateur. L'administration appelle donc cette fonction avec son jeton ;
// la fonction vérifie que l'appelant est ADMIN avant toute action.
//
// Actions (POST JSON) :
//   { action: "create", name, phone, email, password }
//   { action: "set-password", driver_id, password }
// Déploiement : npx supabase functions deploy manage-drivers
// =============================================================================
import { authenticate, corsHeaders, json, serviceClient } from "../_shared/supabase.ts";

const PHONE = /^0[567][0-9]{8}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const db = serviceClient();
  const caller = await authenticate(req, db);
  if (!caller) return json({ error: "Session invalide : reconnectez-vous." }, 401);
  if (caller.role !== "ADMIN") return json({ error: "Action réservée aux administrateurs." }, 403);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  if (action === "create") {
    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").replace(/\s/g, "");
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (name.length < 2 || name.length > 80) return json({ error: "Nom invalide." }, 400);
    if (!PHONE.test(phone)) return json({ error: "Téléphone invalide (05, 06 ou 07 + 8 chiffres)." }, 400);
    if (!EMAIL.test(email)) return json({ error: "Email invalide." }, 400);
    if (password.length < 8) return json({ error: "Mot de passe : 8 caractères minimum." }, 400);

    const { data: created, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (error || !created.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      return json({ error: exists ? "Un compte existe déjà avec cet email." : (error?.message ?? "Création impossible.") }, 400);
    }

    const { data: driverId, error: rpcError } = await db.rpc("service_create_driver", {
      p_user_id: created.user.id, p_name: name, p_phone: phone, p_email: email,
    });
    if (rpcError) {
      await db.auth.admin.deleteUser(created.user.id); // pas de compte orphelin
      return json({ error: rpcError.message }, 400);
    }
    return json({ driver_id: driverId });
  }

  if (action === "set-password") {
    const password = String(body?.password ?? "");
    if (password.length < 8) return json({ error: "Mot de passe : 8 caractères minimum." }, 400);
    const { data: driver } = await db
      .from("drivers")
      .select("id, profiles!inner(user_id)")
      .eq("id", String(body?.driver_id ?? ""))
      .maybeSingle();
    const userId = (driver?.profiles as unknown as { user_id: string } | null)?.user_id;
    if (!userId) return json({ error: "Livreur introuvable." }, 404);
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Action inconnue." }, 400);
});
