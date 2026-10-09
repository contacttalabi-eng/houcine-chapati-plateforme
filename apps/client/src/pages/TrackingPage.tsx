import {
  Button, ButtonLink, CUSTOMER_STEPS, ConfirmSheet, EmptyState, LiveIndicator, Link, STATUS_META, Spinner,
  cancelMyOrder, cx, errorMessage, fetchOrderDetail, fetchOrderDriver, formatDA, formatDateTime, formatPhone,
  formatTime, stepIndex, telHref, toast, useRealtime, useResyncOnFocus, useSession,
  type OrderDetail, type OrderDriverInfo,
} from "@hc/shared";
import { PointsMap, toLatLng, type MapPoint } from "@hc/shared/maps";
import { Bike, ClipboardList, PartyPopper, Phone, SearchX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TopBar } from "../components/ui";
import { useMenu } from "../state/menu";

function StatusHero({ order }: { order: OrderDetail }) {
  const meta = STATUS_META[order.status];
  const delivered = order.status === "DELIVERED";
  const cancelled = order.status === "CANCELLED";
  return (
    <section
      key={order.status}
      className={cx(
        "relative overflow-hidden rounded-3xl border p-6 text-center animate-fade-up",
        delivered ? "border-emerald-500/40 bg-emerald-500/10" : cancelled ? "border-red-500/40 bg-red-500/10" : "border-flame/30 bg-surface",
      )}
      aria-live="polite"
    >
      {!cancelled && !delivered && (
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-flame/20 blur-3xl" aria-hidden />
      )}
      <div className="relative text-6xl animate-pop" aria-hidden>{meta.emoji}</div>
      <h1 className="relative mt-3 text-2xl font-extrabold">
        {delivered ? "Votre commande a été livrée" : meta.customerLabel}
      </h1>
      <p className="relative mt-1 text-fg-muted">
        {cancelled && order.cancel_reason ? `Motif : ${order.cancel_reason}` : meta.customerHint}
      </p>
      <p className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-1.5 font-mono text-sm font-bold">
        <ClipboardList className="size-4 text-accent" /> {order.order_number}
      </p>
    </section>
  );
}

function Timeline({ order }: { order: OrderDetail }) {
  const current = stepIndex(order.status);
  const timeOf = (status: string) => order.order_status_history.find((h) => h.status === status)?.created_at;
  if (order.status === "CANCELLED") return null;
  return (
    <ol className="relative flex flex-col gap-0" aria-label="Étapes de la commande">
      {CUSTOMER_STEPS.map((step, i) => {
        const done = i <= current;
        const isCurrent = i === current && order.status !== "DELIVERED";
        const meta = STATUS_META[step];
        return (
          <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
            {i < CUSTOMER_STEPS.length - 1 && (
              <span className={cx("absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5", i < current ? "bg-flame" : "bg-surface-3")} aria-hidden />
            )}
            <span
              className={cx(
                "relative grid size-10 shrink-0 place-items-center rounded-full text-lg transition",
                done ? "bg-flame/20" : "bg-surface-2 grayscale opacity-50",
                isCurrent && "animate-ring",
              )}
              aria-hidden
            >
              {meta.emoji}
            </span>
            <div className="pt-1.5">
              <p className={cx("font-extrabold", !done && "text-fg-muted")}>
                {meta.customerLabel}
                {isCurrent && <span className="ml-2 rounded-full bg-flame px-2 py-0.5 text-[11px] font-extrabold uppercase text-white">En cours</span>}
              </p>
              {done && timeOf(step) && <p className="text-sm text-fg-muted">{formatTime(timeOf(step))}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DriverCard({ order, shareLocation }: { order: OrderDetail; shareLocation: boolean }) {
  const [driver, setDriver] = useState<OrderDriverInfo | null>(null);
  const enRoute = order.status === "OUT_FOR_DELIVERY";

  useEffect(() => {
    let stop = false;
    const load = () => fetchOrderDriver(order.id).then((d) => { if (!stop) setDriver(d); }, () => undefined);
    void load();
    // position du livreur (si le restaurant l'autorise) : rafraîchie toutes les 20 s
    const timer = enRoute && shareLocation ? window.setInterval(load, 20_000) : undefined;
    return () => { stop = true; window.clearInterval(timer); };
  }, [order.id, order.status, enRoute, shareLocation]);

  if (!driver) return null;
  const driverPos = toLatLng(driver.latitude, driver.longitude);
  const points: MapPoint[] = [
    { id: "home", position: { lat: order.customer_latitude, lng: order.customer_longitude }, emoji: "🏠", color: "bg-brand", label: "Chez vous" },
    ...(driverPos ? [{ id: "driver", position: driverPos, emoji: "🛵", color: "bg-sky-600", label: driver.name, pulse: true }] : []),
  ];

  return (
    <section className="rounded-3xl border border-sky-500/30 bg-sky-500/10 p-5 animate-fade-up">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-sky-600 text-white"><Bike className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg-muted">{enRoute ? "Votre livreur est en route" : "Votre livreur"}</p>
          <p className="truncate text-lg font-extrabold">{driver.name}</p>
        </div>
        <ButtonLink href={telHref(driver.phone)} variant="info" size="md" icon={<Phone className="size-4" />} aria-label={`Appeler ${driver.name}`}>
          Appeler
        </ButtonLink>
      </div>
      {driverPos && <PointsMap points={points} className="mt-4 h-56" />}
    </section>
  );
}

export function TrackingPage({ id }: { id: string }) {
  const session = useSession();
  const { settings } = useMenu();
  const [order, setOrder] = useState<OrderDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [justOrdered] = useState(() => {
    try {
      const value = sessionStorage.getItem("hc-commande-envoyee") === id;
      sessionStorage.removeItem("hc-commande-envoyee");
      return value;
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    try {
      setOrder(await fetchOrderDetail(id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) setOrder(null);
    else void load();
  }, [session, load]);

  // Supabase Realtime : le statut change sans recharger la page
  const live = useRealtime(session ? `order-${id}` : null, [{ table: "orders", filter: `id=eq.${id}` }],
    () => void load(), () => void load());
  useResyncOnFocus(() => { if (session) void load(); });

  const cancel = async () => {
    setCancelling(true);
    try {
      await cancelMyOrder(id);
      toast.success("Commande annulée");
      setConfirmCancel(false);
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  };

  if (session === undefined || (order === undefined && !error)) {
    return <div className="min-h-dvh"><TopBar back="/" /><div className="grid place-items-center py-24"><Spinner className="size-8" /></div></div>;
  }

  if (!order) {
    return (
      <div className="min-h-dvh">
        <TopBar back="/" />
        <EmptyState className="pt-20" icon={<SearchX className="size-7" />} title="Commande introuvable"
          action={<Link to="/"><Button>Retour au menu</Button></Link>}>
          {error ?? "Cette commande n'existe pas ou a été passée depuis un autre téléphone / navigateur."}
        </EmptyState>
      </div>
    );
  }

  const showDriver = order.status === "ASSIGNED" || order.status === "OUT_FOR_DELIVERY";

  return (
    <div className="min-h-dvh pb-12">
      <TopBar back="/" />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-6">
        {justOrdered && (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/15 p-4 text-success animate-fade-up">
            <PartyPopper className="size-6 shrink-0" />
            <p className="font-bold">Merci ! Votre commande a bien été envoyée au restaurant.</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-fg-muted">Commande passée : {formatDateTime(order.created_at)}</p>
          <LiveIndicator live={live} />
        </div>

        <StatusHero order={order} />
        {showDriver && <DriverCard order={order} shareLocation={settings?.share_driver_location ?? false} />}

        <section className="rounded-3xl border border-line bg-surface card-shadow p-5">
          <h2 className="mb-5 text-lg font-extrabold">Suivi</h2>
          <Timeline order={order} />
        </section>

        <section className="rounded-3xl border border-line bg-surface card-shadow p-5">
          <h2 className="mb-3 text-lg font-extrabold">Détail</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {order.order_items.map((item) => (
              <li key={item.id} className="flex gap-2">
                <span className="font-extrabold text-accent">{item.quantity}×</span>
                <span className="flex-1">
                  {item.product_name}
                  {item.options.length > 0 && <span className="block text-xs text-fg-muted">{item.options.map((o) => o.name).join(" · ")}</span>}
                </span>
                <span className="tabular-nums">{formatDA(item.total)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-fg-muted"><dt>Livraison</dt><dd>{order.delivery_fee ? formatDA(order.delivery_fee) : "Offerte"}</dd></div>
            <div className="flex justify-between text-lg font-extrabold"><dt>Total</dt><dd className="text-price">{formatDA(order.total)}</dd></div>
          </dl>
          <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm">
            <p className="font-bold">{order.customer_name} · {formatPhone(order.customer_phone)}</p>
            <p className="text-fg-muted">{order.customer_address}, {order.commune}, {order.wilaya}</p>
            {order.delivery_instructions && <p className="mt-2">📝 {order.delivery_instructions}</p>}
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          {settings?.phone && (
            <ButtonLink href={telHref(settings.phone)} variant="secondary" size="lg" full icon={<Phone className="size-5" />}>
              Appeler le restaurant
            </ButtonLink>
          )}
          {order.status === "PENDING" && (
            <Button variant="outline" size="lg" full onClick={() => setConfirmCancel(true)}>Annuler la commande</Button>
          )}
          {(order.status === "DELIVERED" || order.status === "CANCELLED") && (
            <Link to="/" className="w-full"><Button size="lg" full>Commander à nouveau</Button></Link>
          )}
        </div>
      </main>

      <ConfirmSheet open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={cancel} loading={cancelling}
        title="Annuler la commande ?" confirmLabel="Oui, annuler" variant="danger">
        Vous pouvez annuler tant que le restaurant n'a pas confirmé votre commande.
      </ConfirmSheet>
    </div>
  );
}
