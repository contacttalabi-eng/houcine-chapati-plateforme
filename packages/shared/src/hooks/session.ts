import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchProfile } from "../api/people";
import { sb } from "../supabase";
import type { Profile } from "../types";

/**
 * Session Supabase Auth courante. undefined = en cours de chargement.
 *
 * getSession() lit uniquement le stockage local, sans vérifier auprès du
 * serveur : une session gardée dans le navigateur mais devenue invalide côté
 * serveur (compte supprimé, jeton révoqué — ou, en mode démo, un redémarrage
 * du serveur qui efface les comptes en mémoire) serait sinon traitée comme
 * valide, et chaque appel échouerait ensuite avec "Vous n'avez pas les droits
 * pour cette action." On valide donc une fois auprès du serveur (getUser) et,
 * si elle est rejetée, on déconnecte proprement pour revenir à l'écran de
 * connexion plutôt que de laisser échouer chaque action en silence.
 */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const client = sb();
    let mounted = true;
    void client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        void client.auth.getUser().then(({ error }) => {
          if (mounted && error) void client.auth.signOut();
        });
      }
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return session;
}

/**
 * Profil (rôle, nom, téléphone) du compte connecté.
 * undefined = en cours de chargement ; null = aucun compte ou profil introuvable.
 * Le profil chargé est rattaché à son compte : tant que celui du compte courant
 * n'est pas arrivé, on renvoie undefined (et non un null périmé, qui faisait
 * croire un instant à un profil vide après un rechargement).
 */
export function useProfile(userId: string | undefined) {
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(() => {
    if (!userId) return;
    setError(null);
    fetchProfile(userId).then(
      (profile) => setLoaded({ userId, profile }),
      (e: unknown) => {
        setError(e);
        setLoaded({ userId, profile: null });
      },
    );
  }, [userId]);
  useEffect(reload, [reload]);
  const profile = !userId ? null : loaded?.userId === userId ? loaded.profile : undefined;
  return { profile, error, reload };
}

/**
 * Méthodes utilisées pour ouvrir la session, lues dans le jeton signé par
 * Supabase (claim « amr ») : "password", "email/signup" (code de confirmation
 * d'inscription), "recovery" (code de réinitialisation), "oauth" (Google)…
 * La base vérifie la même information côté serveur.
 */
export function sessionMethods(session: Session | null | undefined): string[] {
  try {
    const payload = JSON.parse(atob(session!.access_token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return Array.isArray(payload.amr) ? payload.amr.map((m: { method?: string }) => String(m.method ?? "")) : [];
  } catch {
    return [];
  }
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
}

/**
 * Création de compte (email + mot de passe). L'email n'est pas encore prouvé :
 * un code à 6 chiffres est envoyé (modèle « Confirm signup », {{ .Token }} —
 * voir README) et doit être validé par confirmSignupCode avant toute session.
 */
export async function signUpWithPassword(email: string, password: string): Promise<void> {
  const { data, error } = await sb().auth.signUp({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  // Supabase ne révèle jamais qu'un email est déjà pris : un compte existant
  // renvoie un utilisateur sans nouvelle identité plutôt qu'une erreur.
  if (data.user && data.user.identities?.length === 0) throw new Error("EMAIL_ALREADY_USED");
}

/** Valide le code envoyé à l'inscription : ouvre la session (email prouvé). */
export async function confirmSignupCode(email: string, code: string): Promise<void> {
  const { error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\D/g, ""), type: "signup" });
  if (error) throw error;
}

/** Renvoie le code de confirmation d'inscription. */
export async function resendSignupCode(email: string): Promise<void> {
  const { error } = await sb().auth.resend({ type: "signup", email: email.trim().toLowerCase() });
  if (error) throw error;
}

/**
 * Mot de passe oublié : envoie un code à 6 chiffres (modèle « Reset Password »,
 * {{ .Token }} — voir README). Ne révèle jamais si l'email existe ou non.
 */
export async function sendPasswordResetCode(email: string): Promise<void> {
  const { error } = await sb().auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) throw error;
}

/** Valide le code de réinitialisation : ouvre une session (email prouvé). */
export async function confirmPasswordResetCode(email: string, code: string): Promise<void> {
  const { error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\D/g, ""), type: "recovery" });
  if (error) throw error;
}

/** Définit le nouveau mot de passe (session de réinitialisation déjà ouverte). */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await sb().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  await sb().auth.signOut();
}
