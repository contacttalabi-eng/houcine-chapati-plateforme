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

export async function signInWithPassword(email: string, password: string) {
  const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signOut() {
  await sb().auth.signOut();
}
