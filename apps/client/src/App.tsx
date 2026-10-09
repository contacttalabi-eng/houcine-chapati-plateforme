import { Toaster, matchPath, unlockAudio, useNotificationFeed, usePath, useSession } from "@hc/shared";
import { MapsProvider } from "@hc/shared/maps";
import { useEffect, useState, type ReactNode } from "react";
import { CartPage } from "./pages/CartPage";
import { CategoryPage } from "./pages/CategoryPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { MenuPage } from "./pages/MenuPage";
import { BottomNav, TAB_PATHS } from "./components/ui";
import { MyOrdersPage } from "./pages/MyOrdersPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrackingPage } from "./pages/TrackingPage";
import { WelcomePage } from "./pages/WelcomePage";
import { CartProvider } from "./state/cart";
import { MenuProvider } from "./state/menu";
import { ThemeProvider, useTheme } from "./state/theme";

function Routes() {
  const path = usePath();
  const tracking = matchPath("/suivi/:id", path);
  if (tracking) return <TrackingPage key={tracking.id} id={tracking.id!} />;
  const category = matchPath("/categorie/:id", path);
  if (category) return <CategoryPage key={category.id} id={category.id!} />;
  if (path === "/panier") return <CartPage />;
  if (path === "/commander") return <CheckoutPage />;
  if (path === "/mes-commandes") return <MyOrdersPage />;
  if (path === "/recherche") return <SearchPage />;
  if (path === "/reglages" || path === "/profil") return <SettingsPage />;
  return <MenuPage />;
}

/** Navigation du bas : sur les 4 onglets et les menus des catégories (pas sur panier, commande, suivi). */
function MainNav() {
  const path = usePath();
  return (TAB_PATHS as readonly string[]).includes(path) || path.startsWith("/categorie/") ? <BottomNav /> : null;
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster position="top-center" theme={resolved} richColors closeButton mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }} />;
}

/** Notifications du client (statut de ses commandes) en temps réel : toast + son + vibration. */
function CustomerAlerts() {
  const session = useSession();
  useNotificationFeed(session?.user.id, undefined, { chime: 1, vibrate: true });
  useEffect(() => {
    // le son n'est autorisé par le navigateur qu'après une interaction
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);
  return null;
}

const STARTED_KEY = "hc-demarre";

function alreadyStarted(): boolean {
  try {
    return sessionStorage.getItem(STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Écran d'ouverture : affiché à chaque lancement de l'application (pas à
 * chaque rechargement de page), sauf si l'on arrive directement sur une autre
 * page (ex. un lien de suivi de commande). Aucun compte n'est demandé.
 */
function Opening({ children }: { children: ReactNode }) {
  const [started, setStarted] = useState(() => alreadyStarted() || window.location.hash.replace(/^#/, "").length > 1);
  if (!started) {
    return (
      <WelcomePage onStart={() => {
        try {
          sessionStorage.setItem(STARTED_KEY, "1");
        } catch {
          // stockage indisponible : l'écran d'ouverture reviendra au prochain chargement
        }
        setStarted(true);
        window.scrollTo(0, 0);
      }} />
    );
  }
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider>
      <MapsProvider>
        <MenuProvider>
          <CartProvider>
            <Opening>
              <Routes />
              <MainNav />
            </Opening>
            <CustomerAlerts />
            <ThemedToaster />
          </CartProvider>
        </MenuProvider>
      </MapsProvider>
    </ThemeProvider>
  );
}
