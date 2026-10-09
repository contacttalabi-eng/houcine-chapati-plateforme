import { describe, expect, it } from "vitest";
import type { Product } from "../types";
import { addLine, fromPrice, lineKey, selectionProblem, setLineQuantity, summarizeCart } from "./cart";
import { formatDA } from "./format";
import { formatPhone, normalizeDzPhone, telHref } from "./phone";
import { canTransition } from "./status";

const pizza: Product = {
  id: "pizza", category_id: "c1", name: "Pizza Margherita", description: null, price: 300,
  image_url: null, available: true, sort_order: 1,
  groups: [
    {
      id: "size", product_id: "pizza", name: "Taille", selection: "SINGLE", required: true, max_select: null, sort_order: 0,
      options: [
        { id: "mini", group_id: "size", name: "Mini", price_delta: 0, available: true, sort_order: 0 },
        { id: "normal", group_id: "size", name: "Normal", price_delta: 100, available: true, sort_order: 1 },
      ],
    },
    {
      id: "supp", product_id: "pizza", name: "Suppléments", selection: "MULTIPLE", required: false, max_select: 2, sort_order: 1,
      options: [
        { id: "cheddar", group_id: "supp", name: "Cheddar", price_delta: 180, available: true, sort_order: 0 },
        { id: "mozza", group_id: "supp", name: "Mozzarella", price_delta: 150, available: true, sort_order: 1 },
        { id: "camembert", group_id: "supp", name: "Camembert", price_delta: 100, available: false, sort_order: 2 },
      ],
    },
  ],
};
const chapati: Product = { ...pizza, id: "chapati", name: "Chapati", price: 200, groups: [] };
const products = new Map([[pizza.id, pizza], [chapati.id, chapati]]);
const settings = { delivery_fee: 150, free_delivery_threshold: 3000, min_order_amount: 500 };

describe("panier", () => {
  it("cumule les lignes identiques quel que soit l'ordre des options", () => {
    let lines = addLine([], "pizza", ["normal", "cheddar"]);
    lines = addLine(lines, "pizza", ["cheddar", "normal"], 2);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(3);
    expect(lines[0]!.key).toBe(lineKey("pizza", ["normal", "cheddar"]));
  });

  it("calcule sous-total, livraison et total", () => {
    const lines = addLine(addLine([], "pizza", ["normal", "cheddar"]), "chapati", [], 2);
    const s = summarizeCart(lines, products, settings);
    expect(s.subtotal).toBe(580 + 400);
    expect(s.deliveryFee).toBe(150);
    expect(s.total).toBe(1130);
    expect(s.count).toBe(3);
    expect(s.blocked).toBe(false);
    expect(s.missingForMinimum).toBe(0);
  });

  it("livraison offerte au-delà du seuil, minimum de commande", () => {
    expect(summarizeCart(addLine([], "chapati", [], 15), products, settings).deliveryFee).toBe(0);
    expect(summarizeCart(addLine([], "chapati", [], 1), products, settings).missingForMinimum).toBe(300);
  });

  it("bloque les lignes invalides (option indisponible, taille manquante, produit retiré)", () => {
    expect(summarizeCart(addLine([], "pizza", ["normal", "camembert"]), products, settings).blocked).toBe(true);
    expect(summarizeCart(addLine([], "pizza", []), products, settings).lines[0]!.problem).toMatch(/Taille/);
    expect(summarizeCart(addLine([], "inconnu", []), products, settings).lines[0]!.problem).toMatch(/plus proposé/);
  });

  it("règles des groupes et prix « à partir de »", () => {
    expect(selectionProblem(pizza, ["mini", "normal"])).toBe("Taille");
    expect(selectionProblem(pizza, ["mini", "cheddar", "mozza"])).toBeNull();
    expect(fromPrice(pizza)).toBe(300);
  });

  it("modifie et supprime une quantité", () => {
    const lines = addLine([], "chapati", []);
    const key = lines[0]!.key;
    expect(setLineQuantity(lines, key, 4)[0]!.quantity).toBe(4);
    expect(setLineQuantity(lines, key, 0)).toHaveLength(0);
    expect(setLineQuantity(lines, key, 99)[0]!.quantity).toBe(50);
  });
});

describe("téléphone algérien", () => {
  it.each([
    ["0556 72 56 81", "0556725681"],
    ["+213 556 72 56 81", "0556725681"],
    ["00213556725681", "0556725681"],
    ["+213 0661-00-00-00", "0661000000"],
    ["07.70.12.34.56", "0770123456"],
  ])("%s → %s", (input, expected) => expect(normalizeDzPhone(input)).toBe(expected));

  it.each(["12345", "0256725681", "05567256", ""])("refuse %s", (input) => expect(normalizeDzPhone(input)).toBeNull());

  it("formate et crée un lien d'appel", () => {
    expect(formatPhone("0556725681")).toBe("0556 72 56 81");
    expect(telHref("0556725681")).toBe("tel:+213556725681");
  });
});

describe("statuts", () => {
  it("reprend les transitions du serveur", () => {
    expect(canTransition("PENDING", "CONFIRMED", "ADMIN")).toBe(true);
    expect(canTransition("PENDING", "READY", "ADMIN")).toBe(false);
    expect(canTransition("READY", "ASSIGNED", "ADMIN")).toBe(false); // via assignation uniquement
    expect(canTransition("ASSIGNED", "OUT_FOR_DELIVERY", "DRIVER")).toBe(true);
    expect(canTransition("PREPARING", "DELIVERED", "DRIVER")).toBe(false);
    expect(canTransition("PENDING", "CANCELLED", "CUSTOMER")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED", "CUSTOMER")).toBe(false);
    expect(canTransition("DELIVERED", "CANCELLED", "ADMIN")).toBe(false);
  });

  it("formate les montants en dinars", () => {
    expect(formatDA(1130).replace(/\s/g, " ")).toBe("1 130 DA");
  });
});

describe("jour à Alger", () => {
  it("minuit à Alger = 23:00 UTC la veille", async () => {
    const { algiersDayStart, algiersDateInput } = await import("./format");
    expect(algiersDayStart(new Date("2026-10-07T10:00:00Z"))).toBe("2026-10-06T23:00:00.000Z");
    expect(algiersDayStart(new Date("2026-10-07T23:30:00Z"))).toBe("2026-10-07T23:00:00.000Z");
    expect(algiersDateInput(new Date("2026-10-07T23:30:00Z"))).toBe("2026-10-08");
  });
});
