import { Link, cx, usePath } from "@hc/shared";
import { History, House, Search, UserRound } from "lucide-react";
import type { ReactNode } from "react";

export const TAB_PATHS = ["/", "/recherche", "/historique", "/compte"] as const;

const TABS = [
  { to: "/", label: "Accueil", icon: House },
  { to: "/recherche", label: "Recherche", icon: Search },
  { to: "/historique", label: "Historique", icon: History },
  { to: "/compte", label: "Compte", icon: UserRound },
] as const;

/**
 * Navigation principale du livreur : barre flottante en verre dépoli, une
 * pastille glisse sous l'onglet choisi ; pastille rouge sur l'accueil quand
 * des commandes sont en cours.
 */
export function BottomNav({ activeOrders }: { activeOrders: number }) {
  const path = usePath();
  const index = TABS.findIndex((t) => t.to === path);
  return (
    <nav aria-label="Navigation livreur"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto relative mx-auto max-w-lg rounded-[1.75rem] border border-line bg-nav shadow-[0_14px_40px_-12px_rgb(0_0_0/0.5)] backdrop-blur-xl">
        {index >= 0 && (
          <span aria-hidden className="absolute inset-y-1.5 left-0 w-1/4 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ transform: `translateX(${index * 100}%)` }}>
            <span className="mx-auto block h-full w-[84%] rounded-[1.2rem] bg-accent/15" />
          </span>
        )}
        <ul className="relative grid h-[4.25rem] grid-cols-4">
          {TABS.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <li key={to} className="relative">
                <Link to={to} aria-current={active ? "page" : undefined} aria-label={label}
                  className={cx("flex h-full flex-col items-center justify-center gap-1 transition-colors duration-300",
                    active ? "text-accent" : "text-fg-muted hover:text-fg")}>
                  <span className="relative">
                    <Icon key={active ? "on" : "off"} className={cx("size-[1.4rem]", active && "animate-nav-pop")}
                      strokeWidth={active ? 2.3 : 1.8} />
                    {to === "/" && activeOrders > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold leading-5 text-white ring-2 ring-bg">
                        {activeOrders}
                      </span>
                    )}
                  </span>
                  <span className={cx("text-[10.5px] leading-none tracking-wide", active ? "font-extrabold" : "font-semibold")}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/** En-tête des onglets (Recherche, Historique, Compte). */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
