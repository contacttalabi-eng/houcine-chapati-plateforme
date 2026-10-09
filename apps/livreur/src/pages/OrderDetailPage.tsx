import {
  Button, ButtonLink, ConfirmSheet, EmptyState, Link, StatusBadge, completeDelivery, errorMessage, fetchSettings,
  formatDA, formatDistance, formatDuration, formatPhone, navigate, startDelivery, telHref, toast,
  type LatLng, type RestaurantSettings,
} from "@hc/shared";
import { PointsMap, directionsUrl, toLatLng, type MapPoint, type RouteInfo } from "@hc/shared/maps";
import { ChevronLeft, CircleCheck, MessageSquare, Phone, RefreshCw, SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DriverContext } from "../App";

export function OrderDetailPage({ ctx, orderId }: { ctx: DriverContext; orderId: string }) {
  const order = ctx.orders.find((o) => o.id === orderId);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeKey, setRouteKey] = useState(0);
  const [confirmDelivered, setConfirmDelivered] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSettings().then(setSettings, () => undefined); }, []);

  const restaurant = settings ? toLatLng(settings.latitude, settings.longitude) : null;
  const customer: LatLng | null = order ? { lat: order.customer_latitude, lng: order.customer_longitude } : null;
  // Itinéraire affiché : position du livreur → client (sinon restaurant → client)
  const origin = ctx.position ?? restaurant;

  const points = useMemo<MapPoint[]>(() => {
    const list: MapPoint[] = [];
    if (customer) list.push({ id: "customer", position: customer, emoji: "🏠", color: "bg-brand", label: "Client" });
    if (restaurant) list.push({ id: "restaurant", position: restaurant, emoji: "🍽️", color: "bg-ink-2", label: "Restaurant" });
    if (ctx.position) list.push({ id: "me", position: ctx.position, emoji: "🛵", color: "bg-sky-600", label: "Moi", pulse: true });
    return list;
  }, [restaurant?.lat, restaurant?.lng, customer?.lat, customer?.lng, ctx.position?.lat, ctx.position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order || !customer) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <EmptyState icon={<SearchX className="size-7" />} title="Commande indisponible"
          action={<Link to="/"><Button size="lg">Mes commandes</Button></Link>}>
          Elle a peut-être été retirée ou réassignée par le restaurant.
        </EmptyState>
      </div>
    );
  }

  const isAssigned = order.status === "ASSIGNED";
  const isEnRoute = order.status === "OUT_FOR_DELIVERY";

  // « Démarrer l'itinéraire » : ouvre Google Maps (navigation depuis la position du téléphone)
  // et, si besoin, passe la commande « en livraison » (le client voit « Livreur en route »).
  const onStartRoute = () => {
    if (!isAssigned) return;
    startDelivery(order.id).then(
      () => { toast.success("Le client est prévenu : livreur en route 🛵"); void ctx.reload(); },
      (e: unknown) => toast.error(errorMessage(e)),
    );
  };

  const markDelivered = async () => {
    setSaving(true);
    try {
      await completeDelivery(order.id);
      toast.success(`Commande ${order.order_number} livrée ✅`);
      setConfirmDelivered(false);
      await ctx.reload();
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-44">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/90 px-3 py-3 backdrop-blur-md">
        <Link to="/" className="grid size-12 place-items-center rounded-full hover:bg-surface-2" aria-label="Retour à mes commandes">
          <ChevronLeft className="size-7" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-lg font-extrabold">{order.order_number}</p>
        </div>
        <StatusBadge status={order.status} className="text-sm" />
      </header>

      <div className="relative">
        <PointsMap
          points={points}
          className="h-[46dvh] rounded-none"
          route={origin ? { from: origin, to: customer, requestKey: routeKey, onInfo: setRoute } : null}
        />
        {route?.distanceMeters != null && (
          <div className="absolute left-3 top-3 rounded-2xl bg-black/80 px-4 py-2 text-white shadow-lg">
            <span className="text-lg font-extrabold">{route.durationMillis != null ? formatDuration(route.durationMillis) : ""}</span>
            <span className="ml-2 text-sm text-white/80">{formatDistance(route.distanceMeters)}</span>
          </div>
        )}
        <button type="button" onClick={() => setRouteKey((k) => k + 1)}
          className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-black/80 text-white shadow-lg"
          aria-label="Recalculer l'itinéraire">
          <RefreshCw className="size-5" />
        </button>
      </div>

      <main className="flex flex-col gap-4 px-4 pt-4">
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-2xl font-extrabold">{order.customer_name}</p>
          <p className="mt-1 text-lg">{order.customer_address}</p>
          <p className="text-fg-muted">{order.commune}, {order.wilaya}</p>
          {order.delivery_instructions && (
            <p className="mt-3 flex gap-2 rounded-2xl bg-gold/15 p-3 text-lg font-bold text-gold">
              <MessageSquare className="mt-1 size-5 shrink-0" /> {order.delivery_instructions}
            </p>
          )}
          <ButtonLink href={telHref(order.customer_phone)} variant="secondary" size="xl" full className="mt-4"
            icon={<Phone className="size-6" />}>
            Appeler · {formatPhone(order.customer_phone)}
          </ButtonLink>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-lg font-extrabold">Contenu du sac</h2>
          <ul className="flex flex-col gap-2">
            {order.order_items.map((item) => (
              <li key={item.id} className="flex gap-3 text-lg">
                <span className="font-extrabold text-flame">{item.quantity}×</span>
                <span className="flex-1">
                  {item.product_name}
                  {item.options.length > 0 && <span className="block text-sm text-fg-muted">{item.options.map((o) => o.name).join(" · ")}</span>}
                </span>
              </li>
            ))}
          </ul>
          {order.additional_info && <p className="mt-3 text-sm text-fg-muted">Remarque : {order.additional_info}</p>}
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <span className="text-lg font-bold">À encaisser</span>
            <span className="text-3xl font-extrabold text-gold">{formatDA(order.total)}</span>
          </div>
        </section>
      </main>

      {/* Actions principales, toujours au pouce */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-3 safe-bottom">
          {(isAssigned || isEnRoute) && (
            <ButtonLink href={directionsUrl(customer)} target="_blank" rel="noopener noreferrer" onClick={onStartRoute}
              variant={isEnRoute ? "info" : "primary"} size="xl" full>
              🗺️ Démarrer l'itinéraire
            </ButtonLink>
          )}
          {isEnRoute && (
            <Button variant="success" size="xl" full icon={<CircleCheck className="size-7" />} onClick={() => setConfirmDelivered(true)}>
              Commande livrée
            </Button>
          )}
        </div>
      </div>

      <ConfirmSheet open={confirmDelivered} onClose={() => setConfirmDelivered(false)} onConfirm={markDelivered}
        loading={saving} variant="success" title="Confirmer la livraison ?" confirmLabel="✅ Oui, livrée">
        <p className="text-lg">
          Commande <b className="text-fg">{order.order_number}</b> remise à <b className="text-fg">{order.customer_name}</b>,
          montant encaissé : <b className="text-gold">{formatDA(order.total)}</b>.
        </p>
      </ConfirmSheet>
    </div>
  );
}
