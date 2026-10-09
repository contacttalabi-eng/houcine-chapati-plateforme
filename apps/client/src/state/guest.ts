import { sb } from "@hc/shared";

/**
 * Le client commande sans compte : au moment de valider sa première commande,
 * une session « invité » (connexion anonyme Supabase) est créée en silence sur
 * ce téléphone. Elle ne contient aucune donnée personnelle ; elle sert
 * uniquement à ce que les règles de sécurité (RLS) ne montrent à ce téléphone
 * que ses propres commandes (suivi, « Mes commandes »).
 */
export async function ensureGuestSession(): Promise<void> {
  const client = sb();
  const { data } = await client.auth.getSession();
  if (data.session) return;
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
}
