import {
  EmptyState, LiveIndicator, Link, Logo, StatusBadge, algiersDayStart, cx, errorMessage, formatDA, formatTime,
  isAudioUnlocked, requestSystemNotifications, setDriverAvailability, toast, unlockAudio, type OrderWithItems,
} from "@hc/shared";
import { BellRing, ChevronRight, History, MapPin, Navigation, Package } from "lucide-react";
import { useState } from "react";
import type { DriverContext } from "../App";

function AvailabilityToggle({ ctx }: { ctx: DriverContext }) {
  const [busy, setBusy] = useState(false);
  const { status } = ctx.driver;
  const toggle = async () => {
    setBusy(true);
    try {
      const next = await setDriverAvailability(status === "OFFLINE");
      ctx.setDriver({ ...ctx.driver, status: next });
      toast.success(next === "OFFLINE" ? "Vous êtes hors ligne" : "Vous êtes disponible");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const styles = {
    AVAILABLE: { label: "Disponible", hint: "Touchez pour passer hors ligne", cls: "bg-emerald-600 shadow-emerald-600/30" },
    BUSY: { label: "En livraison", hint: "Statut automatique pendant vos livraisons", cls: "bg-orange-600 shadow-orange-600/30" },
    OFFLINE: { label: "Hors ligne", hint: "Touchez pour être disponible", cls: "bg-stone-700 shadow-black/30" },
  }[status];
  return (
    <button type="button" onClick={toggle} disabled={busy || status === "BUSY"}
      className={cx("flex w-full items-center gap-4 rounded-3xl px-5 py-4 text-left text-white shadow-xl transition active:scale-[.99] disabled:active:scale-100", styles.cls)}
      aria-label={`Statut : ${styles.label}. ${styles.hint}`}>
      <span className={cx("size-4 shrink-0 rounded-full bg-white", status !== "OFFLINE" && "animate-pulse")} />
      <span className="flex-1">
        <span className="block text-xl font-extrabold">{styles.label}</span>
        <span className="block text-sm text-white/80">{styles.hint}</span>
      </span>
    </button>
  );
}

function OrderCard({ order }: { order: OrderWithItems }) {
  const urgent = order.status === "ASSIGNED";
  return (
    <Link to={`/commande/${order.id}`}
      className={cx("block rounded-3xl border-2 bg-surface p-5 transition active:scale-[.99] animate-fade-up",
        urgent ? "border-flame shadow-lg shadow-flame/20" : "border-sky-500/50")}>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={order.status} className="text-sm" />
        <span className="font-mono text-sm font-bold text-fg-muted">{order.order_number}</span>
      </div>
      <p className="mt-3 text-2xl font-extrabold">{order.customer_name}</p>
      <p className="mt-1 flex items-start gap-2 text-lg text-fg-muted">
        <MapPin className="mt-1 size-5 shrink-0 text-flame" />
        <span>{order.customer_address}, {order.commune}</span>
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-fg-muted">À encaisser</span>
        <span className="text-2xl font-extrabold text-gold">{formatDA(order.total)}</span>
      </div>
      <div className="mt-4 flex h-14 items-center justify-center gap-2 rounded-2xl bg-fire text-lg font-extrabold text-white">
        <Navigation className="size-5" /> Ouvrir la commande <ChevronRight className="size-5" />
      </div>
    </Link>
  );
}

function AlertsPrompt() {
  const [enabled, setEnabled] = useState(isAudioUnlocked());
  if (enabled) return null;
  return (
    <button type="button"
      onClick={async () => {
        unlockAudio();
        await requestSystemNotifications();
        setEnabled(true);
        toast.success("Alertes activées : vous serez prévenu à chaque nouvelle commande.");
      }}
      className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-gold/60 bg-gold/10 p-4 text-left font-bold text-gold">
      <BellRing className="size-6 shrink-0 animate-shake" />
      Touchez ici pour activer le son et les alertes de nouvelles commandes
    </button>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4 card-shadow">
      <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{label}</p>
      <p className={cx("mt-1 whitespace-nowrap text-xl font-extrabold tabular-nums min-[380px]:text-2xl", accent)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/**
 * Tableau de bord du livreur : statut (disponible / hors ligne), chiffres du
 * jour, commandes en cours (alerte sonore à chaque nouvelle), livraisons
 * récentes et fiche du livreur.
 */
export function OrdersPage({ ctx }: { ctx: DriverContext }) {
  const active = ctx.orders
    .filter((o) => o.status === "ASSIGNED" || o.status === "OUT_FOR_DELIVERY")
    .sort((a, b) => (a.assigned_at ?? "").localeCompare(b.assigned_at ?? ""));
  const done = ctx.orders
    .filter((o) => o.status === "DELIVERED")
    .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""));
  const dayStart = algiersDayStart();
  const today = done.filter((o) => (o.delivered_at ?? "") >= dayStart);
  const cashToday = today.reduce((sum, o) => sum + o.total, 0);
  const firstName = ctx.driver.name.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-nav pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-5 flex items-center gap-3">
        <Link to="/compte" aria-label="Mon compte"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-fire text-lg font-extrabold text-white shadow-lg shadow-brand/30">
          {initials(ctx.driver.name)}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-fg-muted">Bonjour,</p>
          <p className="truncate text-lg font-extrabold leading-tight">{firstName} 👋</p>
          <LiveIndicator live={ctx.live} />
        </div>
        <Logo size={44} />
      </header>

      <div className="flex flex-col gap-3">
        <AvailabilityToggle ctx={ctx} />
        <AlertsPrompt />
        {ctx.locationError && (
          <p className="rounded-2xl bg-amber/15 p-3 text-sm font-semibold text-amber">📡 {ctx.locationError}</p>
        )}
      </div>

      <h1 className="sr-only">Tableau de bord livreur</h1>
      <section aria-label="Aujourd'hui" className="mt-5 grid grid-cols-3 gap-2.5">
        <Stat label="En cours" value={String(active.length)} hint={active.length ? "à livrer" : "aucune"} accent={active.length ? "text-flame" : undefined} />
        <Stat label="Livrées" value={String(today.length)} hint="aujourd'hui" accent="text-emerald-500" />
        <Stat label="Encaissé" value={formatDA(cashToday)} hint="aujourd'hui" accent="text-gold" />
      </section>

      <h2 className="mb-3 mt-8 font-display text-3xl uppercase tracking-wide">Mes commandes</h2>
      {active.length === 0 ? (
        <EmptyState icon={<Package className="size-7" />} title="Aucune commande en cours">
          {ctx.driver.status === "OFFLINE"
            ? "Passez « Disponible » pour recevoir des commandes."
            : "Les nouvelles commandes apparaîtront ici automatiquement, avec une alerte sonore."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">{active.map((o) => <OrderCard key={o.id} order={o} />)}</div>
      )}

      <section className="mt-8 rounded-3xl border border-line bg-surface p-4 card-shadow">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-extrabold"><History className="size-5 text-fg-muted" /> Livraisons récentes</h2>
          <Link to="/historique" className="flex items-center gap-0.5 text-sm font-bold text-accent">Tout l'historique <ChevronRight className="size-4" /></Link>
        </div>
        {done.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">Vos livraisons des dernières 24 h apparaîtront ici.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {done.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-mono font-bold">{o.order_number}</span>
                  <span className="block truncate text-fg-muted">{o.customer_name} · {o.commune}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold">{formatDA(o.total)}</span>
                  <span className="block text-xs text-fg-muted">livrée à {formatTime(o.delivered_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
