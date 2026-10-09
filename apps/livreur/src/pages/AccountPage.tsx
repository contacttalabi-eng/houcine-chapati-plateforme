import {
  ButtonLink, ConfirmSheet, cx, fetchSettings, formatPhone, isAudioUnlocked, playChime, requestSystemNotifications,
  signOut, telHref, toast, unlockAudio, vibrate, type RestaurantSettings,
} from "@hc/shared";
import {
  BellRing, LogOut, Mail, MonitorSmartphone, Moon, Navigation, Phone, ShieldCheck, Store, Sun, UserRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { DriverContext } from "../App";
import { PageHeader } from "../components/nav";
import { useTheme, type ThemePreference } from "../state/theme";

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "light", label: "Clair", icon: Sun },
  { value: "system", label: "Automatique", icon: MonitorSmartphone },
];

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-4 card-shadow">
      <h2 className="mb-3 flex items-center gap-2 font-extrabold">{icon}{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-bold">{children}</dd>
    </div>
  );
}

const permission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/** Paramètres du compte livreur : fiche, apparence, alertes, restaurant, déconnexion. */
export function AccountPage({ ctx }: { ctx: DriverContext }) {
  const { preference, resolved, setPreference } = useTheme();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [sound, setSound] = useState(isAudioUnlocked());
  const [notif, setNotif] = useState(permission());
  const [leaving, setLeaving] = useState(false);
  const { driver } = ctx;
  const initials = driver.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

  useEffect(() => {
    fetchSettings().then(setSettings, () => undefined);
  }, []);

  const testAlert = async () => {
    unlockAudio();
    playChime(2);
    vibrate();
    setSound(true);
    if (notif === "default") setNotif((await requestSystemNotifications()) ? "granted" : permission());
    toast.success("Alerte de test : vous entendrez ce son à chaque nouvelle commande.");
  };

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-nav pt-[max(1.25rem,env(safe-area-inset-top))]">
      <PageHeader title="Compte" subtitle="Paramètres de votre compte livreur" />

      <section className="relative overflow-hidden rounded-3xl bg-fire p-5 text-white shadow-xl shadow-brand/25">
        <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-white/20 text-2xl font-extrabold ring-2 ring-white/40">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold">{driver.name}</p>
            <p className="truncate text-sm text-white/85">{formatPhone(driver.phone)}</p>
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">
              <ShieldCheck className="size-3.5" /> Compte livreur validé
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-4">
        <Section title="Mes informations" icon={<UserRound className="size-5 text-accent" />}>
          <dl className="divide-y divide-line">
            <Row label="Nom">{driver.name}</Row>
            <Row label="Téléphone">{formatPhone(driver.phone)}</Row>
            <Row label="Email"><span className="inline-flex items-center gap-1"><Mail className="size-3.5 text-fg-muted" />{ctx.email ?? driver.email ?? "—"}</span></Row>
            <Row label="Connexion">{ctx.provider === "google" ? "Google (identité confirmée)" : "Email et mot de passe"}</Row>
          </dl>
          <p className="mt-2 text-xs text-fg-muted">Pour modifier votre nom ou votre téléphone, contactez le restaurant.</p>
        </Section>

        <Section title="Apparence" icon={<Moon className="size-5 text-accent" />}>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Thème">
            {THEMES.map(({ value, label, icon: Icon }) => {
              const on = preference === value;
              return (
                <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setPreference(value)}
                  className={cx("flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-3 text-sm font-bold transition",
                    on ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface-2 text-fg hover:border-fg-muted/40")}>
                  <Icon className="size-5" />{label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            {preference === "system" ? `Suit le réglage du téléphone (actuellement : ${resolved === "dark" ? "sombre" : "clair"}).` : "Enregistré sur ce téléphone."}
          </p>
        </Section>

        <Section title="Alertes de commandes" icon={<BellRing className="size-5 text-accent" />}>
          <dl className="divide-y divide-line">
            <Row label="Son"><span className={sound ? "text-emerald-500" : "text-amber"}>{sound ? "Activé" : "À activer"}</span></Row>
            <Row label="Notifications">
              <span className={notif === "granted" ? "text-emerald-500" : "text-amber"}>
                {notif === "granted" ? "Autorisées" : notif === "denied" ? "Bloquées (réglages du téléphone)" : notif === "unsupported" ? "Non disponibles" : "À autoriser"}
              </span>
            </Row>
            <Row label="Position GPS">
              <span className="inline-flex items-center gap-1"><Navigation className="size-3.5 text-fg-muted" />
                {ctx.locationError ? "Indisponible" : "Partagée pendant les livraisons"}</span>
            </Row>
          </dl>
          <button type="button" onClick={() => void testAlert()}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 font-extrabold transition hover:bg-surface-3 active:scale-[.98]">
            <BellRing className="size-5" /> Tester le son et les alertes
          </button>
        </Section>

        <Section title="Restaurant" icon={<Store className="size-5 text-accent" />}>
          <p className="text-sm font-bold">{settings?.name ?? "Houcine Chapati"}</p>
          {settings?.address && <p className="text-sm text-fg-muted">{settings.address}</p>}
          {settings?.phone && (
            <ButtonLink href={telHref(settings.phone)} variant="secondary" full className="mt-3" icon={<Phone className="size-4" />}>
              Appeler le restaurant · {formatPhone(settings.phone)}
            </ButtonLink>
          )}
        </Section>

        <button type="button" onClick={() => setLeaving(true)}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-extrabold text-red-500 card-shadow transition hover:bg-surface-2">
          <LogOut className="size-5" /> Se déconnecter
        </button>
      </div>

      <ConfirmSheet open={leaving} onClose={() => setLeaving(false)} title="Se déconnecter ?" confirmLabel="Se déconnecter"
        variant="danger" onConfirm={() => void signOut()}>
        Vous ne recevrez plus d'alertes de commandes sur ce téléphone tant que vous ne vous reconnectez pas.
      </ConfirmSheet>
    </div>
  );
}
