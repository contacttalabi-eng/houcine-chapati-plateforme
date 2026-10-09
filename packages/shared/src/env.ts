/**
 * Variables d'environnement publiques (préfixe VITE_, incluses dans le code
 * envoyé au navigateur). Aucune clé secrète ne doit passer par ici : la
 * fonction checkPublicKey bloque le démarrage si une clé secrète est détectée.
 */
const raw = import.meta.env;

export const env = {
  supabaseUrl: (raw.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, ""),
  supabaseKey: (raw.VITE_SUPABASE_PUBLISHABLE_KEY || raw.VITE_SUPABASE_ANON_KEY || "").trim(),
  mapsApiKey: (raw.VITE_GOOGLE_MAPS_API_KEY ?? "").trim(),
  /** DEMO_MAP_ID : identifiant de démonstration Google, à remplacer en production. */
  mapId: (raw.VITE_GOOGLE_MAPS_MAP_ID ?? "").trim() || "DEMO_MAP_ID",
} as const;

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseKey);
export const isMapsConfigured = Boolean(env.mapsApiKey);

/** Retourne un message d'erreur si la clé fournie n'est pas une clé publique. */
export function checkPublicKey(key: string): string | null {
  if (key.startsWith("sb_secret_")) {
    return "La clé configurée est une clé SECRÈTE Supabase. Utilisez la clé publique (publishable / anon).";
  }
  const payload = key.split(".")[1];
  if (payload) {
    try {
      const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
      if (json.role === "service_role") {
        return "La clé configurée est la clé service_role. Elle ne doit jamais être utilisée dans le navigateur.";
      }
    } catch {
      // clé non-JWT (publishable) : rien à vérifier
    }
  }
  return null;
}

/**
 * Mode démo local (npm run demo) : API Supabase simulée sur ce poste.
 * Détecté par la clé de démo plutôt que par l'hôte : le serveur de démo peut
 * exposer son adresse réseau local (ex. 192.168.x.x) plutôt que "localhost"
 * pour rester utilisable depuis un téléphone sur le même Wi-Fi.
 */
export const isDemoMode = env.supabaseKey === "sb_publishable_demo_local";
