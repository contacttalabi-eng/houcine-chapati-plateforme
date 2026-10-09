import {
  Button, LiveIndicator, Link, Logo, cx, isAudioUnlocked, playChime, requestSystemNotifications, signOut, toast,
  unlockAudio, usePath,
} from "@hc/shared";
import { Bike, ClipboardList, LayoutDashboard, LogOut, Settings, UtensilsCrossed, Volume2, VolumeX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAdmin } from "../state/admin";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/commandes", label: "Commandes", icon: ClipboardList },
  { to: "/livreurs", label: "Livreurs", icon: Bike },
  { to: "/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/reglages", label: "Réglages", icon: Settings },
];

function SoundButton() {
  const [on, setOn] = useState(isAudioUnlocked());
  return (
    <Button variant={on ? "secondary" : "primary"} size="sm"
      className={cx(!on && "animate-pulse")}
      icon={on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      onClick={async () => {
        unlockAudio();
        playChime();
        await requestSystemNotifications();
        setOn(true);
        toast.success("Son et notifications activés pour les nouvelles commandes");
      }}>
      <span className="hidden sm:inline">{on ? "Son activé" : "Activer le son"}</span>
    </Button>
  );
}

export function Shell({ email, children }: { email: string; children: ReactNode }) {
  const path = usePath();
  const { live, orders, driverApplications } = useAdmin();
  const pending = orders.filter((o) => o.status === "PENDING").length;
  const pendingDrivers = driverApplications.filter((a) => a.status === "PENDING").length;
  const badge = (to: string) => (to === "/commandes" ? pending : to === "/livreurs" ? pendingDrivers : 0);
  const isActive = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center gap-3 px-5 py-5">
          <Logo size={44} />
          <div>
            <p className="font-display text-xl uppercase leading-none tracking-wide">Houcine <span className="text-brand">Chapati</span></p>
            <p className="text-xs font-bold text-fg-muted">Administration</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to}
              className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition",
                isActive(to) ? "bg-brand text-white shadow-md shadow-brand/25" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
              <Icon className="size-5" />
              <span className="flex-1">{label}</span>
              {badge(to) > 0 && (
                <span className={cx("rounded-full px-2 text-xs font-extrabold", isActive(to) ? "bg-white text-brand" : "bg-brand text-white")}>{badge(to)}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-4 text-sm">
          <p className="truncate font-semibold" title={email}>{email}</p>
          <button type="button" onClick={() => void signOut()} className="mt-2 flex items-center gap-2 font-bold text-fg-muted hover:text-brand">
            <LogOut className="size-4" /> Se déconnecter
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-20 lg:pb-0">
        <header className="sticky top-0 z-20 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-3 border-b border-line bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:px-8">
          <Logo size={36} className="lg:hidden" />
          <p className="font-extrabold lg:hidden">Administration</p>
          <div className="ml-auto flex items-center gap-3">
            <LiveIndicator live={live} />
            <SoundButton />
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => void signOut()} aria-label="Se déconnecter">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>

      {/* Navigation mobile / tablette */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface safe-bottom lg:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to}
            className={cx("relative flex flex-col items-center gap-0.5 pt-2 text-[11px] font-bold", isActive(to) ? "text-brand" : "text-fg-muted")}>
            <Icon className="size-5" />
            {label.split(" ")[0]}
            {badge(to) > 0 && (
              <span className="absolute right-[22%] top-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] text-white">{badge(to)}</span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide lg:text-4xl">{title}</h1>
        {subtitle && <p className="text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
