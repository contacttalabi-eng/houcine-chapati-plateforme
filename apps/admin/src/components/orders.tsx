import {
  ADMIN_NEXT_STEP, Button, ButtonLink, ConfirmSheet, DriverStatusBadge, Field, STATUS_META, Sheet, StatusBadge,
  Textarea, assignDriver, cx, errorMessage, fetchOrderDetail, formatDA, formatPhone, formatTime, minutesSince,
  setOrderStatus, telHref, toast, useNow, type Driver, type OrderDetail, type OrderStatus, type OrderWithItems,
} from "@hc/shared";
import { PointsMap, placeUrl, toLatLng, type MapPoint } from "@hc/shared/maps";
import { Bike, Clock, ExternalLink, MapPin, MessageSquare, Phone, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAdmin } from "../state/admin";

// ----------------------------------------------------------------- actions

export function useOrderActions() {
  const [pending, setPending] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setPending(key);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setPending(null);
    }
  };
  return {
    pending,
    advance: (order: OrderWithItems, to: OrderStatus) =>
      run(`${order.id}:${to}`, () => setOrderStatus(order.id, to), `${order.order_number} → ${STATUS_META[to].label}`),
    cancel: (order: OrderWithItems, reason: string) =>
      run(`${order.id}:CANCELLED`, () => setOrderStatus(order.id, "CANCELLED", reason), `${order.order_number} annulée`),
    assign: (order: OrderWithItems, driver: Driver) =>
      run(`${order.id}:assign`, () => assignDriver(order.id, driver.id), `${order.order_number} assignée à ${driver.name}`),
  };
}

const elapsedTone = (minutes: number) =>
  minutes >= 30 ? "text-red-600 font-extrabold" : minutes >= 15 ? "text-orange-600 font-bold" : "text-fg-muted";

// ----------------------------------------------------------------- carte de commande

export function OrderCard({
  order, onOpen, onAssign, onCancel, compact,
}: {
  order: OrderWithItems;
  onOpen: () => void;
  onAssign: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const { drivers, freshOrderId } = useAdmin();
  const { advance, pending } = useOrderActions();
  const now = useNow();
  const next = ADMIN_NEXT_STEP[order.status];
  const driver = drivers.find((d) => d.id === order.driver_id);
  const waiting = minutesSince(order.created_at, now);
  const items = order.order_items.reduce((n, i) => n + i.quantity, 0);
  const fresh = freshOrderId === order.id;

  return (
    <article
      className={cx(
        "rounded-2xl border bg-surface p-4 shadow-sm transition hover:shadow-md animate-fade-up",
        fresh ? "border-brand ring-4 ring-brand/20" : "border-line",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="whitespace-nowrap font-mono text-sm font-extrabold">{order.order_number}</span>
          {fresh ? <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-extrabold uppercase text-white animate-pulse">Nouveau</span>
            : <StatusBadge status={order.status} />}
        </div>
        <p className="mt-2 truncate font-bold">{order.customer_name}</p>
        <p className="flex items-center gap-1 truncate text-sm text-fg-muted">
          <MapPin className="size-3.5 shrink-0" /> {order.commune} · {order.customer_address}
        </p>
        {!compact && (
          <p className="mt-2 line-clamp-2 text-sm">
            {order.order_items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 text-sm">
          <span className={cx("flex items-center gap-1 whitespace-nowrap", order.status === "DELIVERED" || order.status === "CANCELLED" ? "text-fg-muted" : elapsedTone(waiting))}>
            <Clock className="size-3.5" /> {formatTime(order.created_at)}
            {order.status !== "DELIVERED" && order.status !== "CANCELLED" && ` · ${waiting} min`}
          </span>
          <span className="whitespace-nowrap font-extrabold" title={`${items} article(s)`}>{formatDA(order.total)}</span>
        </div>
        {driver && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2 py-1 text-sm font-bold text-sky-700">
            <Bike className="size-4" /> {driver.name}
          </p>
        )}
      </button>

      {(next || order.status === "READY" || order.status === "PENDING") && (
        <div className="mt-3 flex gap-2">
          {order.status === "PENDING" && (
            <Button variant="outline" size="sm" onClick={onCancel} aria-label={`Refuser ${order.order_number}`}>
              <X className="size-4" />
            </Button>
          )}
          {next && (
            <Button size="sm" className="flex-1" title={next.label} loading={pending === `${order.id}:${next.to}`} onClick={() => void advance(order, next.to)}>
              {next.short}
            </Button>
          )}
          {order.status === "READY" && (
            <Button variant="info" size="sm" className="flex-1" aria-label="Assigner un livreur" onClick={onAssign}>
              🚴 Assigner
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

// ----------------------------------------------------------------- assignation

export function AssignDriverSheet({ order, onClose }: { order: OrderWithItems | null; onClose: () => void }) {
  const { drivers, orders } = useAdmin();
  const { assign, pending } = useOrderActions();
  if (!order) return null;
  const activeCount = (id: string) => orders.filter((o) => o.driver_id === id && (o.status === "ASSIGNED" || o.status === "OUT_FOR_DELIVERY")).length;
  const rank = { AVAILABLE: 0, BUSY: 1, OFFLINE: 2 } as const;
  const list = drivers.filter((d) => d.active).sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));

  return (
    <Sheet open onClose={onClose} title={`🚴 Assigner un livreur`} subtitle={`${order.order_number} · ${order.commune} · ${formatDA(order.total)}`}>
      {list.length === 0 ? (
        <p className="text-fg-muted">Aucun livreur actif. Ajoutez-en dans l'onglet « Livreurs ».</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((d) => {
            const count = activeCount(d.id);
            const current = d.id === order.driver_id;
            const disabled = d.status === "OFFLINE" || current;
            return (
              <li key={d.id}>
                <button type="button" disabled={disabled || pending !== null}
                  onClick={async () => { if (await assign(order, d)) onClose(); }}
                  className={cx("flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition",
                    disabled ? "cursor-not-allowed border-line opacity-50" : "border-line hover:border-sky-500 hover:bg-sky-500/5")}>
                  <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-lg font-extrabold">{d.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold">{d.name} {current && <span className="text-sm font-bold text-sky-600">(actuel)</span>}</span>
                    <span className="block text-sm text-fg-muted">
                      {formatPhone(d.phone)}{count > 0 && ` · ${count} livraison(s) en cours`}
                    </span>
                  </span>
                  <DriverStatusBadge status={d.status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-fg-muted">
        Le livreur reçoit la commande instantanément sur son téléphone, et le client voit « Livreur assigné ».
      </p>
    </Sheet>
  );
}

// ----------------------------------------------------------------- annulation

const QUICK_REASONS = ["Client injoignable", "Produit indisponible", "Adresse hors zone de livraison", "Demande du client", "Commande en double"];

export function CancelOrderSheet({ order, onClose }: { order: OrderWithItems | null; onClose: () => void }) {
  const { cancel, pending } = useOrderActions();
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [order?.id]);
  if (!order) return null;
  return (
    <ConfirmSheet open onClose={onClose} title={`Annuler ${order.order_number} ?`} variant="danger" confirmLabel="Annuler la commande"
      loading={pending !== null}
      onConfirm={async () => { if (await cancel(order, reason)) onClose(); }}>
      <p className="mb-3">Le client sera prévenu immédiatement. Motif (visible par le client) :</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)}
            className={cx("rounded-full px-3 py-1.5 text-sm font-bold", reason === r ? "bg-red-600 text-white" : "bg-surface-2 text-fg")}>
            {r}
          </button>
        ))}
      </div>
      <Field label="Motif">
        {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}
      </Field>
    </ConfirmSheet>
  );
}

// ----------------------------------------------------------------- ticket imprimable

function printTicket(order: OrderWithItems) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(order.order_number)}</title>
    <style>body{font:14px/1.4 monospace;margin:12px;width:72mm}h1{font-size:18px;margin:0}hr{border:0;border-top:1px dashed #000}
    .r{display:flex;justify-content:space-between;gap:8px}small{color:#333}</style></head><body>
    <h1>HOUCINE CHAPATI</h1><p>${esc(order.order_number)}<br>${esc(formatTime(order.created_at))}</p><hr>
    ${order.order_items.map((i) => `<div class="r"><span>${i.quantity}× ${esc(i.product_name)}${i.options.length ? `<br><small>${esc(i.options.map((o) => o.name).join(", "))}</small>` : ""}</span><span>${i.total}</span></div>`).join("")}
    <hr><div class="r"><span>Livraison</span><span>${order.delivery_fee}</span></div><div class="r"><b>TOTAL</b><b>${order.total} DA</b></div><hr>
    <p><b>${esc(order.customer_name)}</b><br>${esc(formatPhone(order.customer_phone))}<br>${esc(order.customer_address)}<br>${esc(order.commune)}, ${esc(order.wilaya)}</p>
    ${order.delivery_instructions ? `<p>Livreur : ${esc(order.delivery_instructions)}</p>` : ""}
    ${order.additional_info ? `<p>Note : ${esc(order.additional_info)}</p>` : ""}
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}<\/script></body></html>`);
  w.document.close();
}

// ----------------------------------------------------------------- fiche détaillée

export function OrderDrawer({
  orderId, onClose, onAssign, onCancel,
}: { orderId: string | null; onClose: () => void; onAssign: (o: OrderWithItems) => void; onCancel: (o: OrderWithItems) => void }) {
  const { orders, drivers, settings } = useAdmin();
  const { advance, pending } = useOrderActions();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  // commande du jour (temps réel) ou, depuis l'historique, la fiche chargée à la demande
  const order = orders.find((o) => o.id === orderId) ?? (detail?.id === orderId ? detail : null);

  useEffect(() => {
    if (!orderId) return;
    fetchOrderDetail(orderId).then(setDetail, () => setDetail(null));
  }, [orderId, order?.status, order?.driver_id]);

  if (!orderId || !order) return null;
  const next = ADMIN_NEXT_STEP[order.status];
  const driver = drivers.find((d) => d.id === order.driver_id);
  const customer = { lat: order.customer_latitude, lng: order.customer_longitude };
  const restaurant = settings ? toLatLng(settings.latitude, settings.longitude) : null;
  const driverPos = driver ? toLatLng(driver.current_latitude, driver.current_longitude) : null;
  const points: MapPoint[] = [
    { id: "c", position: customer, emoji: "🏠", color: "bg-brand", label: order.customer_name },
    ...(restaurant ? [{ id: "r", position: restaurant, emoji: "🍽️", color: "bg-ink-2", label: "Restaurant" }] : []),
    ...(driverPos && driver ? [{ id: "d", position: driverPos, emoji: "🛵", color: "bg-sky-600", label: driver.name, pulse: true }] : []),
  ];

  return (
    <Sheet open onClose={onClose} size="xl"
      title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{order.order_number}</span><StatusBadge status={order.status} /></span>}
      subtitle={`Reçue à ${formatTime(order.created_at)}`}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => printTicket(order)}>Ticket</Button>
          {order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
            <Button variant="outline" onClick={() => onCancel(order)}>Annuler la commande</Button>
          )}
          {order.status === "OUT_FOR_DELIVERY" && (
            <Button variant="outline" loading={pending === `${order.id}:DELIVERED`} onClick={() => void advance(order, "DELIVERED")}>
              Marquer livrée
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            {(order.status === "READY" || order.status === "ASSIGNED") && (
              <Button variant="info" onClick={() => onAssign(order)}>
                {order.status === "READY" ? "🚴 Assigner un livreur" : "Réassigner"}
              </Button>
            )}
            {next && (
              <Button loading={pending === `${order.id}:${next.to}`} onClick={() => void advance(order, next.to)}>{next.label}</Button>
            )}
          </div>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl bg-surface-2 p-4">
            <p className="text-lg font-extrabold">{order.customer_name}</p>
            <a href={telHref(order.customer_phone)} className="mt-1 inline-flex items-center gap-1.5 font-bold text-sky-700">
              <Phone className="size-4" /> {formatPhone(order.customer_phone)}
            </a>
            <p className="mt-2">{order.customer_address}</p>
            <p className="text-fg-muted">{order.commune}, {order.wilaya}</p>
            <a href={placeUrl(customer)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-fg-muted underline">
              GPS {customer.lat.toFixed(5)}, {customer.lng.toFixed(5)} <ExternalLink className="size-3" />
            </a>
            {order.delivery_instructions && (
              <p className="mt-3 flex gap-2 rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900">
                <MessageSquare className="mt-0.5 size-4 shrink-0" /> Livreur : {order.delivery_instructions}
              </p>
            )}
            {order.additional_info && (
              <p className="mt-2 rounded-xl bg-surface p-3 text-sm"><b>Remarque :</b> {order.additional_info}</p>
            )}
            {order.cancel_reason && <p className="mt-2 text-sm font-bold text-red-600">Motif d'annulation : {order.cancel_reason}</p>}
          </section>

          <section>
            <h3 className="mb-2 font-extrabold">Produits</h3>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {order.order_items.map((item) => (
                <li key={item.id} className="flex gap-3 p-3">
                  <span className="font-extrabold text-brand">{item.quantity}×</span>
                  <span className="flex-1">
                    <span className="font-semibold">{item.product_name}</span>
                    {item.options.length > 0 && <span className="block text-sm text-fg-muted">{item.options.map((o) => `${o.group} : ${o.name}`).join(" · ")}</span>}
                  </span>
                  <span className="tabular-nums">{formatDA(item.total)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 flex flex-col gap-1 text-sm">
              <div className="flex justify-between text-fg-muted"><dt>Sous-total</dt><dd>{formatDA(order.subtotal)}</dd></div>
              <div className="flex justify-between text-fg-muted"><dt>Livraison</dt><dd>{formatDA(order.delivery_fee)}</dd></div>
              <div className="flex justify-between text-lg font-extrabold"><dt>Total</dt><dd>{formatDA(order.total)}</dd></div>
            </dl>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <PointsMap points={points} className="h-72" />
          {driver && (
            <div className="flex items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3">
              <Bike className="size-5 text-sky-700" />
              <span className="flex-1 font-bold">{driver.name} · {formatPhone(driver.phone)}</span>
              <ButtonLink href={telHref(driver.phone)} variant="secondary" size="sm" icon={<Phone className="size-4" />}>Appeler</ButtonLink>
            </div>
          )}
          {detail && (
            <section>
              <h3 className="mb-2 font-extrabold">Historique</h3>
              <ol className="flex flex-col gap-1.5 text-sm">
                {detail.order_status_history.map((h) => (
                  <li key={h.id} className="flex items-center gap-2">
                    <span className="w-12 tabular-nums text-fg-muted">{formatTime(h.created_at)}</span>
                    <StatusBadge status={h.status} />
                    {h.note && <span className="text-fg-muted">{h.note}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </Sheet>
  );
}
