import {
  Button, Card, EmptyState, Field, FullScreenLoader, Input, Logo, applyAsDriver, env, errorMessage, fetchMyDriverApplication,
  formatPhone, isDemoMode, sendEmailCode, sessionMethods, signInWithPassword, signOut, toast, useProfile, useRealtime,
  useSession, verifyEmailCode, type DriverApplication, type Profile,
} from "@hc/shared";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight, Clock, KeyRound, LogOut, Mail, MailCheck, Package, ShieldAlert, ShieldCheck, UserRound, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

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

/** Session ouverte avec un email prouvé : code reçu par email (otp) ou Google (oauth). */
const hasProvenEmail = (session: Session) =>
  sessionMethods(session).some((m) => m === "otp" || m === "magiclink" || m === "oauth");

const RESEND_SECONDS = 60;

// ----------------------------------------------------------------- accueil : code par email (ou mot de passe)

/** Démo uniquement : aucun email n'est envoyé, le serveur de démo donne le code à afficher. */
function useDemoCode(email: string, sentAt: number) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (!isDemoMode || !sentAt) return;
    fetch(`${env.supabaseUrl}/demo/otp?email=${encodeURIComponent(email)}`)
      .then((r) => r.json() as Promise<{ code: string | null }>)
      .then((r) => setCode(r.code), () => setCode(null));
  }, [email, sentAt]);
  return code;
}

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const demoCode = useDemoCode(email, sentAt);
  const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const verify = async (value: string) => {
    if (value.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyEmailCode(email, value);
      // la session s'ouvre : la porte affiche la suite (inscription ou tableau de bord)
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      await sendEmailCode(email);
      setSentAt(Date.now());
      toast.success("Nouveau code envoyé");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <div className="mb-5 flex flex-col items-center text-center">
        <div className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent"><MailCheck className="size-7" /></div>
        <h1 className="mt-3 text-xl font-extrabold">Entrez votre code</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Un code à 6 chiffres a été envoyé à <b className="text-fg">{email}</b>. Pensez à regarder dans les spams.
        </p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void verify(code); }} className="flex flex-col gap-4" noValidate>
        <label className="sr-only" htmlFor="otp-code">Code à 6 chiffres</label>
        <input id="otp-code" value={code} autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(value);
            setError(null);
            if (value.length === 6) void verify(value);
          }}
          placeholder="••••••"
          className="h-16 w-full rounded-2xl border border-line bg-surface-2 text-center font-mono text-3xl font-extrabold tracking-[0.5em] text-fg outline-none transition placeholder:text-fg-muted/40 focus:border-accent focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-red-500" />
        {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-500" role="alert">{error}</p>}
        <Button type="submit" size="lg" full loading={verifying} disabled={code.length !== 6}>Valider</Button>
      </form>
      {demoCode && (
        <p className="mt-4 rounded-xl border border-dashed border-amber/60 bg-amber/10 px-3 py-2 text-center text-sm text-fg-muted">
          <b className="text-fg">Mode démo</b> — aucun email n'est envoyé. Votre code : <b className="font-mono text-fg" data-demo-code>{demoCode}</b>
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={onBack} className="font-bold text-fg-muted hover:text-fg">Changer d'email</button>
        <button type="button" onClick={() => void resend()} disabled={wait > 0 || resending}
          className="font-bold text-accent disabled:text-fg-muted">
          {wait > 0 ? `Renvoyer le code (${wait} s)` : "Renvoyer le code"}
        </button>
      </div>
    </Screen>
  );
}

function PasswordLogin({ onBack }: { onBack: () => void }) {
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
      <Brand subtitle="Connexion avec mot de passe" />
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
        </p>
      )}
      <button type="button" onClick={onBack} className="mt-4 w-full text-center text-sm font-bold text-accent">
        Recevoir plutôt un code par email
      </button>
    </Screen>
  );
}

/**
 * Accueil : le livreur saisit son email et reçoit un code à 6 chiffres
 * (connexion et inscription, sans mot de passe). Les comptes créés par le
 * restaurant avec un mot de passe gardent la connexion par mot de passe.
 */
function DriverWelcome() {
  const [mode, setMode] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await sendEmailCode(email);
      setMode("code");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (mode === "code") return <CodeStep email={email.trim().toLowerCase()} onBack={() => setMode("email")} />;
  if (mode === "password") return <PasswordLogin onBack={() => setMode("email")} />;

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--neon)] px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[var(--neon-ink)]">
      {/* Halo décoratif, dans l'esprit de la maquette (route / point de livraison) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 opacity-[0.07]" aria-hidden>
        <svg viewBox="0 0 400 200" className="h-full w-full" fill="none">
          <path d="M-20 180 C 100 180, 140 60, 260 60 S 420 20, 440 -10" stroke="black" strokeWidth="10" strokeDasharray="2 18" strokeLinecap="round" />
        </svg>
      </div>

      <div className="relative flex items-center justify-between">
        <span className="grid size-11 place-items-center rounded-full bg-black text-[var(--neon)] shadow-lg shadow-black/20">
          <Package className="size-5" />
        </span>
      </div>

      <div className="relative mt-7 flex flex-col items-center text-center">
        <Logo size={92} className="ring-4 ring-black" />
        <h1 className="mt-7 font-display text-5xl uppercase leading-[0.92] tracking-tight">Livré.<br />À l'heure.</h1>
        <p className="mt-3 max-w-[22rem] text-sm font-bold text-black/70">
          Suivi en direct et itinéraire malin pour chaque commande.
        </p>
      </div>

      <form onSubmit={send} className="relative mt-10 flex flex-col gap-3" noValidate>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-black/40" />
          <input type="email" autoComplete="email" inputMode="email" required value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="vous@exemple.com"
            className="h-14 w-full rounded-full border-2 border-black/10 bg-white pl-12 pr-4 text-base font-bold text-black placeholder:text-black/35 outline-none transition focus:border-black" />
        </div>
        {error && (
          <p className="rounded-2xl bg-black px-4 py-2.5 text-center text-sm font-bold text-[var(--neon)]" role="alert">{error}</p>
        )}
        <button type="submit" disabled={!valid || sending}
          className="flex h-14 items-center justify-center gap-2 rounded-full bg-black text-lg font-extrabold text-[var(--neon)] shadow-xl shadow-black/20 transition active:scale-[.98] disabled:opacity-40">
          {sending ? "Envoi…" : <>Recevoir mon code <ArrowRight className="size-5" /></>}
        </button>
      </form>
      <p className="relative mt-4 text-center text-xs font-bold text-black/60">
        Nouveau livreur ? Après le code, complétez votre fiche : le restaurant valide ensuite votre compte.
      </p>
      <button type="button" onClick={() => setMode("password")}
        className="relative mt-6 w-full text-center text-sm font-extrabold text-black/70 underline underline-offset-4 hover:text-black">
        Se connecter avec un mot de passe
      </button>
    </main>
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
        <p className="mt-1 text-sm text-fg-muted">Votre email est confirmé par le code. Complétez votre fiche :</p>
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
        <Field label="Email" hint="Confirmé par le code reçu par email.">
          {(p) => (
            <div className="relative">
              <Input {...p} type="email" value={session.user.email ?? ""} readOnly autoComplete="email" className="pr-10" />
              <ShieldCheck className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-emerald-500" aria-label="Email confirmé" />
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

  if (!hasProvenEmail(session)) {
    return (
      <Screen>
        <EmptyState icon={<ShieldAlert className="size-7 text-brand" />} title="Ce compte n'est pas un compte livreur"
          action={<LogoutButton />}>
          {session.user.email ?? "Ce compte"} n'a pas accès à l'espace livreur. Pour vous inscrire, déconnectez-vous puis connectez-vous avec le code reçu par email.
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
