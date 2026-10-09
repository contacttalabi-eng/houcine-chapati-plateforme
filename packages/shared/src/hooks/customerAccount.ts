import { normalizeDzPhone } from "../domain/phone";
import { sb } from "../supabase";
import type { Profile } from "../types";

/**
 * Compte client "vrai compte" : connexion par Google (qui vérifie l'identité),
 * puis une seule fois, complétion du profil (prénom, nom, téléphone) stockée
 * dans public.profiles. Remplace les anciennes sessions anonymes : les
 * commandes d'un client suivent désormais son compte, pas son navigateur.
 */

const RETURN_PATH_KEY = "hc-post-login-path";

/**
 * Lance la connexion Google (redirection complète du navigateur). Mémorise la
 * page en cours pour y revenir une fois la connexion terminée.
 */
export async function signInWithGoogle(returnPath?: string): Promise<void> {
  try {
    const current = window.location.hash.replace(/^#/, "") || "/";
    sessionStorage.setItem(RETURN_PATH_KEY, returnPath ?? current);
  } catch {
    // stockage indisponible : on retombera simplement sur l'accueil
  }
  const { error } = await sb().auth.signInWithOAuth({
    provider: "google",
    options: {
      // Sans le hash : Google/Supabase renvoient ?code=..., qui ne doit pas
      // entrer en conflit avec notre routage par hash (#/commander...).
      redirectTo: `${window.location.origin}${window.location.pathname}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

/**
 * À appeler une fois au chargement de l'application : si une connexion
 * Google vient de se terminer, renvoie la page à laquelle revenir (et
 * l'oublie). Rien à faire en dehors de ce cas (retourne null).
 */
export function consumePostLoginPath(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);
    return path;
  } catch {
    return null;
  }
}

/** Un compte est complet une fois le prénom+nom et le téléphone renseignés. */
export function isProfileComplete(profile: Profile | null | undefined): boolean {
  return Boolean(profile && profile.name && profile.name.trim().length >= 2 && profile.phone);
}

export interface CompleteProfileInput {
  firstName: string;
  lastName: string;
  phone: string;
}

/** Finalise l'inscription après la connexion Google (prénom, nom, téléphone). */
export async function completeCustomerProfile(userId: string, input: CompleteProfileInput): Promise<Profile> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = normalizeDzPhone(input.phone);
  if (firstName.length < 2) throw new Error("INVALID_FIRST_NAME");
  if (lastName.length < 2) throw new Error("INVALID_LAST_NAME");
  if (!phone) throw new Error("INVALID_PHONE");

  const { data, error } = await sb()
    .from("profiles")
    .update({ name: `${firstName} ${lastName}`, phone })
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}
