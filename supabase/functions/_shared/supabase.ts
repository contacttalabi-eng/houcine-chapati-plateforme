// Utilitaires communs aux Edge Functions (Deno). Ces fonctions tournent sur les
// serveurs Supabase : c'est le SEUL endroit où la clé secrète est utilisée.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Clé secrète : nouvelles clés (SUPABASE_SECRET_KEYS) ou ancienne service_role. */
function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // format inattendu : on retombe sur la clé historique
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("Aucune clé secrète disponible dans l'environnement de la fonction.");
  return legacy;
}

/** Client avec tous les droits (contourne la RLS) — à n'utiliser qu'après vérification de l'appelant. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Vérifie le jeton de l'appelant (en-tête Authorization) et retourne son
 * identifiant et son rôle applicatif (public.profiles.role).
 */
export async function authenticate(req: Request, db: SupabaseClient) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await db.from("profiles").select("role").eq("user_id", data.user.id).maybeSingle();
  return { userId: data.user.id, role: (profile?.role as string | undefined) ?? null };
}
