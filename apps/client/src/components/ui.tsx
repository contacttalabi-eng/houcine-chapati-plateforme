import { Link, Logo, cx, usePath, type Product } from "@hc/shared";
import { ChevronLeft, House, Minus, Plus, ReceiptText, Search, Settings2, ShoppingBag } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useCart } from "../state/cart";
import { CART_BUMP_EVENT } from "../state/fly";

const CATEGORY_EMOJI: [RegExp, string][] = [
  [/boisson|jus|soda|milk|frapp/i, "🥤"],
  [/pizza/i, "🍕"],
  [/chapati/i, "🌯"],
  [/snack|bol|formule/i, "🍟"],
];

export function emojiFor(name: string): string {
  return CATEGORY_EMOJI.find(([re]) => re.test(name))?.[1] ?? "🍽️";
}

export function ProductImage({
  product, categoryName, className,
}: { product: Pick<Product, "image_url" | "name">; categoryName: string; className?: string }) {
  if (product.image_url) {
    return (
      <img
        src={product.image_url}
        alt=""
        loading="lazy"
        decoding="async"
        data-product-image
        className={cx("bg-surface-2 object-cover", className)}
      />
    );
  }
  return (
    <div className={cx("grid place-items-center bg-surface-2 text-4xl", className)} aria-hidden data-product-image>
      {emojiFor(`${categoryName} ${product.name}`)}
    </div>
  );
}

export function QuantityStepper({
  value, onChange, min = 1, max = 50, size = "md", label, solid = false,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: "md" | "lg"; label: string; solid?: boolean }) {
  const btn = cx(
    "grid place-items-center rounded-full transition active:scale-90 disabled:opacity-40",
    solid ? "text-white hover:bg-white/15" : "bg-surface-2 text-fg ring-1 ring-inset ring-line hover:bg-brand hover:text-white",
    size === "lg" ? "size-12" : "size-9",
  );
  return (
    <div className={cx("flex items-center gap-1", solid && "rounded-full bg-brand p-1 text-white shadow-lg shadow-brand/30")}
      role="group" aria-label={`Quantité : ${label}`}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Diminuer">
        <Minus className="size-4" />
      </button>
      <output className={cx("min-w-9 text-center font-extrabold tabular-nums", size === "lg" && "text-xl")} aria-live="polite">
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Augmenter">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/** Bouton panier avec pastille du nombre d'articles. */
export function CartButton({ className }: { className?: string }) {
  const { summary } = useCart();
  return (
    <Link to="/panier"
      className={cx("relative grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 ring-1 ring-inset ring-line transition hover:bg-surface-3", className)}
      aria-label={`Panier : ${summary.count} article(s)`}>
      <ShoppingBag className="size-5" />
      {summary.count > 0 && (
        <span key={summary.count} className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-white ring-2 ring-bg animate-pop">
          {summary.count}
        </span>
      )}
    </Link>
  );
}

/** En-tête des pages secondaires (panier, commande, suivi) : retour, logo, panier. */
export function TopBar({ back, title }: { back?: string; title?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-nav backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        {back ? (
          <Link to={back} className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Retour">
            <ChevronLeft className="size-6" />
          </Link>
        ) : null}
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="Accueil Houcine Chapati">
          <Logo size={36} />
          {title ?? (
            <span className="font-display text-xl uppercase leading-none tracking-wide">
              Houcine <span className="text-fire">Chapati</span>
            </span>
          )}
        </Link>
        <CartButton className="ml-auto" />
      </div>
    </header>
  );
}

/** En-tête des onglets (Recherche, Mes commandes, Profil). */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-nav backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{title}</h1>
          {subtitle && <p className="truncate text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export const TAB_PATHS = ["/", "/recherche", "/mes-commandes", "/reglages"] as const;

const TABS = [
  { to: "/", label: "Accueil", aria: "Accueil", icon: House },
  { to: "/recherche", label: "Recherche", aria: "Recherche", icon: Search },
  { to: "/mes-commandes", label: "Commandes", aria: "Mes commandes", icon: ReceiptText },
  { to: "/reglages", label: "Réglages", aria: "Réglages", icon: Settings2 },
] as const;

/** Colonne de chaque onglet dans la barre (la 3e, au centre, est le panier). */
const TAB_COLUMNS = [0, 1, 3, 4] as const;

function NavTab({ tab: { to, label, aria, icon: Icon }, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  return (
    <li className="relative z-[1]">
      <Link to={to} aria-current={active ? "page" : undefined} aria-label={aria}
        className={cx("flex h-full flex-col items-center justify-center gap-1 transition-colors duration-300",
          active ? "text-accent" : "text-fg-muted hover:text-fg")}>
        {/* la clé change à la sélection : l'icône rebondit */}
        <Icon key={active ? "on" : "off"} className={cx("size-[1.4rem]", active && "animate-nav-pop")}
          strokeWidth={active ? 2.3 : 1.8} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.16 : 0} />
        <span className={cx("text-[10.5px] leading-none tracking-wide", active ? "font-extrabold" : "font-semibold")}>{label}</span>
      </Link>
    </li>
  );
}

/**
 * Bouton panier au centre de la barre. Il rebondit quand un plat y arrive
 * (événement « hc:panier » envoyé à la fin de l'animation d'ajout).
 */
function NavCartButton() {
  const { summary } = useCart();
  const [bumps, setBumps] = useState(0);
  useEffect(() => {
    const bump = () => setBumps((n) => n + 1);
    window.addEventListener(CART_BUMP_EVENT, bump);
    return () => window.removeEventListener(CART_BUMP_EVENT, bump);
  }, []);
  return (
    <li className="relative z-[2] flex justify-center">
      <Link to="/panier" aria-label={`Panier : ${summary.count} article(s)`} title="Panier" data-cart-target
        className="absolute -top-6 flex flex-col items-center gap-1">
        <span key={bumps} className={cx("relative grid size-[3.6rem] place-items-center rounded-[1.35rem] bg-brand text-white shadow-lg shadow-brand/40 ring-[5px] ring-bg transition hover:bg-brand-hi active:scale-90",
          bumps > 0 && "animate-cart-bump")}>
          {bumps > 0 && <span className="absolute inset-0 rounded-[1.35rem] animate-cart-ring" aria-hidden />}
          <ShoppingBag className="size-6" strokeWidth={2.2} />
          {summary.count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-5.5 place-items-center rounded-full bg-fg px-1 text-[11px] font-extrabold leading-5.5 text-bg ring-2 ring-bg tabular-nums">
              {summary.count}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/**
 * Navigation principale : barre flottante aux coins arrondis, au-dessus de la
 * barre d'accueil de l'iPhone. Une pastille glisse sous l'onglet choisi.
 */
export function BottomNav() {
  const raw = usePath();
  // Le menu d'une catégorie fait partie de l'accueil
  const path = raw.startsWith("/categorie/") ? "/" : raw;
  const activeIndex = TABS.findIndex((t) => t.to === path);
  const [home, search, orders, settings] = TABS;
  return (
    <nav aria-label="Navigation principale"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto relative mx-auto max-w-lg rounded-[1.75rem] border border-line bg-nav shadow-[0_14px_40px_-12px_rgb(0_0_0/0.35)] backdrop-blur-xl">
        {activeIndex >= 0 && (
          <span aria-hidden
            className="absolute inset-y-1.5 left-0 w-1/5 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ transform: `translateX(${TAB_COLUMNS[activeIndex]! * 100}%)` }}>
            <span className="mx-auto block h-full w-[86%] rounded-[1.2rem] bg-accent/12" />
          </span>
        )}
        <ul className="relative grid h-[4.25rem] grid-cols-5">
          <NavTab tab={home} active={path === home.to} />
          <NavTab tab={search} active={path === search.to} />
          <NavCartButton />
          <NavTab tab={orders} active={path === orders.to} />
          <NavTab tab={settings} active={path === settings.to} />
        </ul>
      </div>
    </nav>
  );
}

export function Section({ title, children, className, action }: { title: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cx("rounded-3xl border border-line bg-surface p-4 card-shadow sm:p-6", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
