import { addLine, setLineQuantity, summarizeCart, toast, type CartLine, type CartSummary } from "@hc/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMenu } from "./menu";

const STORAGE_KEY = "hc-panier-v2";

interface CartState {
  lines: CartLine[];
  summary: CartSummary;
  add: (productId: string, optionIds: string[], quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartState | null>(null);

function readStoredCart(): CartLine[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (l): l is CartLine =>
        typeof l?.key === "string" && typeof l?.productId === "string" &&
        Array.isArray(l?.optionIds) && Number.isInteger(l?.quantity) && l.quantity > 0,
    );
  } catch {
    return [];
  }
}

/** Panier gardé dans ce navigateur ; les prix viennent toujours du menu en direct. */
export function CartProvider({ children }: { children: ReactNode }) {
  const { products, settings, loading, error } = useMenu();
  const [lines, setLines] = useState<CartLine[]>(readStoredCart);

  // Plats qui n'existent plus dans le menu (supprimés par le restaurant depuis
  // l'ajout au panier) : retirés automatiquement, avec un message, au lieu de
  // bloquer la commande. Seulement une fois le menu bien chargé.
  useEffect(() => {
    if (loading || error || products.size === 0) return;
    const gone = lines.filter((l) => !products.has(l.productId)).length;
    if (gone === 0) return;
    setLines((current) => current.filter((l) => products.has(l.productId)));
    toast.info(gone > 1
      ? `${gone} produits ne sont plus proposés : ils ont été retirés de votre panier.`
      : "Un produit n'est plus proposé : il a été retiré de votre panier.");
  }, [lines, products, loading, error]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // stockage indisponible (navigation privée) : le panier reste en mémoire
    }
  }, [lines]);

  const add = useCallback((productId: string, optionIds: string[], quantity = 1) =>
    setLines((current) => addLine(current, productId, optionIds, quantity)), []);
  const setQuantity = useCallback((key: string, quantity: number) =>
    setLines((current) => setLineQuantity(current, key, quantity)), []);
  const remove = useCallback((key: string) => setLines((current) => current.filter((l) => l.key !== key)), []);
  const clear = useCallback(() => setLines([]), []);

  const summary = useMemo(() => summarizeCart(lines, products, settings), [lines, products, settings]);

  const value = useMemo(() => ({ lines, summary, add, setQuantity, remove, clear }), [lines, summary, add, setQuantity, remove, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart hors de CartProvider");
  return ctx;
}

// ---------------------------------------------------------------- commandes de ce navigateur

const ORDERS_KEY = "hc-mes-commandes";

/** Mémorise les commandes passées ici (raccourci « suivre ma commande »). */
export function rememberOrder(id: string) {
  try {
    const ids = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]") as string[];
    localStorage.setItem(ORDERS_KEY, JSON.stringify([id, ...ids.filter((x) => x !== id)].slice(0, 20)));
  } catch {
    // ignoré
  }
}

export function lastOrderId(): string | null {
  try {
    return (JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]") as string[])[0] ?? null;
  } catch {
    return null;
  }
}

/** Oublie les commandes mémorisées sur ce téléphone. */
export function forgetOrders() {
  try {
    localStorage.removeItem(ORDERS_KEY);
  } catch {
    // ignoré
  }
}
