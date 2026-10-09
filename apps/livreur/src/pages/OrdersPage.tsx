import {
  Link, Sheet, algiersDayStart, cx, errorMessage, fetchMenu, formatDA, isAudioUnlocked, requestSystemNotifications,
  setDriverAvailability, signOut, toast, unlockAudio, type MenuCategory, type OrderWithItems,
} from "@hc/shared";
import {
  ArrowRight, BellRing, CalendarDays, Check, ChevronRight, History, LogOut, Menu, Motorbike, Navigation, Search, Store,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DriverContext } from "../App";
import { CalcIcon, CubeTileIcon, DzFlag, LogoCutout, ReceiptIcon } from "../components/brand";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-DZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Algiers" }).format(new Date(iso));

// ----------------------------------------------------------------- carte jaune fluo

function Steps({ order }: { order: OrderWithItems }) {
  const enRoute = order.status === "OUT_FOR_DELIVERY";
  const steps: { label: string; state: "done" | "current" | "todo"; icon?: ReactNode }[] = [
    { label: "Confirmée", state: "done" },
    { label: "Préparée", state: "done" },
    enRoute
      ? { label: "En route", state: "current", icon: <Motorbike className="size-6" /> }
      : { label: "À récupérer", state: "current", icon: <Store className="size-5" /> },
    { label: "Livrée", state: "todo" },
  ];
  return (
    <ol className="mt-6 grid grid-cols-4" aria-label="Étapes de la livraison">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex flex-col items-center" aria-current={s.state === "current" ? "step" : undefined}>
          {i < steps.length - 1 && (
            <span aria-hidden className="absolute left-[calc(50%+1.6rem)] right-[calc(-50%+1.6rem)] top-[1.3rem] border-t-[3px] border-dotted border-black/80" />
          )}
          <span className={cx("grid size-[2.6rem] place-items-center rounded-full",
            s.state === "todo" ? "bg-black/20 ring-[5px] ring-inset ring-black/10" : "bg-black text-[var(--neon)]")}>
            {s.state === "done" ? <Check className="size-5" strokeWidth={3.5} /> : s.icon}
            {s.state === "todo" && <span className="size-3.5 rounded-full bg-[var(--neon)]/70" />}
          </span>
          <span className={cx("mt-2 whitespace-nowrap text-[13px]", s.state === "current" ? "font-extrabold" : "font-medium text-black/80")}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function CurrentDelivery({ order, others }: { order: OrderWithItems; others: number }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-black/80">
            Livraison en cours • {order.status === "OUT_FOR_DELIVERY" ? "En route" : "À récupérer"}
          </p>
          <p className="mt-1 truncate text-[2rem] font-extrabold leading-none tracking-tight">{order.order_number}</p>
        </div>
        <Link to={`/commande/${order.id}`} aria-label="Ouvrir la commande"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-white shadow-[0_6px_16px_-6px_rgb(0_0_0/0.35)] transition active:scale-95">
          <Navigation className="size-6" />
        </Link>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-[15px] font-medium">
        <span className="flex items-center gap-2"><CalendarDays className="size-5" /> {longDate(order.assigned_at ?? order.created_at)}</span>
        <span className="truncate">À encaisser <b className="font-extrabold">{formatDA(order.total)}</b></span>
      </div>
      <Steps order={order} />
      {others > 0 && (
        <p className="mt-4 text-center text-sm font-bold text-black/70">+ {others} autre{others > 1 ? "s" : ""} livraison{others > 1 ? "s" : ""} en cours ↓</p>
      )}
    </>
  );
}

function StatusCard({ ctx, delivered }: { ctx: DriverContext; delivered: number }) {
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
  const label = { AVAILABLE: "Disponible", BUSY: "En livraison", OFFLINE: "Hors ligne" }[status];
  return (
    <>
      <p className="text-[15px] font-medium text-black/80">Mon statut • {label}</p>
      <p className="mt-1 text-[2rem] font-extrabold leading-none tracking-tight">
        {status === "OFFLINE" ? "Hors ligne" : "Prêt à livrer"}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 text-[15px] font-medium">
        <span className="flex items-center gap-2"><CalendarDays className="size-5" /> {longDate(new Date().toISOString())}</span>
        <span>{delivered} livrée{delivered > 1 ? "s" : ""} aujourd'hui</span>
      </div>
      <button type="button" onClick={() => void toggle()} disabled={busy || status === "BUSY"}
        className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-black text-lg font-bold text-white shadow-xl shadow-black/20 transition active:scale-[.98] disabled:opacity-50">
        <span className={cx("size-3 rounded-full", status === "OFFLINE" ? "bg-[var(--neon)]" : "bg-stone-400")} />
        {status === "OFFLINE" ? "Je suis disponible" : "Passer hors ligne"}
      </button>
      <p className="mt-2.5 text-center text-xs font-semibold text-black/60">
        {status === "OFFLINE" ? "Passez disponible pour recevoir des commandes." : "Les nouvelles commandes arrivent ici avec une alerte sonore."}
      </p>
    </>
  );
}

// ----------------------------------------------------------------- partie blanche

function Tile({ icon, label, sub, onClick, to, disabled }: {
  icon: ReactNode; label: string; sub?: ReactNode; onClick?: () => void; to?: string; disabled?: boolean;
}) {
  const cls = "flex min-h-[7.5rem] flex-col items-center justify-center gap-2.5 rounded-[1.35rem] bg-[#f4f4f5] px-2 py-4 text-center transition active:scale-[.97]";
  const body = (
    <>
      {icon}
      <span className="text-[15px] font-medium leading-tight text-black/85">{label}</span>
      {sub && <span className="-mt-1.5 text-[11px] font-semibold text-black/45">{sub}</span>}
    </>
  );
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cx(cls, "disabled:active:scale-100")}>{body}</button>;
}

function AvailabilityTile({ ctx }: { ctx: DriverContext }) {
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
  const meta = {
    AVAILABLE: { label: "Disponible", dot: "bg-emerald-500", sub: "en service" },
    BUSY: { label: "En livraison", dot: "bg-orange-500", sub: "automatique" },
    OFFLINE: { label: "Hors ligne", dot: "bg-stone-400", sub: "en pause" },
  }[status];
  return (
    <Tile icon={<CubeTileIcon className="size-12" />} onClick={() => void toggle()} disabled={busy || status === "BUSY"}
      label={meta.label} sub={<span className="inline-flex items-center gap-1"><span className={cx("size-2 rounded-full", meta.dot)} />{meta.sub}</span>} />
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
      className="mt-4 flex w-full items-center gap-3 rounded-[1.35rem] bg-black p-4 text-left text-[15px] font-bold text-white">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--neon)] text-black"><BellRing className="size-5 animate-shake" /></span>
      Touchez ici pour activer le son et les alertes de nouvelles commandes
    </button>
  );
}

function SectionTitle({ title, to, action = "Tout voir" }: { title: string; to?: string; action?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between gap-3">
      <h2 className="text-[1.3rem] font-bold tracking-tight">{title}</h2>
      {to && <Link to={to} className="text-[1.05rem] font-medium text-black/55 hover:text-black">{action}</Link>}
    </div>
  );
}

const STAGE: Record<string, string> = { ASSIGNED: "À récupérer", OUT_FOR_DELIVERY: "En route", DELIVERED: "Livrée" };

function DeliveryCard({ order }: { order: OrderWithItems }) {
  return (
    <Link to={`/commande/${order.id}`} className="w-[13.5rem] shrink-0 snap-start rounded-[1.35rem] bg-[#f4f4f5] p-4 transition active:scale-[.98]">
      <div className="flex items-center gap-2">
        <DzFlag className="size-9" />
        <ArrowRight className="size-5 text-black/55" />
        <span className={cx("ml-auto whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold",
          order.status === "DELIVERED" ? "bg-[var(--neon)]/60" : "bg-[var(--neon)]")}>
          {STAGE[order.status] ?? order.status}
        </span>
      </div>
      <p className="mt-3 truncate text-[15px] font-medium">Restaurant <span className="text-black/45">→</span> {order.commune}</p>
      <p className="mt-0.5 truncate text-[14px] text-black/50">Commande {order.order_number}</p>
    </Link>
  );
}

const PHOTOS: [RegExp, string][] = [
  [/chapati/i, "/menu/chapati-close.webp"],
  [/pizza/i, "/menu/pizza-1.webp"],
  [/bol|bowl/i, "/menu/bol-pasta.webp"],
];

function MenuStrip({ menu }: { menu: MenuCategory[] }) {
  const items = useMemo(() => {
    const lists = menu.map((c) => c.products.filter((p) => p.available).map((p) => ({ p, category: c.name })));
    const mixed: { p: MenuCategory["products"][number]; category: string }[] = [];
    for (let i = 0; mixed.length < 12 && lists.some((l) => l[i]); i++) {
      for (const l of lists) if (l[i] && mixed.length < 12) mixed.push(l[i]!);
    }
    return mixed;
  }, [menu]);
  if (items.length === 0) return null;
  return (
    <>
      <SectionTitle title="Au menu aujourd'hui" />
      <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
        {items.map(({ p, category }) => {
          const photo = p.image_url ?? PHOTOS.find(([re]) => re.test(category) || re.test(p.name))?.[1];
          return (
            <article key={p.id} className="w-[9.5rem] shrink-0 snap-start overflow-hidden rounded-[1.1rem] bg-white shadow-[0_4px_16px_-6px_rgb(0_0_0/0.18)] ring-1 ring-black/5">
              <div className="relative h-24 bg-[#f4f4f5]">
                {photo
                  ? <img src={photo} alt="" loading="lazy" className="size-full object-cover" />
                  : <span className="grid size-full place-items-center text-4xl" aria-hidden>🍽️</span>}
                <DzFlag className="absolute left-2 top-2 size-7 ring-2 ring-white" />
              </div>
              <div className="p-2.5">
                <p className="text-[1.1rem] font-extrabold leading-tight">{formatDA(p.price)}</p>
                <p className="mt-0.5 truncate text-[14px] font-medium">{p.name}</p>
                <p className="truncate text-[11px] text-black/45">{p.description || category}</p>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const links = [
    { to: "/recherche", label: "Rechercher une commande", icon: Search },
    { to: "/historique", label: "Historique des livraisons", icon: History },
    { to: "/compte", label: "Mon compte et réglages", icon: UserRound },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Menu">
      <nav className="flex flex-col gap-2">
        {links.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} onClick={onClose}
            className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 font-bold transition hover:bg-surface-3">
            <Icon className="size-5" /> <span className="flex-1">{label}</span> <ChevronRight className="size-4 text-fg-muted" />
          </Link>
        ))}
        <button type="button" onClick={() => void signOut()}
          className="mt-2 flex items-center gap-3 rounded-2xl px-4 py-3.5 font-bold text-red-500 transition hover:bg-surface-2">
          <LogOut className="size-5" /> Se déconnecter
        </button>
      </nav>
    </Sheet>
  );
}

/**
 * Tableau de bord du livreur, d'après la maquette « couverture application
 * livreur » : barre noire (menu, logo, compte), carte jaune fluo (livraison en
 * cours et ses étapes, ou statut), puis tuiles, livraisons et menu du jour.
 */
export function OrdersPage({ ctx }: { ctx: DriverContext }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  useEffect(() => {
    fetchMenu().then(setMenu, () => undefined);
  }, []);

  const active = ctx.orders
    .filter((o) => o.status === "ASSIGNED" || o.status === "OUT_FOR_DELIVERY")
    .sort((a, b) => (a.assigned_at ?? "").localeCompare(b.assigned_at ?? ""));
  const dayStart = algiersDayStart();
  const today = ctx.orders
    .filter((o) => o.status === "DELIVERED" && (o.delivered_at ?? "") >= dayStart)
    .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""));
  const cashToday = today.reduce((sum, o) => sum + o.total, 0);
  const current = active[0];
  const cards = [...active, ...today];

  return (
    <div className="min-h-dvh bg-[#0d0d0d]">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <header className="flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Menu"
            className="mt-4 grid size-14 place-items-center rounded-full border-2 border-white/85 text-white transition active:scale-95">
            <Menu className="size-6" strokeWidth={2.4} />
          </button>
          <LogoCutout className="relative z-10 -mb-9 h-[7.5rem] drop-shadow-[0_8px_14px_rgb(0_0_0/0.45)]" />
          <Link to="/compte" aria-label={`Mon compte (${ctx.live ? "en direct" : "reconnexion"})`}
            className="relative mt-4 grid size-14 place-items-center rounded-full bg-[var(--neon)] text-lg font-extrabold text-black ring-[3px] ring-[#0d0d0d] outline-2 outline-[var(--neon)]">
            {initials(ctx.driver.name)}
            <span className={cx("absolute bottom-0 right-0 size-4 rounded-full ring-[3px] ring-[#0d0d0d]", ctx.live ? "bg-emerald-500" : "bg-stone-400")} />
          </Link>
        </header>
        <h1 className="sr-only">Tableau de bord livreur</h1>

        <section className="rounded-t-[2rem] bg-[var(--neon)] px-5 pb-14 pt-[3.4rem] text-black" aria-label="Livraison en cours">
          {current ? <CurrentDelivery order={current} others={active.length - 1} /> : <StatusCard ctx={ctx} delivered={today.length} />}
        </section>

        <section className="relative -mt-8 flex-1 rounded-t-[2rem] bg-white px-5 pb-nav pt-5 text-black">
          <div className="grid grid-cols-3 gap-3">
            <AvailabilityTile ctx={ctx} />
            <Tile icon={<CalcIcon className="size-12" />} to="/historique" label={formatDA(cashToday)} sub="encaissé aujourd'hui" />
            <Tile icon={<ReceiptIcon className="size-12" />} to="/historique" label="Historique" sub={`${today.length} livrée${today.length > 1 ? "s" : ""}`} />
          </div>

          <AlertsPrompt />
          {ctx.locationError && (
            <p className="mt-4 rounded-[1.35rem] bg-[#f4f4f5] p-4 text-sm font-semibold text-black/75">📡 {ctx.locationError}</p>
          )}

          <SectionTitle title="Livraisons actives" to="/historique" />
          {cards.length === 0 ? (
            <p className="rounded-[1.35rem] bg-[#f4f4f5] p-5 text-center text-[15px] text-black/55">
              Aucune livraison pour le moment. Les nouvelles commandes apparaîtront ici automatiquement.
            </p>
          ) : (
            <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
              {cards.map((o) => <DeliveryCard key={o.id} order={o} />)}
            </div>
          )}

          <MenuStrip menu={menu} />
        </section>
      </div>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
