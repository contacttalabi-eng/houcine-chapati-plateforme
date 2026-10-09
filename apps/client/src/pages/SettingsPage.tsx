import { ConfirmSheet, cx, formatPhone, signOut, telHref, toast, useSession } from "@hc/shared";
import { MapPin, MonitorSmartphone, Moon, Phone, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader, Section } from "../components/ui";
import { forgetOrders } from "../state/cart";
import { useMenu } from "../state/menu";
import { useTheme, type ThemePreference } from "../state/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Automatique", icon: MonitorSmartphone },
];

function ThemeSettings() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <Section title="Apparence">
      <fieldset>
        <legend className="mb-1 text-sm font-bold">Thème de l'application</legend>
        <p className="mb-3 text-xs text-fg-muted">
          {preference === "system"
            ? `Suit le réglage de votre téléphone (actuellement : ${resolved === "dark" ? "sombre" : "clair"}).`
            : "Enregistré sur cet appareil."}
        </p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Thème">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const on = preference === value;
            return (
              <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setPreference(value)}
                className={cx("flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-3 text-sm font-bold transition",
                  on ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface-2 text-fg hover:border-fg-muted/40")}>
                <Icon className="size-5" />
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </Section>
  );
}

function Restaurant() {
  const { settings } = useMenu();
  return (
    <Section title="Le restaurant">
      <ul className="flex flex-col gap-3 text-sm">
        <li className="flex items-center gap-3">
          <img src="/brand/logo.webp" alt="" width={40} height={40} className="size-10 rounded-full bg-white ring-1 ring-line" />
          <span className="font-extrabold">{settings?.name ?? "Houcine Chapati"}</span>
        </li>
        {settings?.address && (
          <li className="flex items-center gap-3">
            <MapPin className="size-5 shrink-0 text-fg-muted" />
            <span>{settings.address}</span>
          </li>
        )}
        {settings?.phone && (
          <li>
            <a href={telHref(settings.phone)}
              className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-3 font-bold transition hover:bg-surface-3">
              <Phone className="size-5 shrink-0 text-accent" />
              <span className="flex-1">Appeler le restaurant</span>
              <span className="tabular-nums text-fg-muted">{formatPhone(settings.phone)}</span>
            </a>
          </li>
        )}
      </ul>
    </Section>
  );
}

function Privacy() {
  const session = useSession();
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  return (
    <Section title="Vos données">
      <p className="flex gap-3 text-sm text-fg-muted">
        <ShieldCheck className="size-5 shrink-0 text-success" />
        <span>
          Pas de compte, pas d'inscription. Votre numéro et votre position ne sont demandés qu'au moment de commander,
          pour la livraison, et ne sont pas gardés sur ce téléphone.
        </span>
      </p>
      {session && (
        <button type="button" onClick={() => setConfirm(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3 text-sm font-bold text-danger transition hover:bg-surface-2">
          <Trash2 className="size-4" /> Effacer l'historique de ce téléphone
        </button>
      )}
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title="Effacer l'historique ?"
        confirmLabel="Effacer" variant="danger" loading={clearing}
        onConfirm={async () => {
          setClearing(true);
          forgetOrders();
          await signOut();
          setClearing(false);
          setConfirm(false);
          toast.success("Historique effacé de ce téléphone");
        }}>
        Vos commandes n'apparaîtront plus dans « Mes commandes » sur ce téléphone et vous ne pourrez plus suivre
        celles en cours. Le restaurant garde la commande pour la livrer.
      </ConfirmSheet>
    </Section>
  );
}

/** Onglet Réglages : thème, contact du restaurant, données. */
export function SettingsPage() {
  return (
    <div className="min-h-dvh pb-nav">
      <PageHeader title="Réglages" subtitle="Apparence et informations" />
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4">
        <ThemeSettings />
        <Restaurant />
        <Privacy />
        <p className="pb-2 text-center text-xs text-fg-muted">Houcine Chapati · Tizi Ouzou</p>
      </main>
    </div>
  );
}
