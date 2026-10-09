import {
  Card, DriverStatusBadge, Link, Spinner, Switch, cx, errorMessage, formatDA, formatTime, toast, updateSettings,
} from "@hc/shared";
import { PointsMap, toLatLng, type MapPoint } from "@hc/shared/maps";
import { ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { OrderCard } from "../components/orders";
import { PageTitle } from "../components/Shell";
import { useAdmin } from "../state/admin";
import { useOrderDialogs } from "./OrdersPage";

function Stat({ label, value, tone, hint, className }: { label: string; value: ReactNode; tone: string; hint?: string; className?: string }) {
  return (
    <Card className={cx("relative overflow-hidden p-4", className)}>
      <span className={cx("absolute inset-y-0 left-0 w-1.5", tone)} aria-hidden />
      <p className="text-xs font-extrabold uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </Card>
  );
}

function OrdersToggle() {
  const { settings, setSettings } = useAdmin();
  const [saving, setSaving] = useState(false);
  if (!settings) return null;
  return (
    <Card className="px-4 py-3">
      <Switch
        checked={settings.accepting_orders}
        disabled={saving}
        label={settings.accepting_orders ? "Commandes en ligne ouvertes" : "Commandes en ligne fermées"}
        description="Les clients voient immédiatement le changement."
        onChange={async (value) => {
          setSaving(true);
          try {
            await updateSettings({ accepting_orders: value });
            setSettings({ ...settings, accepting_orders: value });
            toast.success(value ? "Commandes ouvertes" : "Commandes fermées");
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setSaving(false);
          }
        }}
      />
    </Card>
  );
}

export function DashboardPage() {
  const { stats, orders, drivers, settings, loading, error } = useAdmin();
  const { open, assign, cancel, dialogs } = useOrderDialogs();

  if (loading) return <Spinner />;
  if (error) return <p className="text-red-600">{error}</p>;

  const toHandle = orders
    .filter((o) => o.status === "PENDING" || o.status === "READY")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const restaurant = settings ? toLatLng(settings.latitude, settings.longitude) : null;
  const inDelivery = orders.filter((o) => o.status === "ASSIGNED" || o.status === "OUT_FOR_DELIVERY");
  const points: MapPoint[] = [
    ...(restaurant ? [{ id: "restaurant", position: restaurant, emoji: "🍽️", color: "bg-ink-2", label: "Restaurant" }] : []),
    ...inDelivery.map((o) => ({
      id: `o-${o.id}`, position: { lat: o.customer_latitude, lng: o.customer_longitude },
      emoji: "🏠", color: "bg-brand", label: o.order_number, onClick: () => open(o.id),
    })),
    ...drivers.flatMap((d) => {
      const p = toLatLng(d.current_latitude, d.current_longitude);
      return p && d.active && d.status !== "OFFLINE"
        ? [{ id: `d-${d.id}`, position: p, emoji: "🛵", color: d.status === "BUSY" ? "bg-orange-500" : "bg-emerald-600", label: d.name }]
        : [];
    }),
  ];

  return (
    <>
      <PageTitle title="Tableau de bord" subtitle="Activité du jour, en temps réel." actions={<OrdersToggle />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Commandes du jour" value={stats?.orders_today ?? "–"} tone="bg-fg" />
        <Stat label="En attente" value={stats?.pending ?? "–"} tone="bg-yellow-400" />
        <Stat label="En préparation" value={stats ? stats.confirmed + stats.preparing : "–"} tone="bg-orange-500" hint="confirmées + en cuisine" />
        <Stat label="Prêtes" value={stats?.ready ?? "–"} tone="bg-green-500" />
        <Stat label="En livraison" value={stats?.in_delivery ?? "–"} tone="bg-sky-500" />
        <Stat label="Livrées" value={stats?.delivered_today ?? "–"} tone="bg-emerald-600"
          hint={stats?.cancelled_today ? `${stats.cancelled_today} annulée(s)` : undefined} />
        <Stat label="Chiffre d'affaires du jour (livré)" className="col-span-2" value={stats ? formatDA(stats.revenue_today) : "–"} tone="bg-brand"
          hint={stats ? `${formatDA(stats.revenue_expected)} commandés` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-extrabold">Livraisons en cours</h2>
            <span className="text-sm text-fg-muted">{inDelivery.length} commande(s) · {drivers.filter((d) => d.status !== "OFFLINE" && d.active).length} livreur(s) actif(s)</span>
          </div>
          <PointsMap points={points} className="h-[420px] rounded-none" fallbackCenter={restaurant ?? undefined} />
          <ul className="flex flex-wrap gap-2 p-4">
            {drivers.filter((d) => d.active).map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm font-bold">
                {d.name} <DriverStatusBadge status={d.status} />
                {d.last_location_update && <span className="pr-2 text-xs font-normal text-fg-muted">📍 {formatTime(d.last_location_update)}</span>}
              </li>
            ))}
          </ul>
        </Card>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold">À traiter maintenant</h2>
            <Link to="/commandes" className="flex items-center gap-1 text-sm font-bold text-brand">Toutes les commandes <ArrowRight className="size-4" /></Link>
          </div>
          <div className="flex flex-col gap-3">
            {toHandle.length === 0 ? (
              <Card className="p-8 text-center text-fg-muted">Rien en attente. Les nouvelles commandes s'afficheront ici avec un son.</Card>
            ) : (
              toHandle.map((o) => (
                <OrderCard key={o.id} order={o} onOpen={() => open(o.id)} onAssign={() => assign(o)} onCancel={() => cancel(o)} />
              ))
            )}
          </div>
        </section>
      </div>
      {dialogs}
    </>
  );
}
