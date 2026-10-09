import {
  EmptyState, Field, FullScreenLoader, Input, applyAsDriver, env, errorMessage, fetchMyDriverApplication,
  formatPhone, isDemoMode, sendEmailCode, sessionMethods, signInWithPassword, signOut, toast, useProfile, useRealtime,
  useSession, verifyEmailCode, type DriverApplication, type Profile,
} from "@hc/shared";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft, ArrowRight, Clock, KeyRound, LogOut, Mail, MailCheck, ShieldAlert, ShieldCheck, UserRound, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CubeIcon, LogoCutout, PinIcon, Pill } from "./components/brand";

/** Fond jaune fluo, logo détouré, carte blanche (thème clair forcé à l'intérieur). */
function Screen({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  return (
    <main className="min-h-dvh bg-[var(--neon)] text-[var(--neon-ink)]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label="Retour"
              className="grid size-11 place-items-center rounded-full bg-black text-white transition active:scale-95">
              <ArrowLeft className="size-5" />
            </button>
          ) : <CubeIcon className="size-11" />}
        </div>
        <LogoCutout className="mx-auto -mt-4 h-28 drop-shadow-[0_6px_10px_rgb(0_0_0/0.15)]" />
        <div data-theme="light" className="mt-5 rounded-[2rem] bg-white p-6 text-[#0d0d0d] shadow-[0_20px_50px_-20px_rgb(0_0_0/0.35)] animate-fade-up">
          {children}
        </div>
      </div>
    </main>
  );
}

function Title({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-[var(--neon)] text-black">{icon}</div>}
      <h1 className="text-[1.65rem] font-extrabold leading-tight tracking-tight">{title}</h1>
      {children && <p className="mt-1.5 text-[15px] text-black/60">{children}</p>}
    </div>
  );
}

function LogoutButton({ label = "Changer de compte" }: { label?: string }) {
  return (
    <button type="button" onClick={() => void signOut()}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-black/10 font-bold text-black/75 transition hover:border-black/30">
      <LogOut className="size-4" /> {label}
    </button>
  );
}

const ErrorText = ({ children }: { children: ReactNode }) => (
  <p className="rounded-2xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600" role="alert">{children}</p>
);

/** Session ouverte avec un email prouvé : code reçu par email (otp) ou Google (oauth). */
const hasProvenEmail = (session: Session) =>
  sessionMethods(session).some((m) => m === "otp" || m === "magiclink" || m === "oauth");

const RESEND_SECONDS = 60;

// ----------------------------------------------------------------- couverture

/** Écran de couverture, reproduit d'après la maquette « couverture application livreur ». */
function Cover({ onStart }: { onStart: () => void }) {
  return (
    <main className="min-h-dvh bg-[var(--neon)] text-[var(--neon-ink)]">
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden">
        <div className="relative z-10 px-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <CubeIcon className="size-11" />
          <LogoCutout className="mx-auto -mt-5 h-[9.5rem] drop-shadow-[0_8px_12px_rgb(0_0_0/0.15)]" />
          <h1 className="mt-5 text-[2.85rem] font-extrabold leading-[1.02] tracking-[-0.045em]">
            Livré.<br />À l'heure.
          </h1>
          <div className="relative mt-3 pr-16">
            <p className="text-[1.05rem] font-medium leading-snug text-black/85">
              Suivi en temps réel et itinéraire optimisé pour chaque commande.
            </p>
            <PinIcon className="absolute -top-9 right-1 h-[4.5rem] w-14" />
          </div>
        </div>

        <div className="relative -mt-2 min-h-[19rem] flex-1">
          <img src="/brand/livreur-route.webp" alt="" aria-hidden width={928} height={932}
            className="absolute inset-0 size-full object-cover object-top [mask-image:linear-gradient(to_bottom,transparent,#000_12%)]" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Pill onClick={onStart} className="h-16 text-xl" icon={<ArrowRight className="size-6" />}>Commencer</Pill>
        </div>
      </div>
    </main>
  );
}

// ----------------------------------------------------------------- email → code (ou mot de passe)

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
    <Screen onBack={onBack}>
      <Title icon={<MailCheck className="size-6" />} title="Entrez votre code">
        Un code à 6 chiffres a été envoyé à <b className="text-black">{email}</b>. Pensez à regarder dans les spams.
      </Title>
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
          className="h-16 w-full rounded-2xl border-2 border-black/10 bg-[#f4f4f5] text-center font-mono text-3xl font-extrabold tracking-[0.5em] text-black outline-none transition placeholder:text-black/25 focus:border-black aria-[invalid=true]:border-red-500" />
        {error && <ErrorText>{error}</ErrorText>}
        <Pill type="submit" loading={verifying} disabled={code.length !== 6}>Valider</Pill>
      </form>
      {demoCode && (
        <p className="mt-4 rounded-2xl border border-dashed border-black/30 bg-[var(--neon)]/40 px-3 py-2 text-center text-sm text-black/70">
          <b className="text-black">Mode démo</b> — aucun email n'est envoyé. Votre code : <b className="font-mono text-black" data-demo-code>{demoCode}</b>
        </p>
      )}
      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={onBack} className="font-bold text-black/55 hover:text-black">Changer d'email</button>
        <button type="button" onClick={() => void resend()} disabled={wait > 0 || resending}
          className="font-extrabold text-black underline underline-offset-4 disabled:text-black/40 disabled:no-underline">
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
    <Screen onBack={onBack}>
      <Title icon={<KeyRound className="size-6" />} title="Espace livreur">Connexion avec mot de passe</Title>
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
        {error && <ErrorText>{error}</ErrorText>}
        <Pill type="submit" loading={loading} disabled={!email || !password}>Se connecter</Pill>
      </form>
      {isDemoMode && (
        <p className="mt-4 rounded-2xl border border-dashed border-black/30 bg-[var(--neon)]/40 px-3 py-2 text-xs text-black/70">
          <b className="text-black">Mode démo</b> — livreurs existants : karim@demo.dz, yanis@demo.dz (mot de passe demo1234).
        </p>
      )}
      <button type="button" onClick={onBack} className="mt-5 w-full text-center text-sm font-extrabold text-black underline underline-offset-4">
        Recevoir plutôt un code par email
      </button>
    </Screen>
  );
}

function EmailStep({ onBack, onSent, onPassword }: { onBack: () => void; onSent: (email: string) => void; onPassword: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await sendEmailCode(email);
      onSent(email.trim().toLowerCase());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen onBack={onBack}>
      <Title title="Espace livreur">Recevez un code à 6 chiffres par email pour vous connecter ou vous inscrire.</Title>
      <form onSubmit={send} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="driver-email" className="mb-1.5 block text-sm font-bold">Votre email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-black/40" />
            <input id="driver-email" type="email" autoComplete="email" inputMode="email" required value={email} autoFocus
              onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="vous@exemple.com"
              className="h-14 w-full rounded-full border-2 border-black/10 bg-[#f4f4f5] pl-12 pr-4 text-base font-semibold text-black outline-none transition placeholder:text-black/35 focus:border-black focus:bg-white" />
          </div>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <Pill type="submit" loading={sending} disabled={!valid} icon={<ArrowRight className="size-5" />}>Recevoir mon code</Pill>
      </form>
      <p className="mt-4 text-center text-xs font-medium text-black/55">
        Nouveau livreur ? Après le code, complétez votre fiche : le restaurant valide ensuite votre compte.
      </p>
      <button type="button" onClick={onPassword}
        className="mt-5 w-full text-center text-sm font-extrabold text-black/70 underline underline-offset-4 hover:text-black">
        Se connecter avec un mot de passe
      </button>
    </Screen>
  );
}

/**
 * Accueil : couverture, puis le livreur saisit son email et reçoit un code à
 * 6 chiffres (connexion et inscription, sans mot de passe). Les comptes créés
 * par le restaurant avec un mot de passe gardent la connexion par mot de passe.
 */
function DriverWelcome() {
  const [mode, setMode] = useState<"cover" | "email" | "code" | "password">("cover");
  const [email, setEmail] = useState("");

  if (mode === "cover") return <Cover onStart={() => setMode("email")} />;
  if (mode === "code") return <CodeStep email={email} onBack={() => setMode("email")} />;
  if (mode === "password") return <PasswordLogin onBack={() => setMode("email")} />;
  return (
    <EmailStep onBack={() => setMode("cover")} onPassword={() => setMode("password")}
      onSent={(value) => { setEmail(value); setMode("code"); }} />
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
      <Title icon={<UserRound className="size-6" />} title="Inscription livreur">
        Votre email est confirmé par le code. Complétez votre fiche :
      </Title>
      {previous?.status === "REJECTED" && (
        <p className="mb-4 flex gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600" role="alert">
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
              <ShieldCheck className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-emerald-600" aria-label="Email confirmé" />
            </div>
          )}
        </Field>
        <Pill type="submit" loading={saving} disabled={!firstName || !lastName || !phone} icon={<ArrowRight className="size-5" />}>
          Envoyer ma demande
        </Pill>
      </form>
      <div className="mt-3"><LogoutButton label="Annuler" /></div>
    </Screen>
  );
}

function PendingScreen({ application }: { application: DriverApplication }) {
  return (
    <Screen>
      <Title icon={<Clock className="size-6 animate-pulse" />} title="Demande en attente">
        Le restaurant doit valider votre compte. Cette page s'ouvrira toute seule dès que c'est fait.
      </Title>
      <dl className="flex flex-col gap-2 rounded-2xl bg-[#f4f4f5] p-4 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-black/55">Nom</dt><dd className="font-bold">{application.first_name} {application.last_name}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-black/55">Téléphone</dt><dd className="font-bold">{formatPhone(application.phone)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-black/55">Email</dt><dd className="truncate font-bold">{application.email}</dd></div>
      </dl>
      <div className="mt-5"><LogoutButton label="Se déconnecter" /></div>
    </Screen>
  );
}

function Blocked({ title, children, action }: { title: string; children: ReactNode; action: ReactNode }) {
  return (
    <Screen>
      <EmptyState icon={<ShieldAlert className="size-7 text-red-600" />} title={title} action={action} className="py-4">
        {children}
      </EmptyState>
    </Screen>
  );
}

/**
 * Compte connecté par code email mais pas (encore) livreur : formulaire
 * d'inscription, puis attente de la validation (mise à jour en direct).
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
      <Blocked title="Ce compte n'est pas un compte livreur" action={<LogoutButton />}>
        {session.user.email ?? "Ce compte"} n'a pas accès à l'espace livreur. Pour vous inscrire, déconnectez-vous puis connectez-vous avec le code reçu par email.
      </Blocked>
    );
  }
  if (error) {
    return <Blocked title="Connexion impossible" action={<Pill onClick={load}>Réessayer</Pill>}>{error}</Blocked>;
  }
  if (application === undefined || application?.status === "APPROVED") return <FullScreenLoader />;
  if (application?.status === "PENDING") return <PendingScreen application={application} />;
  return <SignupForm session={session} previous={application} onSent={setApplication} />;
}

/**
 * Porte de l'application livreur : connexion (code email ou mot de passe), puis
 * inscription / attente de validation pour un nouveau compte, ou accès direct
 * pour un compte livreur. La vraie protection reste la RLS.
 */
export function DriverGate({ children }: { children: (ctx: { session: Session; profile: Profile }) => ReactNode }) {
  const session = useSession();
  const { profile, error, reload } = useProfile(session?.user.id);

  if (session === undefined || (session && profile === undefined)) return <FullScreenLoader />;
  if (!session) return <DriverWelcome />;
  if (profile?.role === "DRIVER") return <>{children({ session, profile })}</>;
  if (!profile || error) {
    return (
      <Blocked title="Profil introuvable"
        action={<div className="flex w-full flex-col gap-2"><Pill onClick={reload}>Réessayer</Pill><LogoutButton /></div>}>
        {error ? errorMessage(error) : "Impossible de charger votre profil."}
      </Blocked>
    );
  }
  if (profile.role === "ADMIN") {
    return (
      <Blocked title="Compte administrateur" action={<LogoutButton />}>
        Ce compte est un compte administrateur : utilisez l'application d'administration.
      </Blocked>
    );
  }
  return <DriverSignup session={session} onApproved={reload} />;
}
