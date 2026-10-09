// Scénario complet côté base : CLIENT → COMMANDE → RESTAURANT → PRÉPARATION →
// LIVREUR → LIVRAISON → CLIENT, avec les contrôles de sécurité (RLS) à chaque étape.
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, errorOf, type Db } from "./harness";

let db: Db;
let customerA: string; // client anonyme
let customerB: string; // autre client anonyme
let admin: string;
let driverUser: string;
let driver2User: string;
let driverId: string;
let driver2Id: string;
let orderId: string;
let orderNumber: string;

// Point de livraison de test à Tizi Ouzou (≈ 1,6 km du restaurant)
const LOCATION = { latitude: 36.7118, longitude: 4.0459 };

const ids = async (sql: string, params: unknown[] = []) =>
  (await db.query<{ id: string }>(sql, params)).rows.map((r) => r.id);

async function orderPayload(overrides: Record<string, unknown> = {}) {
  const [chapati] = await ids("select id from products where name = 'Chapati Complet'");
  const [pizza] = await ids("select id from products where name = 'Pizza Margherita'");
  const [normal] = await ids(
    `select o.id from product_options o join product_option_groups g on g.id = o.group_id
     where g.product_id = $1 and g.name = 'Taille' and o.name = 'Normal'`, [pizza]);
  const [cheddar] = await ids(
    `select o.id from product_options o join product_option_groups g on g.id = o.group_id
     where g.product_id = $1 and o.name = 'Cheddar'`, [pizza]);
  return {
    name: "Amine Test",
    phone: "+213 555 12 34 56",
    address: "Cité des 200 logements, bloc B",
    wilaya: "Tizi Ouzou",
    commune: "Tizi Ouzou",
    ...LOCATION,
    delivery_instructions: "3e étage, porte gauche",
    additional_info: "Sans oignons",
    items: [
      { product_id: chapati, quantity: 2, option_ids: [], price: 1 }, // "price" ignoré par le serveur
      { product_id: pizza, quantity: 1, option_ids: [normal, cheddar] },
    ],
    ...overrides,
  };
}

const placeOrder = (userId: string, payload: unknown) =>
  as(db, userId, async (tx) =>
    (await tx.query<{ r: { id: string; order_number: string; total: number; subtotal: number; delivery_fee: number } }>(
      "select place_order($1::jsonb) as r", [JSON.stringify(payload)])).rows[0]!.r);

const statusOf = async (id: string) =>
  (await db.query<{ status: string }>("select status from orders where id = $1", [id])).rows[0]!.status;

beforeAll(async () => {
  db = await createDb();
  customerA = await createUser(db, null);
  customerB = await createUser(db, null);
  admin = await createUser(db, "admin@test.dz");
  driverUser = await createUser(db, "livreur@test.dz");
  driver2User = await createUser(db, "livreur2@test.dz");
  await db.query("select private.promote_to_admin('admin@test.dz')");
  driverId = (await db.query<{ id: string }>(
    "select private.promote_to_driver('livreur@test.dz', 'Karim', '0661000000') as id")).rows[0]!.id;
  driver2Id = (await db.query<{ id: string }>(
    "select private.promote_to_driver('livreur2@test.dz', 'Yanis', '0771000000') as id")).rows[0]!.id;
}, 60_000);

describe("menu et réglages", () => {
  it("le seed crée les 4 catégories et la carte complète", async () => {
    const { rows } = await db.query<{ name: string; n: number }>(
      `select c.name, count(p.id)::int as n from categories c left join products p on p.category_id = c.id
       group by c.name, c.sort_order order by c.sort_order`);
    expect(rows).toEqual([
      { name: "Chapati", n: 14 },
      { name: "Pizzas", n: 9 },
      { name: "Snacks", n: 10 },
      { name: "Boissons", n: 15 },
    ]);
  });

  it("un visiteur sans compte lit le menu mais ne peut pas le modifier", async () => {
    const n = await as(db, null, async (tx) =>
      (await tx.query<{ n: number }>("select count(*)::int as n from products")).rows[0]!.n);
    expect(n).toBe(48);
    expect(await errorOf(as(db, null, (tx) => tx.query("update products set price = 1")))).toMatch(/permission denied/);
    expect(await errorOf(as(db, null, (tx) => tx.query("select * from orders")))).toMatch(/permission denied/);
  });

  it("un client ne peut ni modifier le menu ni changer son propre rôle", async () => {
    const updated = await as(db, customerA, async (tx) =>
      (await tx.query("update products set price = 1 returning id")).rows.length);
    expect(updated).toBe(0); // RLS : aucune ligne visible en écriture
    expect(await errorOf(as(db, customerA, (tx) =>
      tx.query("update profiles set role = 'ADMIN' where user_id = $1", [customerA])))).toMatch(/permission denied/);
    expect(await errorOf(as(db, customerA, (tx) => tx.query("select private.promote_to_admin('x')"))))
      .toMatch(/permission denied/);
  });

  it("l'admin modifie les réglages, un catégorie désactivée disparaît du menu public", async () => {
    await as(db, admin, (tx) => tx.query("update restaurant_settings set delivery_fee = 150 where id = 1"));
    await as(db, admin, (tx) => tx.query("update categories set active = false where name = 'Boissons'"));
    const publicCount = await as(db, null, async (tx) =>
      (await tx.query<{ n: number }>("select count(*)::int as n from products")).rows[0]!.n);
    const adminCount = await as(db, admin, async (tx) =>
      (await tx.query<{ n: number }>("select count(*)::int as n from products")).rows[0]!.n);
    expect(publicCount).toBe(33);
    expect(adminCount).toBe(48);
    await as(db, admin, (tx) => tx.query("update categories set active = true where name = 'Boissons'"));
  });
});

describe("CLIENT → commande", () => {
  it("refuse une commande sans compte (même anonyme)", async () => {
    expect(await errorOf(as(db, null, (tx) => tx.query("select place_order('{}'::jsonb)"))))
      .toMatch(/permission denied/);
  });

  it("valide téléphone, position GPS et options obligatoires", async () => {
    expect(await errorOf(placeOrder(customerA, await orderPayload({ phone: "12345" })))).toBe("INVALID_PHONE");
    expect(await errorOf(placeOrder(customerA, await orderPayload({ latitude: null })))).toBe("LOCATION_REQUIRED");
    expect(await errorOf(placeOrder(customerA, await orderPayload({ latitude: 48.85, longitude: 2.35 }))))
      .toBe("LOCATION_OUT_OF_AREA");
    const payload = await orderPayload();
    payload.items[1]!.option_ids = []; // pizza sans taille
    expect(await errorOf(placeOrder(customerA, payload))).toBe("OPTION_RULE_VIOLATION");
    expect(await errorOf(placeOrder(customerA, await orderPayload({ items: [] })))).toBe("EMPTY_CART");
  });

  it("refuse une option d'un autre produit", async () => {
    const payload = await orderPayload();
    payload.items[0]!.option_ids = [...payload.items[1]!.option_ids]; // options pizza sur un chapati
    expect(await errorOf(placeOrder(customerA, payload))).toBe("OPTION_UNAVAILABLE");
  });

  it("crée la commande : numéro unique, prix recalculés par le serveur", async () => {
    const result = await placeOrder(customerA, await orderPayload());
    // 2 × Chapati Complet (200) + Margherita Normal (300 + 100) + Cheddar (180) = 980 ; livraison 150
    expect(result.subtotal).toBe(980);
    expect(result.delivery_fee).toBe(150);
    expect(result.total).toBe(1130);
    expect(result.order_number).toMatch(/^HC-\d{6}-001$/);
    orderId = result.id;
    orderNumber = result.order_number;

    const order = (await db.query<Record<string, unknown>>("select * from orders where id = $1", [orderId])).rows[0]!;
    expect(order.status).toBe("PENDING");
    expect(order.customer_phone).toBe("0555123456"); // normalisé
    expect(order.customer_latitude).toBe(LOCATION.latitude);
    expect(order.customer_longitude).toBe(LOCATION.longitude);
    expect(order.delivery_instructions).toBe("3e étage, porte gauche");

    const items = (await db.query<{ product_name: string; unit_price: number; total: number; options: unknown[] }>(
      "select product_name, unit_price, total, options from order_items where order_id = $1 order by unit_price",
      [orderId])).rows;
    expect(items.map((i) => [i.product_name, i.unit_price, i.total])).toEqual([
      ["Chapati Complet", 200, 400],
      ["Pizza Margherita", 580, 580],
    ]);
    expect(items[1]!.options).toHaveLength(2);
  });

  it("le numéro de commande suivant s'incrémente", async () => {
    const second = await placeOrder(customerB, await orderPayload({ name: "Client B" }));
    expect(second.order_number).toBe(orderNumber.replace(/001$/, "002"));
    await as(db, customerB, (tx) => tx.query("select customer_cancel_order($1)", [second.id]));
    expect(await statusOf(second.id)).toBe("CANCELLED");
  });

  it("un client ne voit jamais la commande d'un autre client", async () => {
    const seen = await as(db, customerB, async (tx) => ({
      orders: (await tx.query("select id from orders where id = $1", [orderId])).rows.length,
      items: (await tx.query("select id from order_items where order_id = $1", [orderId])).rows.length,
      history: (await tx.query("select id from order_status_history where order_id = $1", [orderId])).rows.length,
      customers: (await tx.query("select id from customers where user_id = $1", [customerA])).rows.length,
    }));
    expect(seen).toEqual({ orders: 0, items: 0, history: 0, customers: 0 });
    expect(await errorOf(as(db, customerB, (tx) => tx.query("select customer_cancel_order($1)", [orderId]))))
      .toBe("ORDER_NOT_FOUND");
    const own = await as(db, customerA, async (tx) =>
      (await tx.query("select id from orders where id = $1", [orderId])).rows.length);
    expect(own).toBe(1);
  });

  it("un client ne peut ni modifier sa commande ni appeler les fonctions admin/livreur", async () => {
    expect(await errorOf(as(db, customerA, (tx) =>
      tx.query("update orders set status = 'DELIVERED' where id = $1", [orderId])))).toMatch(/permission denied/);
    expect(await errorOf(as(db, customerA, (tx) =>
      tx.query("select admin_set_order_status($1, 'CONFIRMED')", [orderId])))).toBe("FORBIDDEN");
    expect(await errorOf(as(db, customerA, (tx) => tx.query("select driver_start_delivery($1)", [orderId]))))
      .toBe("FORBIDDEN");
    expect(await errorOf(as(db, customerA, (tx) =>
      tx.query("select service_create_driver($1, 'x', '0555000000')", [customerA])))).toMatch(/permission denied/);
  });
});

describe("RESTAURANT → préparation → assignation", () => {
  it("l'admin voit la commande et la notification « nouvelle commande »", async () => {
    const result = await as(db, admin, async (tx) => ({
      order: (await tx.query("select id from orders where id = $1", [orderId])).rows.length,
      notif: (await tx.query<{ title: string }>(
        "select title from notifications where order_id = $1 and audience = 'ADMIN'", [orderId])).rows,
    }));
    expect(result.order).toBe(1);
    expect(result.notif[0]!.title).toBe(`🔔 Nouvelle commande ${orderNumber}`);
    const customerSees = await as(db, customerB, async (tx) =>
      (await tx.query("select id from notifications where audience = 'ADMIN'")).rows.length);
    expect(customerSees).toBe(0);
  });

  it("refuse les transitions interdites", async () => {
    expect(await errorOf(as(db, admin, (tx) => tx.query("select admin_set_order_status($1, 'READY')", [orderId]))))
      .toBe("INVALID_STATUS_TRANSITION");
    expect(await errorOf(as(db, admin, (tx) => tx.query("select admin_assign_driver($1, $2)", [orderId, driverId]))))
      .toBe("ORDER_NOT_READY");
  });

  it("PENDING → CONFIRMED → PREPARING → READY", async () => {
    for (const status of ["CONFIRMED", "PREPARING", "READY"]) {
      await as(db, admin, (tx) => tx.query("select admin_set_order_status($1, $2)", [orderId, status]));
      expect(await statusOf(orderId)).toBe(status);
    }
    // le client ne peut plus annuler une commande confirmée
    expect(await errorOf(as(db, customerA, (tx) => tx.query("select customer_cancel_order($1)", [orderId]))))
      .toBe("INVALID_STATUS_TRANSITION");
  });

  it("refuse un livreur hors ligne, assigne un livreur disponible", async () => {
    expect(await errorOf(as(db, admin, (tx) => tx.query("select admin_assign_driver($1, $2)", [orderId, driverId]))))
      .toBe("DRIVER_OFFLINE");
    await as(db, driverUser, (tx) => tx.query("select driver_set_availability(true)"));
    await as(db, driver2User, (tx) => tx.query("select driver_set_availability(true)"));
    // assignation au livreur 2, puis réassignation au livreur 1
    await as(db, admin, (tx) => tx.query("select admin_assign_driver($1, $2)", [orderId, driver2Id]));
    await as(db, admin, (tx) => tx.query("select admin_assign_driver($1, $2)", [orderId, driverId]));
    const drivers = (await db.query<{ name: string; status: string }>(
      "select name, status from drivers order by name")).rows;
    expect(drivers).toEqual([{ name: "Karim", status: "BUSY" }, { name: "Yanis", status: "AVAILABLE" }]);
    expect(await statusOf(orderId)).toBe("ASSIGNED");
  });
});

describe("LIVREUR → livraison → CLIENT", () => {
  it("le livreur ne voit que ses commandes, l'autre livreur rien", async () => {
    const mine = await as(db, driverUser, async (tx) => ({
      orders: (await tx.query("select id from orders")).rows.length,
      items: (await tx.query("select id from order_items where order_id = $1", [orderId])).rows.length,
      customers: (await tx.query("select id from customers")).rows.length,
      otherDrivers: (await tx.query("select id from drivers")).rows.length,
      notif: (await tx.query<{ title: string }>("select title from notifications where type = 'DRIVER_ASSIGNED'")).rows,
    }));
    expect(mine.orders).toBe(1);
    expect(mine.items).toBe(2);
    expect(mine.customers).toBe(0);
    expect(mine.otherDrivers).toBe(1); // lui-même
    expect(mine.notif.map((n) => n.title)).toEqual([`🚴 Nouvelle commande ${orderNumber}`]);

    const other = await as(db, driver2User, async (tx) => (await tx.query("select id from orders")).rows.length);
    expect(other).toBe(0);
    expect(await errorOf(as(db, driver2User, (tx) => tx.query("select driver_start_delivery($1)", [orderId]))))
      .toBe("ORDER_NOT_FOUND");
  });

  it("un livreur occupé ne peut pas se mettre hors ligne", async () => {
    expect(await errorOf(as(db, driverUser, (tx) => tx.query("select driver_set_availability(false)"))))
      .toBe("DRIVER_HAS_ACTIVE_ORDERS");
  });

  it("démarre l'itinéraire, partage sa position, livre", async () => {
    await as(db, driverUser, (tx) => tx.query("select driver_start_delivery($1)", [orderId]));
    expect(await statusOf(orderId)).toBe("OUT_FOR_DELIVERY");

    await as(db, driverUser, (tx) => tx.query("select driver_report_location(36.70, 4.05, 12)"));
    const pos = (await db.query<{ current_latitude: number; n: number }>(
      `select d.current_latitude, (select count(*)::int from driver_locations l where l.driver_id = d.id) as n
       from drivers d where d.id = $1`, [driverId])).rows[0]!;
    expect(pos).toEqual({ current_latitude: 36.7, n: 1 });
    expect(await errorOf(as(db, driverUser, (tx) => tx.query("select driver_report_location(48.8, 2.3)"))))
      .toBe("INVALID_LOCATION");

    // le client voit son livreur (position masquée tant que le partage est désactivé)
    const seen = await as(db, customerA, async (tx) =>
      (await tx.query<{ name: string; phone: string; latitude: number | null }>(
        "select * from get_order_driver($1)", [orderId])).rows);
    expect(seen).toEqual([expect.objectContaining({ name: "Karim", phone: "0661000000", latitude: null })]);
    const notMine = await as(db, customerB, async (tx) =>
      (await tx.query("select * from get_order_driver($1)", [orderId])).rows.length);
    expect(notMine).toBe(0);

    await as(db, driverUser, (tx) => tx.query("select driver_complete_delivery($1)", [orderId]));
    expect(await statusOf(orderId)).toBe("DELIVERED");
    const driver = (await db.query<{ status: string }>("select status from drivers where id = $1", [driverId])).rows[0]!;
    expect(driver.status).toBe("AVAILABLE");
  });

  it("le client voit « livrée », la frise complète et ses notifications", async () => {
    const result = await as(db, customerA, async (tx) => ({
      status: (await tx.query<{ status: string }>("select status from orders where id = $1", [orderId])).rows[0]!.status,
      history: (await tx.query<{ status: string }>(
        "select status from order_status_history where order_id = $1 order by id", [orderId])).rows.map((r) => r.status),
      notif: (await tx.query<{ title: string }>(
        "select title from notifications where order_id = $1 order by id", [orderId])).rows.map((r) => r.title),
    }));
    expect(result.status).toBe("DELIVERED");
    expect(result.history).toEqual([
      "PENDING", "CONFIRMED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED",
    ]);
    expect(result.notif).toEqual([
      "🟡 Commande reçue",
      "✅ Commande confirmée",
      "🟠 En préparation",
      "🟢 Commande prête",
      "🛵 Livreur assigné",
      "🔵 Livreur en route",
      "✅ Votre commande a été livrée",
    ]);
  });

  it("tableau de bord : compteurs et chiffre d'affaires du jour", async () => {
    const stats = await as(db, admin, async (tx) =>
      (await tx.query<{ s: Record<string, number> }>("select admin_dashboard_stats() as s")).rows[0]!.s);
    expect(stats).toMatchObject({
      orders_today: 2, pending: 0, delivered_today: 1, cancelled_today: 1, revenue_today: 1130,
    });
    expect(await errorOf(as(db, customerA, (tx) => tx.query("select admin_dashboard_stats()")))).toBe("FORBIDDEN");
  });
});

describe("administration du menu et des livreurs", () => {
  it("enregistre les options d'un produit en conservant les identifiants", async () => {
    const [pizza] = await ids("select id from products where name = 'Pizza Thon'");
    const groups = await as(db, admin, async (tx) =>
      (await tx.query<{ id: string; name: string; options: { id: string; name: string }[] }>(
        `select g.id, g.name, json_agg(json_build_object('id', o.id, 'name', o.name, 'price_delta', o.price_delta)
           order by o.sort_order) as options
         from product_option_groups g join product_options o on o.group_id = g.id
         where g.product_id = $1 group by g.id order by g.sort_order`, [pizza])).rows);
    const size = groups[0]!;
    const payload = [{
      id: size.id, name: "Taille", selection: "SINGLE", required: true,
      options: [...size.options.slice(0, 2), { name: "Family", price_delta: 2000 }],
    }];
    await as(db, admin, (tx) => tx.query("select admin_save_product_options($1, $2::jsonb)", [pizza, JSON.stringify(payload)]));
    const after = (await db.query<{ id: string; name: string }>(
      `select o.id, o.name from product_options o join product_option_groups g on g.id = o.group_id
       where g.product_id = $1 order by o.sort_order`, [pizza])).rows;
    expect(after.map((o) => o.name)).toEqual(["Mini", "Normal", "Family"]);
    expect(after[0]!.id).toBe(size.options[0]!.id);
    expect(await errorOf(as(db, customerA, (tx) =>
      tx.query("select admin_save_product_options($1, '[]'::jsonb)", [pizza])))).toBe("FORBIDDEN");
  });

  it("un livreur désactivé passe hors ligne et ne voit plus rien", async () => {
    await as(db, admin, (tx) => tx.query("update drivers set active = false where id = $1", [driver2Id]));
    const d = (await db.query<{ status: string }>("select status from drivers where id = $1", [driver2Id])).rows[0]!;
    expect(d.status).toBe("OFFLINE");
    expect(await errorOf(as(db, driver2User, (tx) => tx.query("select driver_set_availability(true)"))))
      .toBe("FORBIDDEN");
    // un livreur ne peut pas modifier sa fiche (nom, statut) directement
    const updated = await as(db, driverUser, async (tx) =>
      (await tx.query("update drivers set name = 'X' returning id")).rows.length);
    expect(updated).toBe(0);
  });

  it("photos : seul l'admin peut téléverser dans le bucket product-images", async () => {
    const upload = (uid: string) =>
      as(db, uid, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('product-images', 'a.webp')"));
    expect(await errorOf(upload(customerA))).toMatch(/row-level security/);
    expect(await errorOf(upload(admin))).toBe("OK");
  });

  it("refuse les commandes quand le restaurant est fermé ou hors zone", async () => {
    await as(db, admin, (tx) => tx.query("update restaurant_settings set accepting_orders = false where id = 1"));
    expect(await errorOf(placeOrder(customerB, await orderPayload()))).toBe("ORDERS_CLOSED");
    await as(db, admin, (tx) =>
      tx.query("update restaurant_settings set accepting_orders = true, delivery_radius_km = 1 where id = 1"));
    expect(await errorOf(placeOrder(customerB, await orderPayload()))).toBe("OUT_OF_DELIVERY_ZONE");
  });
});

describe("profil client : téléphone et adresse de livraison", () => {
  it("le client modifie son nom/téléphone, jamais ceux d'un autre", async () => {
    const own = await as(db, customerA, async (tx) =>
      (await tx.query("update profiles set name = 'Amine Test', phone = '0661223344' where user_id = $1 returning id", [customerA])).rows.length);
    expect(own).toBe(1);
    const other = await as(db, customerB, async (tx) =>
      (await tx.query("update profiles set phone = '0661000000' where user_id = $1 returning id", [customerA])).rows.length);
    expect(other).toBe(0);
    const phone = (await db.query<{ phone: string }>("select phone from profiles where user_id = $1", [customerA])).rows[0]!.phone;
    expect(phone).toBe("0661223344");
  });

  it("enregistre l'adresse en gardant la dernière position GPS et le téléphone du profil", async () => {
    const row = await as(db, customerA, async (tx) =>
      (await tx.query<{ address: string; phone: string; latitude: number; commune: string }>(
        "select * from customer_save_address($1, $2, $3, $4)",
        ["Lotissement Bouaziz, villa 12", "Tizi Ouzou", "Draâ Ben Khedda", "Portail vert"])).rows[0]!);
    expect(row).toMatchObject({ address: "Lotissement Bouaziz, villa 12", commune: "Draâ Ben Khedda", phone: "0661223344" });
    expect(row.latitude).toBe(LOCATION.latitude);
    const seenByB = await as(db, customerB, async (tx) =>
      (await tx.query("select id from customers where user_id = $1", [customerA])).rows.length);
    expect(seenByB).toBe(0);
  });

  it("refuse une adresse invalide ou un profil incomplet", async () => {
    expect(await errorOf(as(db, customerA, (tx) =>
      tx.query("select customer_save_address('abc', 'Tizi Ouzou', 'Tizi Ouzou')")))).toBe("INVALID_ADDRESS");
    expect(await errorOf(as(db, customerB, (tx) =>
      tx.query("select customer_save_address('Rue des oliviers 4', 'Tizi Ouzou', 'Tizi Ouzou')")))).toBe("PROFILE_INCOMPLETE");
    expect(await errorOf(as(db, null, (tx) =>
      tx.query("select customer_save_address('Rue des oliviers 4', 'Tizi Ouzou', 'Tizi Ouzou')")))).toMatch(/permission denied/);
    expect(await errorOf(as(db, customerA, (tx) =>
      tx.query("update customers set address = 'piratage' where user_id = $1", [customerA])))).toMatch(/permission denied/);
  });
});

describe("inscription des livreurs : email prouvé (code ou Google) + validation par l'administration", () => {
  let candidate: string;
  let other: string;
  let applicationId: string;

  beforeAll(async () => {
    candidate = await createUser(db, "samir.livreur@gmail.com");
    other = await createUser(db, "autre.candidat@gmail.com");
  });

  it("refuse une demande sans email prouvé (mot de passe, invité, visiteur, email non confirmé)", async () => {
    const call = "select * from driver_apply('Samir', 'Benali', '0550 11 22 33')";
    expect(await errorOf(as(db, candidate, (tx) => tx.query(call), "password"))).toBe("EMAIL_NOT_VERIFIED");
    expect(await errorOf(as(db, candidate, (tx) => tx.query(call), "anonymous"))).toBe("EMAIL_NOT_VERIFIED");
    expect(await errorOf(as(db, null, (tx) => tx.query(call)))).toMatch(/permission denied/);
    // jeton « code email » mais adresse jamais confirmée côté Auth : refusé aussi
    const unconfirmed = await createUser(db, "pas.confirme@gmail.com");
    await db.query("update auth.users set email_confirmed_at = null where id = $1", [unconfirmed]);
    expect(await errorOf(as(db, unconfirmed, (tx) => tx.query(call), "otp"))).toBe("EMAIL_NOT_VERIFIED");
  });

  it("valide prénom, nom et téléphone", async () => {
    expect(await errorOf(as(db, candidate, (tx) => tx.query("select driver_apply('S', 'Benali', '0550112233')"), "google")))
      .toBe("INVALID_FIRST_NAME");
    expect(await errorOf(as(db, candidate, (tx) => tx.query("select driver_apply('Samir', 'Benali', '12345')"), "google")))
      .toBe("INVALID_PHONE");
  });

  it("enregistre la demande (email de Google) et prévient les administrateurs ; le compte reste client", async () => {
    const app = await as(db, candidate, async (tx) =>
      (await tx.query<{ id: string; status: string; email: string; phone: string }>(
        "select * from driver_apply('Samir', 'Benali', '0550 11 22 33')")).rows[0]!, "google");
    applicationId = app.id;
    expect(app).toMatchObject({ status: "PENDING", email: "samir.livreur@gmail.com", phone: "0550112233" });
    const role = (await db.query<{ role: string }>("select role from profiles where user_id = $1", [candidate])).rows[0]!.role;
    expect(role).toBe("CUSTOMER");
    const notified = await as(db, admin, async (tx) =>
      (await tx.query("select 1 from notifications where type = 'driver_application'")).rows.length);
    expect(notified).toBeGreaterThan(0);
    // en attente : aucune commande visible
    const orders = await as(db, candidate, async (tx) => (await tx.query("select id from orders")).rows.length, "google");
    expect(orders).toBe(0);
  });

  it("chacun ne voit que sa demande ; l'administrateur les voit toutes ; aucune écriture directe", async () => {
    // connexion par code reçu par email (OTP)
    await as(db, other, (tx) => tx.query("select driver_apply('Nadia', 'Ait Ali', '0770998877')"), "otp");
    const seenByCandidate = await as(db, candidate, async (tx) =>
      (await tx.query("select user_id from driver_applications")).rows.length, "google");
    expect(seenByCandidate).toBe(1);
    const seenByAdmin = await as(db, admin, async (tx) => (await tx.query("select id from driver_applications")).rows.length);
    expect(seenByAdmin).toBe(2);
    expect(await errorOf(as(db, candidate, (tx) =>
      tx.query("update driver_applications set status = 'APPROVED' where user_id = $1", [candidate]), "google"))).toMatch(/permission denied/);
  });

  it("seul un administrateur décide ; l'approbation crée la fiche livreur", async () => {
    for (const user of [candidate, driverUser, customerA]) {
      expect(await errorOf(as(db, user, (tx) =>
        tx.query("select admin_decide_driver_application($1, true)", [applicationId]), "google"))).toBe("FORBIDDEN");
    }
    const decided = await as(db, admin, async (tx) =>
      (await tx.query<{ status: string }>("select * from admin_decide_driver_application($1, true)", [applicationId])).rows[0]!);
    expect(decided.status).toBe("APPROVED");
    const profile = (await db.query<{ role: string; name: string }>("select role, name from profiles where user_id = $1", [candidate])).rows[0]!;
    expect(profile).toEqual({ role: "DRIVER", name: "Samir Benali" });
    const driver = await as(db, candidate, async (tx) =>
      (await tx.query<{ name: string; phone: string; email: string; status: string; active: boolean }>(
        "select name, phone, email, status, active from drivers")).rows, "google");
    expect(driver).toEqual([{ name: "Samir Benali", phone: "0550112233", email: "samir.livreur@gmail.com", status: "OFFLINE", active: true }]);
    expect(await errorOf(as(db, admin, (tx) =>
      tx.query("select admin_decide_driver_application($1, false)", [applicationId])))).toBe("ALREADY_DECIDED");
    // un compte déjà livreur ne peut plus déposer de demande
    expect(await errorOf(as(db, candidate, (tx) =>
      tx.query("select driver_apply('Samir', 'Benali', '0550112233')"), "google"))).toBe("ALREADY_STAFF");
  });

  it("le refus laisse le compte client ; une nouvelle demande repart « en attente »", async () => {
    const id = (await db.query<{ id: string }>("select id from driver_applications where user_id = $1", [other])).rows[0]!.id;
    const rejected = await as(db, admin, async (tx) =>
      (await tx.query<{ status: string }>("select * from admin_decide_driver_application($1, false)", [id])).rows[0]!);
    expect(rejected.status).toBe("REJECTED");
    const role = (await db.query<{ role: string }>("select role from profiles where user_id = $1", [other])).rows[0]!.role;
    expect(role).toBe("CUSTOMER");
    const again = await as(db, other, async (tx) =>
      (await tx.query<{ status: string }>("select * from driver_apply('Nadia', 'Ait Ali', '0770998877')")).rows[0]!, "otp");
    expect(again.status).toBe("PENDING");
  });

  it("accepte un email prouvé par code de confirmation d'inscription ou de réinitialisation de mot de passe", async () => {
    const bySignupCode = await createUser(db, "nouveau.motdepasse@gmail.com");
    const app1 = await as(db, bySignupCode,
      (tx) => tx.query("select * from driver_apply('Lina', 'Amrani', '0550332211')"), "email_signup");
    expect(app1.rows[0].status).toBe("PENDING");

    const byRecoveryCode = await createUser(db, "mdp.oublie@gmail.com");
    const app2 = await as(db, byRecoveryCode,
      (tx) => tx.query("select * from driver_apply('Reda', 'Chérif', '0550998877')"), "recovery");
    expect(app2.rows[0].status).toBe("PENDING");
  });
});

describe("historique des courses du livreur (sans données personnelles des clients)", () => {
  it("le livreur retrouve ses courses terminées, même après 24 h, sans nom/téléphone/adresse du client", async () => {
    // vieillit la course livrée : elle sort de la RLS « 24 h » des commandes
    // (le déclencheur orders_updated_at remettrait updated_at à maintenant)
    await db.exec("alter table orders disable trigger orders_updated_at");
    await db.query("update orders set delivered_at = now() - interval '3 days', updated_at = now() - interval '3 days' where driver_id = $1 and status = 'DELIVERED'", [driverId]);
    await db.exec("alter table orders enable trigger orders_updated_at");
    const visible = await as(db, driverUser, async (tx) => (await tx.query("select id from orders where status = 'DELIVERED'")).rows.length);
    expect(visible).toBe(0);
    const { rows, fields } = await as(db, driverUser, (tx) => tx.query<{ order_number: string; status: string; total: number; items_count: number }>(
      "select * from driver_delivery_history()"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ status: "DELIVERED" });
    expect(rows[0]!.items_count).toBeGreaterThan(0);
    const columns = fields.map((f) => f.name);
    for (const personal of ["customer_name", "customer_phone", "customer_address", "latitude", "longitude", "customer_user_id"]) {
      expect(columns).not.toContain(personal);
    }
  });

  it("chaque livreur ne voit que ses courses ; client et visiteur refusés", async () => {
    await db.query("update drivers set active = true where id = $1", [driver2Id]); // désactivé par un test précédent
    const mine = await as(db, driverUser, async (tx) => (await tx.query<{ order_id: string }>("select order_id from driver_delivery_history()")).rows.map((r) => r.order_id));
    const other = await as(db, driver2User, async (tx) => (await tx.query<{ order_id: string }>("select order_id from driver_delivery_history()")).rows.map((r) => r.order_id));
    expect(other.some((id) => mine.includes(id))).toBe(false);
    expect(await errorOf(as(db, customerA, (tx) => tx.query("select * from driver_delivery_history()")))).toBe("FORBIDDEN");
    expect(await errorOf(as(db, null, (tx) => tx.query("select * from driver_delivery_history()")))).toMatch(/permission denied/);
  });
});
