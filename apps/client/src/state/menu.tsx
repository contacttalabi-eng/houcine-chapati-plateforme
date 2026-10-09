import {
  errorMessage, fetchMenu, fetchSettings, indexProducts, useRealtime, useResyncOnFocus,
  type MenuCategory, type ProductIndex, type RestaurantSettings,
} from "@hc/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface MenuState {
  menu: MenuCategory[];
  products: ProductIndex;
  settings: RestaurantSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const MenuContext = createContext<MenuState | null>(null);

/**
 * Menu + réglages du restaurant, mis à jour en direct : toute modification
 * faite dans l'administration (prix, photo, disponibilité, options, ouverture)
 * apparaît chez le client sans recharger la page.
 */
export function MenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [nextMenu, nextSettings] = await Promise.all([fetchMenu(), fetchSettings()]);
      setMenu(nextMenu);
      setSettings(nextSettings);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // plusieurs changements groupés (ex. enregistrement d'options) → un seul rechargement
  const scheduleReload = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void load(), 400);
  }, [load]);

  useEffect(() => {
    void load();
    return () => window.clearTimeout(timer.current);
  }, [load]);

  useRealtime(
    "menu",
    [
      { table: "categories" }, { table: "products" }, { table: "product_option_groups" },
      { table: "product_options" }, { table: "restaurant_settings" },
    ],
    scheduleReload,
    scheduleReload,
  );
  useResyncOnFocus(scheduleReload);

  const value = useMemo<MenuState>(
    () => ({ menu, products: indexProducts(menu), settings, loading, error, reload: () => void load() }),
    [menu, settings, loading, error, load],
  );
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu(): MenuState {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu hors de MenuProvider");
  return ctx;
}
