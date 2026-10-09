import {
  Button, Card, EmptyState, Field, FullScreenLoader, Input, Logo, applyAsDriver, errorMessage, fetchMyDriverApplication,
  formatPhone, isDemoMode, signInWithGoogle, signInWithPassword, signOut, toast, useProfile, useRealtime, useSession,
  type DriverApplication, type Profile,
} from "@hc/shared";
import type { Session } from "@supabase/supabase-js";
import { Clock, KeyRound, LogOut, Mail, ShieldAlert, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

/** Logo Google officiel (lucide-react n'a pas d'icônes de marque). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.48a5.55 5.55 0 0 1-2.4 3.64v3h3.88c2.27-2.09 3.56-5.17 3.56-8.83Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.26a12 12 0 0 0 0 10.78l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.61l4.01 3.1C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <Card className="w-full max-w-sm p-6 shadow-xl animate-fade-up sm:p-8">{children}</Card>
    </main>
  );
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <Logo size={80} />
      <h1 className="mt-3 font-display text-3xl uppercase tracking-wide">Espace livreur</h1>
      <p className="text-sm text-fg-muted">{subtitle}</p>
    </div>
  );
}

function LogoutButton({ label = "Changer de compte" }: { label?: string }) {
  return (
    <Button variant="secondary" full icon={<LogOut className="size-4" />} onClick={() => void signOut()}>{label}</Button>
  );
}

const isGoogleAccount = (session: Session) => {
  const meta = session.user.app_metadata as { provider?: string; providers?: string[] };
  return meta.provider === "google" || Boolean(meta.providers?.includes("google"));
};

// ----------------------------------------------------------------- accueil : Google ou mot de passe

function DriverWelcome() {
  const [google, setGoogle] = useState(false);
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
    <Screen>
      <Brand subtitle="Houcine Chapati — livraisons" />
      <Button size="lg" full variant="secondary" loading={google} icon={!google && <GoogleIcon className="size-5" />}
        onClick={async () => {
          setGoogle(true);
          try {
            await signInWithGoogle("/");
          } catch (err) {
            toast.error(errorMessage(err));
            setGoogle(false);
          }
        }}>
        Continuer avec Google
      </Button>
      <p className="mt-2 text-center text-xs text-fg-muted">
        Nouveau livreur ? Inscrivez-vous avec Google : le restaurant valide ensuite votre compte.
      </p>

      <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase text-fg-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" />
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
        <Button type="submit" size="lg" full loading={loading} disabled={!email || !password}>Se connecter</Button>
      </form>
      {isDemoMode && (
        <p className="mt-4 rounded-xl border border-dashed border-amber/60 bg-amber/10 px-3 py-2 text-xs text-fg-muted">
          <b className="text-fg">Mode démo</b> — livreurs existants : karim@demo.dz, yanis@demo.dz (mot de passe demo1234).
          « Continuer avec Google » simule un nouveau livreur (aucun vrai Google n'est contacté).
        </p>
      )}
    </Screen>
  );
}

// ----------------------------------------------------------------- inscription

function SignupForm({ session, previous, onSent }: {
  session: Session;
  previous: DriverApplication | null;
  onSent: (a: DriverApplication) => void;
}) {
  const meta = session.user.user_metadata as { full_name?: string; name?: string } | null;
  const parts = (meta?.full_name ?? meta?.name ?? "").trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(previous?.first_name ?? (parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "")));
  const [lastName, setLastName] = useState(previous?.last_name ?? (parts.length > 1 ? parts.at(-1)! : ""));
  const [phone, setPhone] = useState(previous?.phone ?? "");
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      onSent(await applyAsDriver({ firstName, lastName, phone }));
      toast.success("Demande envoyée au restaurant");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const field = code === "INVALID_FIRST_NAME" ? "firstName" : code === "INVALID_LAST_NAME" ? "lastName" : code === "INVALID_PHONE" ? "phone" : null;
      if (field) setErrors({ [field]: errorMessage(error) });
      else toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <div className="mb-5 flex flex-col items-center text-center">
        <div className="grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-500"><UserRound className="size-7" /></div>
        <h1 className="mt-3 text-xl font-extrabold">Inscription livreur</h1>
        <p className="mt-1 text-sm text-fg-muted">Votre identité est confirmée par Google. Complétez votre fiche :</p>
      </div>
      {previous?.status === "REJECTED" && (
        <p className="mb-4 flex gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-500" role="alert">
          <XCircle className="mt-0.5 size-4 shrink-0" /> Votre précédente demande a été refusée. Vous pouvez en envoyer une nouvelle.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" required error={errors.firstName}>
            {(p) => <Input {...p} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={40} autoComplete="given-name" />}
          </Field>
          <Field label="Nom" required error={errors.lastName}>
            {(p) => <Input {...p} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={40} autoComplete="family-name" />}
          </Field>
        </div>
        <Field label="Téléphone" required error={errors.phone} hint="Le restaurant et les clients vous joindront sur ce numéro.">
          {(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="05 55 12 34 56" maxLength={20} />}
        </Field>
        <Field label="Email" hint="Celui de votre compte Google (confirmé par Google).">
          {(p) => (
            <div className="relative">
              <Input {...p} type="email" value={session.user.email ?? ""} readOnly autoComplete="email" className="pr-10" />
              <ShieldCheck className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-emerald-500" aria-label="Confirmé par Google" />
            </div>
          )}
        </Field>
        <Button type="submit" size="lg" full loading={saving} disabled={!firstName || !lastName || !phone}>
          Envoyer ma demande
        </Button>
      </form>
      <div className="mt-3"><LogoutButton label="Annuler" /></div>
    </Screen>
  );
}

function PendingScreen({ application }: { application: DriverApplication }) {
  return (
    <Screen>
      <div className="flex flex-col items-center text-center">
        <div className="grid size-16 place-items-center rounded-full bg-amber/15 text-amber"><Clock className="size-8 animate-pulse" /></div>
        <h1 className="mt-3 text-xl font-extrabold">Demande en attente</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Le restaurant doit valider votre compte. Cette page s'ouvrira toute seule dès que c'est fait.
        </p>
      </div>
      <dl className="mt-5 flex flex-col gap-2 rounded-2xl bg-surface-2 p-4 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-fg-muted">Nom</dt><dd className="font-bold">{application.first_name} {application.last_name}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-fg-muted">Téléphone</dt><dd className="font-bold">{formatPhone(application.phone)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-fg-muted">Email</dt><dd className="truncate font-bold">{application.email}</dd></div>
      </dl>
      <div className="mt-5"><LogoutButton label="Se déconnecter" /></div>
    </Screen>
  );
}

/**
 * Compte Google connecté mais pas (encore) livreur : formulaire d'inscription,
 * puis attente de la validation (mise à jour en direct).
 */
function DriverSignup({ session, onApproved }: { session: Session; onApproved: () => void }) {
  const userId = session.user.id;
  const [application, setApplication] = useState<DriverApplication | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMyDriverApplication(userId).then(setApplication, (e: unknown) => setError(errorMessage(e)));
  }, [userId]);
  useEffect(load, [load]);

  useRealtime(`driver-application-${userId}`, [{ table: "driver_applications", filter: `user_id=eq.${userId}` }],
    (payload) => setApplication(payload.new as unknown as DriverApplication), load);

  useEffect(() => {
    if (application?.status === "APPROVED") {
      toast.success("Compte livreur validé : bienvenue !");
      onApproved();
    }
  }, [application?.status, onApproved]);

  if (!isGoogleAccount(session)) {
    return (
      <Screen>
        <EmptyState icon={<ShieldAlert className="size-7 text-brand" />} title="Ce compte n'est pas un compte livreur"
          action={<LogoutButton />}>
          {session.user.email ?? "Ce compte"} n'a pas accès à l'espace livreur. Pour vous inscrire, utilisez « Continuer avec Google ».
        </EmptyState>
      </Screen>
    );
  }
  if (error) {
    return <Screen><EmptyState title="Connexion impossible" action={<Button onClick={load}>Réessayer</Button>}>{error}</EmptyState></Screen>;
  }
  if (application === undefined || application?.status === "APPROVED") return <FullScreenLoader />;
  if (application?.status === "PENDING") return <PendingScreen application={application} />;
  return <SignupForm session={session} previous={application} onSent={setApplication} />;
}

/**
 * Porte de l'application livreur : connexion (Google ou mot de passe), puis
 * inscription / attente de validation pour un nouveau compte Google, ou
 * accès direct pour un compte livreur. La vraie protection reste la RLS.
 */
export function DriverGate({ children }: { children: (ctx: { session: Session; profile: Profile }) => ReactNode }) {
  const session = useSession();
  const { profile, error, reload } = useProfile(session?.user.id);

  if (session === undefined || (session && profile === undefined)) return <FullScreenLoader />;
  if (!session) return <DriverWelcome />;
  if (profile?.role === "DRIVER") return <>{children({ session, profile })}</>;
  if (!profile || error) {
    return (
      <Screen>
        <EmptyState icon={<ShieldAlert className="size-7 text-brand" />} title="Profil introuvable"
          action={<div className="flex w-full flex-col gap-2"><Button onClick={reload}>Réessayer</Button><LogoutButton /></div>}>
          {error ? errorMessage(error) : "Impossible de charger votre profil."}
        </EmptyState>
      </Screen>
    );
  }
  if (profile.role === "ADMIN") {
    return (
      <Screen>
        <EmptyState icon={<ShieldAlert className="size-7 text-brand" />} title="Compte administrateur" action={<LogoutButton />}>
          Ce compte est un compte administrateur : utilisez l'application d'administration.
        </EmptyState>
      </Screen>
    );
  }
  return <DriverSignup session={session} onApproved={reload} />;
}
