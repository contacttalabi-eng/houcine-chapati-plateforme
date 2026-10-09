import {
  Button, CUSTOMER_STEPS, EmptyState, ErrorState, Link, StatusBadge, cx, errorMessage, fetchCustomerOrders, formatDA,
  formatDateTime, isFinal, stepIndex, useRealtime, useResyncOnFocus, useSession, type OrderWithItems,
} from "@hc/shared";
import { ChevronRight, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/ui";

function OrderCard({ order }: { order: OrderWithItems }) {
  const active = !isFinal(order.status);
  const step = stepIndex(order.status);
  const items = order.order_items.reduce((n, i) => n + i.quantity, 0);
  return (
    <Link to={`/suivi/${order.id}`}
      className="block rounded-2xl border border-line bg-surface p-4 card-shadow transition hover:border-accent/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-extrabold">{order.order_number}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{formatDateTime(order.created_at)} · {items} article{items > 1 ? "s" : ""}</p>
        </div>
        <StatusBadge status={order.status} audience="customer" />
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-fg-muted">
        {order.order_items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
      </p>
      {active && step >= 0 && (
        <div className="mt-3 flex gap-1" aria-hidden>
          {CUSTOMER_STEPS.map((s, i) => (
            <span key={s} className={cx("h-1.5 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-surface-3")} />
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-lg font-extrabold text-price">{formatDA(order.total)}</span>
        <span className="flex items-center gap-1 text-sm font-bold text-accent">
          {active ? "Suivre" : "Détails"} <ChevronRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

/** Onglet Mes commandes : commandes passées depuis ce téléphone, statut en direct. */
export function MyOrdersPage() {
  const session = useSession();
  const [orders, setOrders] = useState<OrderWithItems[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "past">("active");

  const userId = session?.user.id;
  const load = useCallback(() => {
    if (!userId) return;
    fetchCustomerOrders(userId).then((o) => { setOrders(o); setError(null); }, (e: unknown) => setError(errorMessage(e)));
  }, [userId]);

  useEffect(load, [load]);
  // Aucune commande encore passée depuis ce téléphone : pas de session invité, liste vide.
  useEffect(() => { if (session === null) setOrders([]); }, [session]);
  useRealtime(userId ? `my-orders-${userId}` : null, [{ table: "orders", filter: `customer_user_id=eq.${userId}` }], load, load);
  useResyncOnFocus(load);

  const active = orders?.filter((o) => !isFinal(o.status)) ?? [];
  const past = orders?.filter((o) => isFinal(o.status)) ?? [];
  // Sans commande en cours, on affiche directement l'historique
  const shown = tab === "active" && active.length === 0 && past.length > 0 && orders !== null ? "past" : tab;
  const list = shown === "active" ? active : past;

  return (
    <div className="min-h-dvh pb-nav">
      <PageHeader title="Mes commandes" subtitle="Suivi en direct de vos commandes" />
      <main className="mx-auto max-w-2xl px-4 pt-4">
        <div className="mb-4 grid grid-cols-2 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Commandes">
          {([["active", `En cours (${active.length})`], ["past", `Historique (${past.length})`]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={shown === key} onClick={() => setTab(key)}
              className={cx("h-10 rounded-xl text-sm font-extrabold transition",
                shown === key ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
              {label}
            </button>
          ))}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : orders === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface-2" />)}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={<ReceiptText className="size-7" />}
            title={shown === "active" ? "Aucune commande en cours" : "Aucune commande passée"}
            action={<Link to="/"><Button size="lg">Voir le menu</Button></Link>}>
            Les commandes passées depuis ce téléphone apparaîtront ici, avec leur suivi en direct.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((o) => <li key={o.id}><OrderCard order={o} /></li>)}
          </ul>
        )}
      </main>
    </div>
  );
}
