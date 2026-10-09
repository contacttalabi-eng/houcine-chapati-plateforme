import type { AppRole, DriverStatus, OrderStatus } from "../types";

export type Tone = "yellow" | "amber" | "orange" | "green" | "blue" | "indigo" | "emerald" | "red" | "gray";

interface StatusMeta {
  /** Libellé court (administration, livreur) */
  label: string;
  /** Libellé affiché au client */
  customerLabel: string;
  emoji: string;
  tone: Tone;
  /** Phrase d'explication pour le client */
  customerHint: string;
}

export const STATUS_META: Record<OrderStatus, StatusMeta> = {
  PENDING: {
    label: "Nouvelle", customerLabel: "Commande reçue", emoji: "🟡", tone: "yellow",
    customerHint: "Le restaurant a reçu votre commande et va la confirmer.",
  },
  CONFIRMED: {
    label: "Confirmée", customerLabel: "Commande confirmée", emoji: "👍", tone: "amber",
    customerHint: "Le restaurant a accepté votre commande.",
  },
  PREPARING: {
    label: "En préparation", customerLabel: "Préparation", emoji: "🟠", tone: "orange",
    customerHint: "Votre commande est en cuisine.",
  },
  READY: {
    label: "Prête", customerLabel: "Commande prête", emoji: "🟢", tone: "green",
    customerHint: "Votre commande est prête, un livreur va la prendre en charge.",
  },
  ASSIGNED: {
    label: "Livreur assigné", customerLabel: "Livreur assigné", emoji: "🛵", tone: "indigo",
    customerHint: "Un livreur a été désigné pour votre commande.",
  },
  OUT_FOR_DELIVERY: {
    label: "En livraison", customerLabel: "Livreur en route", emoji: "🔵", tone: "blue",
    customerHint: "Votre commande est en chemin.",
  },
  DELIVERED: {
    label: "Livrée", customerLabel: "Commande livrée", emoji: "✅", tone: "emerald",
    customerHint: "Votre commande a été livrée. Bon appétit !",
  },
  CANCELLED: {
    label: "Annulée", customerLabel: "Commande annulée", emoji: "❌", tone: "red",
    customerHint: "Cette commande a été annulée.",
  },
};

/** Étapes affichées au client, dans l'ordre (CANCELLED est traité à part). */
export const CUSTOMER_STEPS: OrderStatus[] = [
  "PENDING", "CONFIRMED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED",
];

export const ACTIVE_STATUSES: OrderStatus[] = [
  "PENDING", "CONFIRMED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY",
];

export const isFinal = (status: OrderStatus) => status === "DELIVERED" || status === "CANCELLED";

export function stepIndex(status: OrderStatus): number {
  return CUSTOMER_STEPS.indexOf(status);
}

/** Action principale du restaurant pour faire avancer une commande. */
export const ADMIN_NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string; short: string }>> = {
  PENDING: { to: "CONFIRMED", label: "Confirmer la commande", short: "Confirmer" },
  CONFIRMED: { to: "PREPARING", label: "Lancer la préparation", short: "Préparer" },
  PREPARING: { to: "READY", label: "Commande prête", short: "Prête ✓" },
};

/**
 * Miroir de private.is_valid_transition (SQL) pour l'interface.
 * Le serveur reste l'unique autorité : ceci sert seulement à afficher les bons boutons.
 */
export function canTransition(from: OrderStatus, to: OrderStatus, actor: AppRole): boolean {
  const key = `${from}>${to}`;
  switch (actor) {
    case "ADMIN":
      return (
        ["PENDING>CONFIRMED", "CONFIRMED>PREPARING", "PREPARING>READY",
          "ASSIGNED>OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY>DELIVERED"].includes(key) ||
        (to === "CANCELLED" && !isFinal(from))
      );
    case "DRIVER":
      return ["ASSIGNED>OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY>DELIVERED"].includes(key);
    case "CUSTOMER":
      return from === "PENDING" && to === "CANCELLED";
  }
}

export const DRIVER_STATUS_META: Record<DriverStatus, { label: string; tone: Tone; dot: string }> = {
  AVAILABLE: { label: "Disponible", tone: "emerald", dot: "bg-emerald-500" },
  BUSY: { label: "Occupé", tone: "orange", dot: "bg-orange-500" },
  OFFLINE: { label: "Hors ligne", tone: "gray", dot: "bg-stone-400" },
};

/** Classes Tailwind par tonalité (fond léger + texte), lisibles en clair et en sombre. */
export const TONE_CLASSES: Record<Tone, string> = {
  yellow: "bg-yellow-400/15 text-yellow-700 ring-yellow-500/30 dark:text-yellow-300",
  amber: "bg-amber-400/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  orange: "bg-orange-500/15 text-orange-700 ring-orange-500/30 dark:text-orange-300",
  green: "bg-green-500/15 text-green-700 ring-green-500/30 dark:text-green-300",
  blue: "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  indigo: "bg-indigo-500/15 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300",
  emerald: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  red: "bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-300",
  gray: "bg-stone-500/15 text-stone-600 ring-stone-500/30 dark:text-stone-300",
};
