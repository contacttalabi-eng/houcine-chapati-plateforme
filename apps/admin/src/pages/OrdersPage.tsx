import {
  EmptyState, Input, Spinner, StatusBadge, algiersDateInput, algiersDayStart, cx, errorMessage, fetchOrdersBetween,
  formatDA, formatTime, isFinal, type OrderStatus, type OrderWithItems,
} from "@hc/shared";
import { ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { AssignDriverSheet, CancelOrderSheet, OrderCard, OrderDrawer } from "../components/orders";
import { PageTitle } from "../components/Shell";
import { useAdmin } from "../state/admin";

const COLUMNS: { key: string; title: string; statuses: OrderStatus[]; accent: string }[] = [
  { key: "new", title: "🟡 Nouvelles", statuses: ["PENDING"], accent: "bg-yellow-400" },
  { key: "kitchen", title: "🟠 En cuisine", statuses: ["CONFIRMED", "PREPARING"], accent: "bg-orange-500" },
  { key: "ready", title: "🟢 Prêtes", statuses: ["READY"], accent: "bg-green-500" },
  { key: "delivery", title: "🔵 En livraison", statuses: ["ASSIGNED", "OUT_FOR_DELIVERY"], accent: "bg-sky-500" },
  { key: "done", title: "✅ Terminées (aujourd'hui)", statuses: ["DELIVERED", "CANCELLED"], accent: "bg-emerald-500" },
];

/** Modales partagées entre le tableau de bord et la page Commandes. */
export function useOrderDialogs() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<OrderWithItems | null>(null);
  const [cancelFor, setCancelFor] = useState<OrderWithItems | null>(null);
  const dialogs = (
    <>
      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} onAssign={setAssignFor} onCancel={setCancelFor} />
      <AssignDriverSheet order={assignFor} onClose={() => setAssignFor(null)} />
      <CancelOrderSheet order={cancelFor} onClose={() => setCancelFor(null)} />
    </>
  );
  return { open: setOpenId, assign: setAssignFor, cancel: setCancelFor, dialogs };
}

function Board() {
  const { orders } = useAdmin();
  const { open, assign, cancel, dialogs } = useOrderDialogs();
  const [tab, setTab] = useState("new");
  const dayStart = algiersDayStart();
  const visible = orders.filter((o) => !isFinal(o.status) || o.created_at >= dayStart || (o.delivered_at ?? "") >= dayStart);
  const columnOrders = (statuses: OrderStatus[]) =>
    visible
      .filter((o) => statuses.includes(o.status))
      // en cours : la plus ancienne d'abord (priorité) ; terminées : la plus récente d'abord
      .sort((a, b) => (isFinal(a.status) ? b.updated_at.localeCompare(a.updated_at) : a.created_at.localeCompare(b.created_at)));

  return (
    <>
      {/* Onglets (téléphone / tablette) */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 xl:hidden">
        {COLUMNS.map((c) => {
          const n = columnOrders(c.statuses).length;
          return (
            <button key={c.key} type="button" onClick={() => setTab(c.key)}
              className={cx("shrink-0 rounded-full px-4 py-2 text-sm font-extrabold", tab === c.key ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted")}>
              {c.title.split(" (")[0]} <span className="ml-1 opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        {COLUMNS.map((c) => {
          const list = columnOrders(c.statuses);
          return (
            <section key={c.key} className={cx("min-w-0 xl:block", tab === c.key ? "block" : "hidden")}>
              <header className="mb-3 flex items-center gap-2">
                <span className={cx("h-5 w-1.5 rounded-full", c.accent)} />
                <h2 className="flex-1 text-sm font-extrabold uppercase tracking-wide">{c.title}</h2>
                <span className="rounded-full bg-surface-2 px-2 text-sm font-extrabold">{list.length}</span>
              </header>
              <div className="flex flex-col gap-3">
                {list.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-fg-muted">Aucune</p>
                ) : (
                  list.map((o) => (
                    <OrderCard key={o.id} order={o} compact={c.key === "done"}
                      onOpen={() => open(o.id)} onAssign={() => assign(o)} onCancel={() => cancel(o)} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      {dialogs}
    </>
  );
}

function History() {
  const [day, setDay] = useState(algiersDateInput());
  const [orders, setOrders] = useState<OrderWithItems[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { open, dialogs } = useOrderDialogs();

  useEffect(() => {
    setOrders(null);
    const from = algiersDayStart(new Date(`${day}T12:00:00Z`));
    const to = algiersDayStart(new Date(`${day}T12:00:00Z`), 1);
    fetchOrdersBetween(from, to).then(setOrders, (e: unknown) => setError(errorMessage(e)));
  }, [day]);

  const delivered = orders?.filter((o) => o.status === "DELIVERED") ?? [];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input type="date" value={day} max={algiersDateInput()} onChange={(e) => setDay(e.target.value)} className="w-auto" />
        {orders && (
          <p className="text-sm text-fg-muted">
            {orders.length} commande(s) · {delivered.length} livrée(s) ·{" "}
            <b className="text-fg">{formatDA(delivered.reduce((s, o) => s + o.total, 0))}</b> encaissés
          </p>
        )}
      </div>
      {error ? <p className="text-red-600">{error}</p> : !orders ? <Spinner /> : orders.length === 0 ? (
        <EmptyState icon={<ClipboardList className="size-7" />} title="Aucune commande ce jour-là" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-fg-muted">
              <tr><th className="p-3">N°</th><th className="p-3">Heure</th><th className="p-3">Client</th><th className="p-3">Commune</th><th className="p-3">Statut</th><th className="p-3 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-surface-2" onClick={() => open(o.id)}>
                  <td className="p-3 font-mono font-bold">{o.order_number}</td>
                  <td className="p-3">{formatTime(o.created_at)}</td>
                  <td className="p-3">{o.customer_name}</td>
                  <td className="p-3">{o.commune}</td>
                  <td className="p-3"><StatusBadge status={o.status} /></td>
                  <td className="p-3 text-right font-bold">{formatDA(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialogs}
    </div>
  );
}

export function OrdersPage() {
  const { loading } = useAdmin();
  const [view, setView] = useState<"board" | "history">("board");
  return (
    <>
      <PageTitle title="Commandes" subtitle="Les nouvelles commandes apparaissent ici instantanément."
        actions={
          <div className="flex rounded-xl bg-surface-2 p-1">
            {(["board", "history"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={cx("rounded-lg px-4 py-2 text-sm font-extrabold", view === v ? "bg-surface shadow" : "text-fg-muted")}>
                {v === "board" ? "En cours" : "Historique"}
              </button>
            ))}
          </div>
        } />
      {loading ? <Spinner /> : view === "board" ? <Board /> : <History />}
    </>
  );
}
