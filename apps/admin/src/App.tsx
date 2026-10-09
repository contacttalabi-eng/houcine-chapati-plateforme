import { StaffGate, Toaster, usePath } from "@hc/shared";
import { MapsProvider } from "@hc/shared/maps";
import { Shell } from "./components/Shell";
import { DashboardPage } from "./pages/DashboardPage";
import { DriversPage } from "./pages/DriversPage";
import { MenuPage } from "./pages/menu/MenuPage";
import { OrdersPage } from "./pages/OrdersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminDataProvider } from "./state/admin";

function Routes() {
  const path = usePath();
  if (path.startsWith("/commandes")) return <OrdersPage />;
  if (path.startsWith("/livreurs")) return <DriversPage />;
  if (path.startsWith("/menu")) return <MenuPage />;
  if (path.startsWith("/reglages")) return <SettingsPage />;
  return <DashboardPage />;
}

export function App() {
  return (
    <MapsProvider>
      <StaffGate role="ADMIN" title="Administration" subtitle="Houcine Chapati — espace restaurant">
        {({ session }) => (
          <AdminDataProvider userId={session.user.id}>
            <Shell email={session.user.email ?? ""}>
              <Routes />
            </Shell>
          </AdminDataProvider>
        )}
      </StaffGate>
      <Toaster position="top-right" richColors closeButton mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }} />
    </MapsProvider>
  );
}
