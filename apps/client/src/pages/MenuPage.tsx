import {
  Link, Logo, STATUS_META, cx, fetchOrderDetail, formatDA, isFinal, telHref, useSession, type Order,
} from "@hc/shared";
import { Bike, ChevronRight, MapPin, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { ProductBrowser } from "../components/catalog";
import { lastOrderId } from "../state/cart";
import { useMenu } from "../state/menu";

function HomeHeader() {
  const { settings } = useMenu();
  return (
    <header className="sticky top-0 z-30 bg-nav backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand shadow-md shadow-brand/30">
          <Logo size={34} />
        </span>
        <p className="flex min-w-0 flex-1 items-center justify-center gap-1 text-sm text-fg-muted">
          <MapPin className="size-4 shrink-0 text-accent" aria-hidden />
          <span className="truncate">Livraison · Tizi Ouzou</span>
        </p>
        {settings?.phone ? (
          <a href={telHref(settings.phone)} aria-label="Appeler le restaurant"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-md shadow-brand/30 transition hover:bg-brand-hi">
            <Phone className="size-5" />
          </a>
        ) : <span className="size-11 shrink-0" aria-hidden />}
      </div>
    </header>
  );
}

function Greeting() {
  return (
    <div className="mb-4">
      <p className="text-[15px] font-bold text-accent">Bonjour 👋</p>
      <p className="mt-0.5 text-[1.7rem] font-extrabold leading-tight tracking-tight">Trouvez votre plat</p>
    </div>
  );
}

function WelcomeBanner() {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-brand p-5 text-white shadow-xl shadow-brand/20 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-amber/35 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -left-10 -z-10 size-56 rounded-full bg-black/25 blur-2xl" aria-hidden />
      <div className="relative max-w-[60%] sm:max-w-[55%]">
        <div className="flex items-center gap-2">
          <img src="/brand/logo.webp" alt="" width={36} height={36} className="size-9 rounded-full bg-white ring-2 ring-amber" />
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/85">Houcine Chapati</span>
        </div>
        <h1 className="mt-3 font-display text-[1.7rem] uppercase leading-[1.04] tracking-wide sm:text-5xl">
          Bienvenue chez Houcine Chapati
        </h1>
        <p className="mt-2 text-sm leading-snug text-white/90 sm:text-lg">Vos chapatis et pizzas préférés, en quelques clics !</p>
        <LiveStatus />
      </div>
      <img src="/menu/pnj-chapati.webp" alt="Chapati Houcine Chapati" width={900} height={443} fetchPriority="high"
        className="pointer-events-none absolute -right-[18%] top-1/2 w-[64%] max-w-[26rem] -translate-y-1/2 object-contain drop-shadow-[0_18px_22px_rgba(0,0,0,.45)] animate-fade-up sm:-right-[4%] sm:w-[48%]" />
    </section>
  );
}

/** État du restaurant en direct (ouvert / fermé, frais de livraison), dans la bannière. */
function LiveStatus() {
  const { settings } = useMenu();
  if (!settings) return <div className="mt-4 h-8" aria-hidden />;
  const open = settings.accepting_orders;
  const fee = settings.delivery_fee > 0 ? `Livraison ${formatDA(settings.delivery_fee)}` : "Livraison offerte";
  return (
    <div className="mt-4 flex flex-wrap gap-2 text-xs font-extrabold">
      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-stone-900 shadow-lg shadow-black/15">
        <span className="relative flex size-2.5" aria-hidden>
          {open && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />}
          <span className={cx("relative inline-flex size-2.5 rounded-full", open ? "bg-emerald-500" : "bg-red-500")} />
        </span>
        {open ? "Ouvert maintenant" : "Fermé pour le moment"}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm">
        <Bike className="size-4" aria-hidden />
        {fee}
        {settings.free_delivery_threshold != null && settings.delivery_fee > 0 && ` · offerte dès ${formatDA(settings.free_delivery_threshold)}`}
      </span>
    </div>
  );
}

function ActiveOrderBanner() {
  const session = useSession();
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    const id = lastOrderId();
    if (!session || !id) return;
    fetchOrderDetail(id).then((o) => setOrder(o && !isFinal(o.status) ? o : null), () => setOrder(null));
  }, [session]);
  if (!order) return null;
  const meta = STATUS_META[order.status];
  return (
    <Link to={`/suivi/${order.id}`}
      className="mt-4 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 animate-fade-up">
      <span className="text-2xl" aria-hidden>{meta.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">Suivre ma commande {order.order_number}</span>
        <span className="block text-sm text-fg-muted">{meta.customerLabel}</span>
      </span>
      <ChevronRight className="size-5 text-accent" />
    </Link>
  );
}

/** Accueil : bannière, recherche, catégories et produits. */
export function MenuPage() {
  return (
    <div className="min-h-dvh pb-nav">
      <HomeHeader />
      <main className="mx-auto max-w-5xl px-4 pt-2">
        <Greeting />
        <ActiveOrderBanner />
        <div className="mt-4">
          <ProductBrowser id="menu" mode="home" />
        </div>
        <div className="mt-8">
          <WelcomeBanner />
        </div>
      </main>
    </div>
  );
}
