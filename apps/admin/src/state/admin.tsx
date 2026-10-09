import {
  algiersDayStart, errorMessage, fetchBoardOrders, fetchDashboardStats, fetchDrivers, fetchOrderWithItems,
  fetchSettings, useNotificationFeed, useRealtime, useResyncOnFocus,
  type DashboardStats, type Driver, type OrderWithItems, type RestaurantSettings,
} from "@hc/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface AdminData {
  orders: OrderWithItems[];
  drivers: Driver[];
  settings: RestaurantSettings | null;
  stats: DashboardStats | null;
  live: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshDrivers: () => Promise<void>;
  setSettings: (s: RestaurantSettings) => void;
  /** id de la dernière commande arrivée (mise en évidence) */
  freshOrderId: string | null;
}

const AdminContext = createContext<AdminData | null>(null);

const byCreatedDesc = (a: OrderWithItems, b: OrderWithItems) => b.created_at.localeCompare(a.created_at);

/**
 * Données de l'administration, synchronisées par Supabase Realtime :
 *  - nouvelle commande → apparaît immédiatement (+ son, notification)
 *  - changement de statut (restaurant, livreur, client) → mis à jour partout
 *  - statut et position des livreurs → en direct
 */
export function AdminDataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [freshOrderId, setFreshOrderId] = useState<string | null>(null);
  const statsTimer = useRef<number | undefined>(undefined);

  const loadStats = useCallback(() => {
    window.clearTimeout(statsTimer.current);
    statsTimer.current = window.setTimeout(() => {
      fetchDashboardStats().then(setStats, () => undefined);
    }, 500);
  }, []);

  const refreshDrivers = useCallback(async () => {
    setDrivers(await fetchDrivers());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [o, d, s] = await Promise.all([fetchBoardOrders(algiersDayStart()), fetchDrivers(), fetchSettings()]);
      setOrders(o);
      setDrivers(d);
      setSettings(s);
      setError(null);
      loadStats();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [loadStats]);

  useEffect(() => {
    void refresh();
    return () => window.clearTimeout(statsTimer.current);
  }, [refresh]);

  const upsertOrder = useCallback(async (id: string) => {
    const order = await fetchOrderWithItems(id).catch(() => null);
    setOrders((current) => {
      const rest = current.filter((o) => o.id !== id);
      return order ? [order, ...rest].sort(byCreatedDesc) : rest;
    });
  }, []);

  const live = useRealtime(
    "admin",
    [{ table: "orders" }, { table: "drivers" }, { table: "restaurant_settings" }],
    (payload) => {
      if (payload.table === "orders") {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: string };
        if (!row.id) return;
        if (payload.eventType === "INSERT") {
          setFreshOrderId(row.id);
          window.setTimeout(() => setFreshOrderId((v) => (v === row.id ? null : v)), 15_000);
        }
        void upsertOrder(row.id);
        loadStats();
      } else if (payload.table === "drivers") {
        if (payload.eventType === "UPDATE") {
          const next = payload.new as unknown as Driver;
          setDrivers((list) => list.map((d) => (d.id === next.id ? next : d)));
        } else {
          void refreshDrivers();
        }
      } else if (payload.table === "restaurant_settings" && payload.eventType === "UPDATE") {
        setSettings(payload.new as unknown as RestaurantSettings);
      }
    },
    () => void refresh(),
  );
  useResyncOnFocus(() => void refresh(), 120_000);

  // Notifications du restaurant (nouvelle commande, annulation client) : toast + son
  useNotificationFeed(userId, undefined, { chime: 2 });

  const value = useMemo<AdminData>(() => ({
    orders, drivers, settings, stats, live, loading, error, refresh, refreshDrivers, setSettings, freshOrderId,
  }), [orders, drivers, settings, stats, live, loading, error, refresh, refreshDrivers, freshOrderId]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminData {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin hors de AdminDataProvider");
  return ctx;
}
