import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkPublicKey, env, isSupabaseConfigured } from "./env";

export type AppName = "client" | "admin" | "livreur";

let client: SupabaseClient | null = null;

/**
 * Crée le client Supabase de l'application (une seule fois, au démarrage).
 * Chaque application garde sa session sous sa propre clé de stockage : un
 * admin et un livreur peuvent être connectés dans le même navigateur.
 */
export function configureSupabase(app: AppName): SupabaseClient | null {
  if (client) return client;
  if (!isSupabaseConfigured) return null;
  const problem = checkPublicKey(env.supabaseKey);
  if (problem) throw new Error(problem);

  client = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: {
      storageKey: `hc-${app}-auth`,
      persistSession: true,
      autoRefreshToken: true,
      // PKCE (plutôt que le flux "implicit" par défaut) renvoie le code dans
      // l'URL via ?code=... et non #access_token=... : compatible avec notre
      // routage par hash (#/commander, #/suivi/<id>…) utilisé par l'app client.
      flowType: "pkce",
      // L'app livreur utilise la connexion Google (inscription des livreurs) ;
      // l'administration garde detectSessionInUrl désactivé (rien à détecter).
      detectSessionInUrl: app === "client" || app === "livreur",
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

/** Client Supabase configuré (erreur explicite si configureSupabase n'a pas été appelé). */
export function sb(): SupabaseClient {
  if (!client) throw new Error("Supabase n'est pas configuré (voir .env).");
  return client;
}
