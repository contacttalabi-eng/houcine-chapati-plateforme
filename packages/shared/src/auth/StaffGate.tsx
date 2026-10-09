import { KeyRound, LogOut, Mail, ShieldAlert } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { errorMessage } from "../domain/errors";
import { isDemoMode } from "../env";
import { signInWithPassword, signOut, useProfile, useSession } from "../hooks/session";
import type { AppRole, Profile } from "../types";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/form";
import { Card, EmptyState, FullScreenLoader, Logo } from "../ui/primitives";

function LoginScreen({ title, subtitle }: { title: string; subtitle: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm p-6 shadow-xl animate-fade-up sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={88} />
          <h1 className="mt-3 font-display text-3xl uppercase tracking-wide">{title}</h1>
          <p className="text-sm text-fg-muted">{subtitle}</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Email">
            {(p) => (
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
                <Input {...p} type="email" autoComplete="username" inputMode="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} className="pl-10" placeholder="vous@exemple.com" />
              </div>
            )}
          </Field>
          <Field label="Mot de passe">
            {(p) => (
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
                <Input {...p} type="password" autoComplete="current-password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} className="pl-10" />
              </div>
            )}
          </Field>
          {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-500" role="alert">{error}</p>}
          {isDemoMode && (
            <p className="rounded-xl border border-dashed border-amber/60 bg-amber/10 px-3 py-2 text-sm text-fg-muted">
              <b className="text-fg">Mode démo local</b> — admin : admin@demo.dz · livreurs : karim@demo.dz, yanis@demo.dz ·
              mot de passe : demo1234
            </p>
          )}
          <Button type="submit" size="lg" full loading={loading} disabled={!email || !password}>Se connecter</Button>
        </form>
      </Card>
    </main>
  );
}

interface StaffGateProps {
  role: Extract<AppRole, "ADMIN" | "DRIVER">;
  title: string;
  subtitle: string;
  children: (ctx: { session: Session; profile: Profile }) => ReactNode;
}

/**
 * Connexion obligatoire + vérification du rôle (lu dans profiles, non
 * modifiable par l'utilisateur). La vraie protection reste la RLS côté
 * serveur : cet écran évite seulement d'afficher une interface inutilisable.
 */
export function StaffGate({ role, title, subtitle, children }: StaffGateProps) {
  const session = useSession();
  const { profile, error, reload } = useProfile(session?.user.id);

  if (session === undefined || (session && profile === undefined)) return <FullScreenLoader />;
  if (!session) return <LoginScreen title={title} subtitle={subtitle} />;

  if (!profile || profile.role !== role) {
    return (
      <main className="grid min-h-dvh place-items-center p-4">
        <Card className="max-w-md">
          <EmptyState
            icon={<ShieldAlert className="size-7 text-brand" />}
            title="Accès refusé"
            action={
              <div className="flex gap-2">
                {error ? <Button variant="secondary" onClick={reload}>Réessayer</Button> : null}
                <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
                  Changer de compte
                </Button>
              </div>
            }
          >
            {error
              ? errorMessage(error)
              : `Le compte ${session.user.email ?? ""} n'a pas le rôle ${role === "ADMIN" ? "administrateur" : "livreur"}.`}
          </EmptyState>
        </Card>
      </main>
    );
  }

  return <>{children({ session, profile })}</>;
}
