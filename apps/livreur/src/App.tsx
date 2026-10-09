import {
  EmptyState, FullScreenLoader, Toaster, errorMessage, fetchDriverByProfile, fetchDriverOrders, matchPath,
  reportDriverLocation, signOut, useNotificationFeed, usePath, useRealtime, useResyncOnFocus, useWakeLock,
  useWatchPosition, Button, type Driver, type OrderWithItems, type Profile,
} from "@hc/shared";
import { MapsProvider } from "@hc/shared/maps";
import { LogOut, UserX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DriverGate } from "./DriverGate";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { BottomNav, TAB_PATHS } from "./components/nav";
import { AccountPage } from "./pages/AccountPage";
import { HistoryPage } from "./pages/HistoryPage";
import { OrdersPage } from "./pages/OrdersPage";
import { SearchPage } from "./pages/SearchPage";
import { ThemeProvider, useTheme } from "./state/theme";

export interface DriverContext {
  driver: Driver;
  /** Email du compte connecté (Google ou email) */
  email: string | null;
  /** Mode de connexion : "google" ou "email" */
  provider: string;
  orders: OrderWithItems[];
  live: boolean;
  reload: () => Promise<void>;
  setDriver: (d: Driver) => void;
  position: { lat: number; lng: number } | null;
  locationError: string | null;
}

const ACTIVE = new Set(["ASSIGNED", "OUT_FOR_DELIVERY"]);

function DriverApp({ profile, userId, email, provider }: { profile: Profile; userId: string; email: string | null; provider: string }) {
  const [driver, setDriver] = useState<Driver | null | undefined>(undefined);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [error, setError] = useState<string | null>(null);
  const path = usePath();

  const loadDriver = useCallback(async () => {
    try {
      setDriver(await fetchDriverByProfile(profile.id));
    } catch (e) {
      setError(errorMessage(e));
      setDriver(null);
    }
  }, [profile.id]);

  // dépend uniquement de l'identifiant : la fiche change à chaque position GPS
  const driverId = driver?.id;
  const loadOrders = useCallback(async () => {
    if (!driverId) return;
    try {
      setOrders(await fetchDriverOrders(driverId));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [driverId]);

  const reload = useCallback(async () => {
    await Promise.all([loadDriver(), loadOrders()]);
  }, [loadDriver, loadOrders]);

  useEffect(() => { void loadDriver(); }, [loadDriver]);
  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // Temps réel : commandes assignées à ce livreur + sa fiche (statut)
  const live = useRealtime(
    driver ? `driver-${driver.id}` : null,
    driver ? [{ table: "orders", filter: `driver_id=eq.${driver.id}` }, { table: "drivers", filter: `id=eq.${driver.id}` }] : [],
    (payload) => {
      if (payload.table === "drivers" && payload.eventType === "UPDATE") setDriver(payload.new as unknown as Driver);
      else void loadOrders();
    },
    () => void reload(),
  );
  // Filet de sécurité (réassignation, réseau mobile instable) : resynchronisation régulière
  useResyncOnFocus(() => void reload(), 60_000);

  // Nouvelle commande assignée : alerte sonore forte + vibration
  useNotificationFeed(userId, () => void loadOrders(), { chime: 3, vibrate: true });

  // Partage de la position pendant les livraisons
  const hasActive = orders.some((o) => ACTIVE.has(o.status));
  const enRoute = orders.some((o) => o.status === "OUT_FOR_DELIVERY");
  const lastSent = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const { fix, error: locationError } = useWatchPosition(Boolean(driver?.active) && hasActive, (p) => {
    const prev = lastSent.current;
    const moved = prev ? Math.hypot(p.lat - prev.lat, p.lng - prev.lng) * 111_000 : Infinity;
    if (prev && Date.now() - prev.at < 15_000 && moved < 40) return;
    lastSent.current = { at: Date.now(), lat: p.lat, lng: p.lng };
    reportDriverLocation(p.lat, p.lng, p.accuracy).catch(() => undefined);
  }, "le restaurant ne verra pas votre position (la navigation Google Maps fonctionne quand même)");
  useWakeLock(enRoute);

  if (driver === undefined) return <FullScreenLoader />;
  if (!driver || !driver.active) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <EmptyState icon={<UserX className="size-7" />}
          title={driver ? "Compte livreur désactivé" : "Fiche livreur introuvable"}
          action={<Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>Se déconnecter</Button>}>
          {error ?? "Contactez le restaurant pour activer votre compte."}
        </EmptyState>
      </div>
    );
  }

  const ctx: DriverContext = {
    driver, email, provider, orders, live, reload, setDriver,
    position: fix ? { lat: fix.lat, lng: fix.lng } : null,
    locationError: hasActive ? locationError : null,
  };
  const detail = matchPath("/commande/:id", path);
  if (detail) return <OrderDetailPage ctx={ctx} orderId={detail.id!} />;
  const activeCount = orders.filter((o) => ACTIVE.has(o.status)).length;
  return (
    <>
      {path === "/recherche" ? <SearchPage ctx={ctx} />
        : path === "/historique" ? <HistoryPage />
        : path === "/compte" ? <AccountPage ctx={ctx} />
        : <OrdersPage ctx={ctx} />}
      {(TAB_PATHS as readonly string[]).includes(path) && <BottomNav activeOrders={activeCount} />}
    </>
  );
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster position="top-center" theme={resolved} richColors closeButton />;
}

export function App() {
  return (
    <ThemeProvider>
      <MapsProvider>
        <DriverGate>
          {({ profile, session }) => (
            <DriverApp profile={profile} userId={session.user.id} email={session.user.email ?? null}
              provider={String((session.user.app_metadata as { provider?: string }).provider ?? "email")} />
          )}
        </DriverGate>
        <ThemedToaster />
      </MapsProvider>
    </ThemeProvider>
  );
}
