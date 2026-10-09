import type { MenuCategory, Product, ProductOption, RestaurantSettings } from "../types";

/**
 * Panier côté client. Seuls les identifiants et quantités sont stockés ; les
 * prix sont toujours recalculés depuis le menu en direct (et à nouveau par
 * le serveur au moment de la commande).
 */
export interface CartLine {
  key: string;
  productId: string;
  optionIds: string[];
  quantity: number;
}

export const MAX_QUANTITY = 50;

export const lineKey = (productId: string, optionIds: string[]) =>
  `${productId}|${[...optionIds].sort().join(",")}`;

export type ProductIndex = Map<string, Product>;

export function indexProducts(menu: MenuCategory[]): ProductIndex {
  const index: ProductIndex = new Map();
  for (const category of menu) for (const product of category.products) index.set(product.id, product);
  return index;
}

/** Retourne le nom du premier groupe dont la règle n'est pas respectée, sinon null. */
export function selectionProblem(product: Product, optionIds: string[]): string | null {
  const chosen = new Set(optionIds);
  for (const group of product.groups) {
    const count = group.options.filter((o) => chosen.has(o.id)).length;
    if (group.required && count === 0) return group.name;
    if (group.selection === "SINGLE" && count > 1) return group.name;
    if (group.max_select != null && count > group.max_select) return group.name;
  }
  return null;
}

/** Options choisies d'un produit (null si une option n'existe plus ou est indisponible). */
export function resolveOptions(product: Product, optionIds: string[]): ProductOption[] | null {
  const all = new Map(product.groups.flatMap((g) => g.options.map((o) => [o.id, o] as const)));
  const resolved: ProductOption[] = [];
  for (const id of optionIds) {
    const option = all.get(id);
    if (!option || !option.available) return null;
    resolved.push(option);
  }
  return resolved;
}

export function unitPrice(product: Product, options: ProductOption[]): number {
  return product.price + options.reduce((sum, o) => sum + o.price_delta, 0);
}

/** Prix "à partir de" : base + options obligatoires les moins chères. */
export function fromPrice(product: Product): number {
  return product.groups
    .filter((g) => g.required)
    .reduce((sum, g) => {
      const prices = g.options.filter((o) => o.available).map((o) => o.price_delta);
      return sum + (prices.length ? Math.min(...prices) : 0);
    }, product.price);
}

export const hasChoices = (product: Product) => product.groups.some((g) => g.options.length > 0);

export interface PricedLine extends CartLine {
  product: Product | null;
  options: ProductOption[];
  unit: number;
  total: number;
  /** Raison pour laquelle la ligne ne peut pas être commandée */
  problem: string | null;
}

export interface CartSummary {
  lines: PricedLine[];
  count: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** true si au moins une ligne bloque la commande */
  blocked: boolean;
  /** Montant manquant pour atteindre le minimum de commande */
  missingForMinimum: number;
}

export function summarizeCart(
  lines: CartLine[],
  products: ProductIndex,
  settings: Pick<RestaurantSettings, "delivery_fee" | "free_delivery_threshold" | "min_order_amount"> | null,
  categoryActive: (categoryId: string) => boolean = () => true,
): CartSummary {
  const priced: PricedLine[] = lines.map((line) => {
    const product = products.get(line.productId) ?? null;
    if (!product || !categoryActive(product.category_id)) {
      return { ...line, product, options: [], unit: 0, total: 0, problem: "Ce produit n'est plus proposé." };
    }
    if (!product.available) {
      return { ...line, product, options: [], unit: product.price, total: 0, problem: "Indisponible pour le moment." };
    }
    const options = resolveOptions(product, line.optionIds);
    if (!options) {
      return { ...line, product, options: [], unit: product.price, total: 0, problem: "Une option n'est plus disponible." };
    }
    const group = selectionProblem(product, line.optionIds);
    const unit = unitPrice(product, options);
    return {
      ...line, product, options, unit,
      total: group ? 0 : unit * line.quantity,
      problem: group ? `Choix à compléter : ${group}.` : null,
    };
  });

  const subtotal = priced.reduce((sum, l) => sum + l.total, 0);
  const count = priced.reduce((sum, l) => sum + (l.problem ? 0 : l.quantity), 0);
  const free = settings?.free_delivery_threshold != null && subtotal >= settings.free_delivery_threshold;
  const deliveryFee = subtotal === 0 || !settings || free ? 0 : settings.delivery_fee;
  const minimum = settings?.min_order_amount ?? 0;

  return {
    lines: priced,
    count,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    blocked: priced.some((l) => l.problem !== null),
    missingForMinimum: Math.max(0, minimum - subtotal),
  };
}

/** Ajoute (ou cumule) une ligne au panier. */
export function addLine(lines: CartLine[], productId: string, optionIds: string[], quantity = 1): CartLine[] {
  const key = lineKey(productId, optionIds);
  const existing = lines.find((l) => l.key === key);
  if (existing) {
    return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l));
  }
  return [...lines, { key, productId, optionIds: [...optionIds].sort(), quantity: Math.min(MAX_QUANTITY, quantity) }];
}

export function setLineQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.key !== key);
  return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QUANTITY, quantity) } : l));
}
