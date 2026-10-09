// =============================================================================
// Test de bout en bout sur VOTRE projet Supabase (npm run e2e)
// CLIENT → COMMANDE → RESTAURANT → PRÉPARATION → LIVREUR → LIVRAISON → CLIENT
//
// Utilise uniquement la clé publique + des comptes de test (jamais la clé secrète),
// exactement comme les applications. Vérifie aussi le temps réel et la RLS.
// Les "clients" se connectent par e-mail/mot de passe plutôt que par Google
// (impossible à scripter sans navigateur) — seul le chemin d'authentification
// diffère, le reste (place_order, RLS, notifications...) est identique.
// Prérequis : .env rempli (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_*),
// base installée, un compte ADMIN et un compte livreur (voir README).
// ⚠ Crée une vraie commande « TEST AUTOMATIQUE » (visible dans l'historique).
// =============================================================================
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const required = { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key, E2E_ADMIN_EMAIL: env.E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD: env.E2E_ADMIN_PASSWORD, E2E_DRIVER_EMAIL: env.E2E_DRIVER_EMAIL, E2E_DRIVER_PASSWORD: env.E2E_DRIVER_PASSWORD };
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`✗ Variables manquantes dans .env : ${missing.join(", ")}`);
  process.exit(1);
}

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const customer = client();
const otherCustomer = client();
const admin = client();
const driver = client();

let failures = 0;
async function step(label, fn) {
  const start = Date.now();
  try {
    const info = await fn();
    console.log(`✓ ${label}${info ? ` — ${info}` : ""} (${Date.now() - start} ms)`);
  } catch (error) {
    failures++;
    console.error(`✗ ${label}\n    ${error?.message ?? error}${error?.details ? ` (${error.details})` : ""}`);
    throw error;
  }
}
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Journal d'événements Realtime : rien n'est perdu, même reçu avant d'être attendu. */
function eventLog() {
  const events = [];
  const waiters = [];
  return {
    push(payload) {
      events.push(payload);
      for (const w of [...waiters]) if (w.predicate(payload)) w.done(payload);
    },
    wait(label, predicate, ms = 15_000) {
      const hit = events.find(predicate);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          done: (payload) => { clearTimeout(timer); waiters.splice(waiters.indexOf(waiter), 1); resolve(payload); },
        };
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`Pas d'événement temps réel « ${label} » en ${ms / 1000} s`));
        }, ms);
        waiters.push(waiter);
      });
    },
  };
}

function subscribe(sb, name, filter, onEvent) {
  return new Promise((resolve, reject) => {
    const channel = sb.channel(`${name}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", ...(filter ? { filter } : {}) }, onEvent)
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") resolve(channel);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(err ?? new Error(`Realtime ${name} : ${status}`));
      });
  });
}

const ctx = {};

try {
  await step("Connexion admin", async () => {
    must(await admin.auth.signInWithPassword({ email: env.E2E_ADMIN_EMAIL, password: env.E2E_ADMIN_PASSWORD }));
    const { user } = must(await admin.auth.getUser());
    const profile = must(await admin.from("profiles").select("role").eq("user_id", user.id).single());
    if (profile.role !== "ADMIN") throw new Error(`rôle ${profile.role} (attendu ADMIN) — voir README § Comptes`);
  });

  await step("Connexion livreur", async () => {
    must(await driver.auth.signInWithPassword({ email: env.E2E_DRIVER_EMAIL, password: env.E2E_DRIVER_PASSWORD }));
    const rows = must(await driver.from("drivers").select("id, name, active"));
    if (rows.length !== 1 || !rows[0].active) throw new Error("fiche livreur introuvable ou désactivée");
    ctx.driver = rows[0];
    return ctx.driver.name;
  });

  await step("Client : création de deux comptes de test", async () => {
    // Le vrai client ne se connecte qu'avec Google (§ 7 du README) : un navigateur
    // automatisé ne peut pas passer un vrai écran de consentement Google. On crée
    // donc ici deux comptes par e-mail/mot de passe (acceptés par Supabase Auth
    // indépendamment de ce que propose l'interface), qui empruntent ensuite
    // exactement le même chemin côté base (place_order, RLS, notifications).
    const password = `Test-${crypto.randomUUID()}`;
    must(await customer.auth.signUp({ email: `e2e-${crypto.randomUUID()}@example.com`, password }));
    must(await otherCustomer.auth.signUp({ email: `e2e-${crypto.randomUUID()}@example.com`, password }));
  });

  await step("Menu public et réglages", async () => {
    ctx.settings = must(await customer.from("restaurant_settings").select("*").single());
    if (!ctx.settings.accepting_orders) throw new Error("commandes fermées (Administration → Réglages)");
    if (ctx.settings.latitude == null) throw new Error("position du restaurant non définie (Réglages)");
    const products = must(await customer.from("products")
      .select("id, name, price, available, product_option_groups(id, required, selection, product_options(id, available))")
      .eq("available", true));
    const simple = products.find((p) => !p.product_option_groups.some((g) => g.required));
    if (!simple) throw new Error("aucun produit disponible sans option obligatoire");
    ctx.items = [{ product_id: simple.id, quantity: 2, option_ids: [] }];
    return `${products.length} produits disponibles`;
  });

  // Écoutes temps réel ouvertes AVANT la commande
  const adminLog = eventLog();
  const driverLog = eventLog();
  const customerLog = eventLog();
  await subscribe(admin, "admin", null, adminLog.push);
  await subscribe(driver, "driver", `driver_id=eq.${ctx.driver.id}`, driverLog.push);
  const customerSaw = (status) =>
    customerLog.wait(`client : ${status}`, (p) => p.new?.id === ctx.orderId && p.new.status === status);

  await step("CLIENT → commande", async () => {
    // Position de test : à ~300 m du restaurant (le test n'utilise pas de vrai client)
    const placed = must(await customer.rpc("place_order", { p_order: {
      name: "TEST AUTOMATIQUE", phone: "0550000000", address: "Adresse de test (script e2e)",
      wilaya: "Tizi Ouzou", commune: "Tizi Ouzou",
      latitude: ctx.settings.latitude + 0.002, longitude: ctx.settings.longitude + 0.002,
      delivery_instructions: "Test automatique — ne pas livrer", additional_info: "", items: ctx.items,
    } }));
    ctx.orderId = placed.id;
    await subscribe(customer, "customer", `id=eq.${ctx.orderId}`, customerLog.push);
    return `${placed.order_number} · ${placed.total} DA`;
  });

  await step("RESTAURANT reçoit la commande en temps réel", async () => {
    await adminLog.wait("admin : nouvelle commande", (p) => p.eventType === "INSERT" && p.new?.id === ctx.orderId);
  });

  await step("RLS : un autre client ne voit pas la commande", async () => {
    const rows = must(await otherCustomer.from("orders").select("id").eq("id", ctx.orderId));
    if (rows.length) throw new Error("FAILLE : commande visible par un autre client");
  });

  for (const status of ["CONFIRMED", "PREPARING", "READY"]) {
    await step(`RESTAURANT → ${status} (vu par le client en direct)`, async () => {
      must(await admin.rpc("admin_set_order_status", { p_order_id: ctx.orderId, p_status: status }));
      await customerSaw(status);
    });
  }

  await step("LIVREUR disponible", async () => must(await driver.rpc("driver_set_availability", { p_available: true })));

  await step("RESTAURANT assigne le livreur → le livreur la reçoit en direct", async () => {
    must(await admin.rpc("admin_assign_driver", { p_order_id: ctx.orderId, p_driver_id: ctx.driver.id }));
    await Promise.all([
      driverLog.wait("livreur : commande assignée", (p) => p.new?.id === ctx.orderId && p.new.status === "ASSIGNED"),
      customerSaw("ASSIGNED"),
    ]);
  });

  await step("RLS : le livreur ne voit que ses commandes", async () => {
    const rows = must(await driver.from("orders").select("id, driver_id"));
    if (rows.some((r) => r.driver_id !== ctx.driver.id)) throw new Error("FAILLE : commande d'un autre livreur visible");
    if (!rows.some((r) => r.id === ctx.orderId)) throw new Error("commande assignée invisible");
  });

  await step("LIVREUR démarre l'itinéraire (client : « Livreur en route »)", async () => {
    must(await driver.rpc("driver_start_delivery", { p_order_id: ctx.orderId }));
    must(await driver.rpc("driver_report_location", {
      p_latitude: ctx.settings.latitude + 0.001, p_longitude: ctx.settings.longitude + 0.001, p_accuracy: 10,
    }));
    await customerSaw("OUT_FOR_DELIVERY");
  });

  await step("LIVREUR : « Commande livrée » → CLIENT voit DELIVERED", async () => {
    must(await driver.rpc("driver_complete_delivery", { p_order_id: ctx.orderId }));
    await customerSaw("DELIVERED");
    const notif = must(await customer.from("notifications").select("title").eq("order_id", ctx.orderId).order("id"));
    if (!notif.some((n) => n.title.includes("livrée"))) throw new Error("notification « livrée » absente");
    return "notification « ✅ Votre commande a été livrée » reçue";
  });
} catch {
  // déjà affiché par step()
} finally {
  await Promise.all([customer, otherCustomer, admin, driver].map((c) => c.removeAllChannels()));
}

console.log(failures ? `\n✗ Scénario interrompu (${failures} échec).` : "\n✅ Scénario complet validé.");
process.exit(failures ? 1 : 0);
