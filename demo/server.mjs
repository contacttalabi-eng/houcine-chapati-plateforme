// =============================================================================
// Houcine Chapati — MODE DÉMO LOCAL (npm run demo)
// -----------------------------------------------------------------------------
// Permet de voir et tester les 3 applications SANS projet Supabase :
//   * PostgreSQL embarqué (PGlite) avec les VRAIES migrations, la vraie RLS,
//     les vraies fonctions métier et le seed ;
//   * une imitation locale des API Supabase utilisées par les applications
//     (Auth, REST/RPC, Realtime, Storage, Edge Function manage-drivers).
// Données en mémoire : tout est remis à zéro à chaque lancement.
// ⚠ Outil de démonstration uniquement — la production utilise Supabase (README).
// =============================================================================
import { randomInt } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { WebSocketServer } from "ws";

const ROOT = join(import.meta.dirname, "..");
const API_PORT = 54321;
// Adresse réseau local (Wi-Fi) de ce PC, pour que les applications soient
// aussi utilisables depuis un téléphone sur le même réseau — pas seulement
// "localhost", qui depuis un téléphone désignerait le téléphone lui-même.
function lanAddress() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return null;
}
const LAN_IP = lanAddress();
const API_HOST = LAN_IP ?? "localhost";
const API_URL = `http://${API_HOST}:${API_PORT}`;
const PUBLIC_KEY = "sb_publishable_demo_local";
const PASSWORD = "demo1234";
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const log = (...a) => console.log("[démo]", ...a);

// ----------------------------------------------------------------- base de données
const db = await PGlite.create();
await db.exec(read("tests/db/supabase-stub.sql"));
for (const f of readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(read(`supabase/migrations/${f}`));
}
await db.exec(read("supabase/seed.sql"));

// Journal des modifications → diffusion temps réel (remplace la réplication logique)
const PUBLISHED = ["orders", "notifications", "drivers", "categories", "products",
  "product_option_groups", "product_options", "restaurant_settings", "driver_applications"];
await db.exec(`
  create schema demo;
  create table demo.changes (id serial primary key, tbl text, op text, new_row jsonb, old_row jsonb, at timestamptz default now());
  create function demo.capture() returns trigger language plpgsql security definer set search_path = '' as $$
  begin
    insert into demo.changes (tbl, op, new_row, old_row)
    values (tg_table_name, tg_op,
            case when tg_op <> 'DELETE' then to_jsonb(new) end,
            case when tg_op <> 'INSERT' then to_jsonb(old) end);
    return null;
  end $$;
  ${PUBLISHED.map((t) => `create trigger demo_capture after insert or update or delete on public.${t}
     for each row execute function demo.capture();`).join("\n")}
`);

// ----------------------------------------------------------------- comptes de démo
const users = new Map(); // id → { id, email, is_anonymous, created_at, password, provider, userMetadata }
async function createAuthUser(email, password, provider = email ? "email" : "anonymous", userMetadata = {}) {
  const { rows } = await db.query("insert into auth.users (email, is_anonymous, email_confirmed_at) values ($1, $2, case when $1::text is null then null else now() end) returning id, created_at",
    [email, !email]);
  const user = { id: rows[0].id, email, is_anonymous: !email, created_at: rows[0].created_at, password, provider, userMetadata };
  users.set(user.id, user);
  return user;
}
await createAuthUser("admin@demo.dz", PASSWORD);
await db.query("select private.promote_to_admin('admin@demo.dz')");
for (const [email, name, phone] of [["karim@demo.dz", "Karim", "0661123456"], ["yanis@demo.dz", "Yanis", "0771234567"]]) {
  await createAuthUser(email, PASSWORD);
  await db.query("select private.promote_to_driver($1, $2, $3)", [email, name, phone]);
}
await db.exec("delete from demo.changes");

// Connexion Google simulée : un seul compte "Google" par lancement de la démo,
// créé à la première connexion, pour pouvoir tester à la fois l'inscription
// (prénom/nom/téléphone manquants) et le retour d'un client déjà inscrit.
let demoGoogleUser = null;
async function getOrCreateDemoGoogleUser() {
  demoGoogleUser ??= await createAuthUser("samir.livreur@gmail.com", null, "google", { full_name: "Samir Benali" });
  return demoGoogleUser;
}

// Codes d'échange PKCE à usage unique (GET /authorize → POST /token?grant_type=pkce).
const pkceCodes = new Map();

// ----------------------------------------------------------------- jetons (démo : non signés)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
// method : password | otp | oauth | anonymous (claim « amr » des jetons Supabase)
function tokenFor(user, method) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const amr = [{ method, timestamp: Math.floor(Date.now() / 1000) }];
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: user.id, role: "authenticated", email: user.email, is_anonymous: user.is_anonymous, app_metadata: { provider: user.provider, providers: [user.provider] }, amr, exp })}.demo`;
}
function userFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const user = users.get(payload.sub);
    return user ? { ...user, amr: Array.isArray(payload.amr) ? payload.amr : [] } : null;
  } catch {
    return null;
  }
}
const authUserJson = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email ?? "", phone: "",
  is_anonymous: u.is_anonymous, app_metadata: { provider: u.provider, providers: [u.provider] },
  user_metadata: u.userMetadata ?? {}, identities: [], created_at: u.created_at, updated_at: u.created_at,
});
const session = (u, method) => ({
  access_token: tokenFor(u, method), token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `rt_${u.id}_${method}`, user: authUserJson(u),
});

// Codes à 6 chiffres envoyés « par email » (démo : affichés dans la console et lisibles via /demo/otp)
const otpCodes = new Map(); // email → { code, expires }

// Exécute fn avec les droits de l'utilisateur (RLS appliquée, comme via l'API Supabase)
function asUser(user, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(
      user ? { sub: user.id, role: "authenticated", is_anonymous: user.is_anonymous,
        app_metadata: { provider: user.provider, providers: [user.provider] }, amr: user.amr ?? [] } : { role: "anon" })]);
    return fn(tx);
  });
}

// ----------------------------------------------------------------- mini PostgREST
const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = (name) => {
  if (!IDENT.test(name)) throw httpError(400, "PGRST100", `Nom invalide : ${name}`);
  return `"${name}"`;
};
const RELATIONS = {
  categories: { products: "category_id" },
  products: { product_option_groups: "product_id" },
  product_option_groups: { product_options: "group_id" },
  orders: { order_items: "order_id", order_status_history: "order_id" },
};

function httpError(status, code, message, details = null) {
  return Object.assign(new Error(message), { status, body: { code, message, details, hint: null } });
}

function parseSelect(input) {
  const s = (input || "*").replace(/\s+/g, "");
  let i = 0;
  const list = () => {
    const items = [];
    while (i < s.length && s[i] !== ")") {
      let token = "";
      while (i < s.length && !",()".includes(s[i])) token += s[i++];
      const [aliasOrName, maybeName] = token.split(":");
      const name = (maybeName ?? aliasOrName).split("!")[0];
      const alias = maybeName ? aliasOrName : null;
      if (s[i] === "(") {
        i++;
        const children = list();
        i++;
        items.push({ type: "embed", name, alias, children });
      } else {
        items.push(name === "*" ? { type: "star" } : { type: "col", name, alias });
      }
      if (s[i] === ",") i++;
    }
    return items;
  };
  return list();
}

function selectColumns(table, items, alias, depth) {
  return items.map((it) => {
    if (it.type === "star") return `${alias}.*`;
    if (it.type === "col") return `${alias}.${q(it.name)}${it.alias ? ` as ${q(it.alias)}` : ""}`;
    const fk = RELATIONS[table]?.[it.name];
    if (!fk) throw httpError(400, "PGRST200", `Relation inconnue ${table} → ${it.name}`);
    const a = `t${depth + 1}`;
    return `(select coalesce(json_agg(r${depth + 1}), '[]'::json) from (select ${selectColumns(it.name, it.children, a, depth + 1)}
      from public.${q(it.name)} ${a} where ${a}.${q(fk)} = ${alias}.id) r${depth + 1}) as ${q(it.alias ?? it.name)}`;
  }).join(", ");
}

const unquote = (v) => (v.length > 1 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);
const pgArray = (values) => `{${values.map((v) => `"${v.replace(/["\\]/g, "\\$&")}"`).join(",")}}`;

function splitTopLevel(str) {
  const parts = [];
  let depth = 0, quoted = false, current = "";
  for (const c of str) {
    if (c === '"') quoted = !quoted;
    if (!quoted && c === "(") depth++;
    if (!quoted && c === ")") depth--;
    if (!quoted && depth === 0 && c === ",") { parts.push(current); current = ""; } else current += c;
  }
  if (current) parts.push(current);
  return parts;
}

function condition(col, expr, params, alias) {
  const m = expr.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/s);
  if (!m) throw httpError(400, "PGRST100", `Filtre non géré : ${col}=${expr}`);
  const [, not, op, raw] = m;
  const c = `${alias}.${q(col)}`;
  let sql;
  if (op === "is") sql = `${c} is ${raw === "null" ? "null" : raw === "true" ? "true" : "false"}`;
  else if (op === "in") {
    params.push(pgArray(splitTopLevel(raw.replace(/^\(|\)$/g, "")).map(unquote)));
    sql = `${c}::text = any($${params.length}::text[])`;
  } else {
    params.push(unquote(raw));
    sql = `${c} ${{ eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op]} $${params.length}`;
  }
  return not ? `not (${sql})` : sql;
}

function whereClause(searchParams, params, alias) {
  const conds = [];
  for (const [key, value] of searchParams) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key)) continue;
    if (key === "or") {
      const parts = splitTopLevel(value.replace(/^\(|\)$/g, "")).map((p) => {
        const dot = p.indexOf(".");
        return condition(p.slice(0, dot), p.slice(dot + 1), params, alias);
      });
      conds.push(`(${parts.join(" or ")})`);
    } else {
      conds.push(condition(key, value, params, alias));
    }
  }
  return conds.length ? `where ${conds.join(" and ")}` : "";
}

function orderClause(order, alias) {
  if (!order) return "";
  return `order by ${order.split(",").map((part) => {
    const [col, ...mods] = part.split(".");
    const dir = mods.includes("desc") ? "desc" : "asc";
    const nulls = mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "";
    return `${alias}.${q(col)} ${dir}${nulls}`;
  }).join(", ")}`;
}

async function restRequest(method, table, url, body, user, headers) {
  q(table);
  const sp = url.searchParams;
  const params = [];
  let sql;
  if (method === "GET" || method === "HEAD") {
    const limit = sp.get("limit") ? `limit ${Number(sp.get("limit"))}` : "";
    const offset = sp.get("offset") ? `offset ${Number(sp.get("offset"))}` : "";
    sql = `select coalesce(json_agg(r), '[]'::json) as data from (
      select ${selectColumns(table, parseSelect(sp.get("select")), "t0", 0)} from public.${q(table)} t0
      ${whereClause(sp, params, "t0")} ${orderClause(sp.get("order"), "t0")} ${limit} ${offset}) r`;
  } else if (method === "POST") {
    const rows = Array.isArray(body) ? body : [body];
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].map(q);
    params.push(JSON.stringify(rows));
    sql = `with w as (insert into public.${q(table)} (${cols.join(", ")})
      select ${cols.join(", ")} from json_populate_recordset(null::public.${q(table)}, $1::json) returning *)
      select coalesce(json_agg(w), '[]'::json) as data from w`;
  } else if (method === "PATCH") {
    const cols = Object.keys(body ?? {}).map(q);
    params.push(JSON.stringify(body));
    sql = `with w as (update public.${q(table)} t0 set ${cols.map((c) => `${c} = r.${c}`).join(", ")}
      from (select * from json_populate_record(null::public.${q(table)}, $1::json)) r
      ${whereClause(sp, params, "t0")} returning t0.*)
      select coalesce(json_agg(w), '[]'::json) as data from w`;
  } else if (method === "DELETE") {
    sql = `with w as (delete from public.${q(table)} t0 ${whereClause(sp, params, "t0")} returning t0.*)
      select coalesce(json_agg(w), '[]'::json) as data from w`;
  } else {
    throw httpError(405, "PGRST000", "Méthode non gérée");
  }
  const data = await asUser(user, async (tx) => (await tx.query(sql, params)).rows[0].data);
  if (method !== "GET" && !(headers.prefer ?? "").includes("return=representation")) return { status: 204 };
  if ((headers.accept ?? "").includes("vnd.pgrst.object")) {
    if (data.length !== 1) {
      throw httpError(406, "PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${data.length} rows`);
    }
    return { status: 200, json: data[0] };
  }
  return { status: method === "POST" ? 201 : 200, json: data };
}

const procCache = new Map();
async function rpcRequest(fn, body, user) {
  q(fn);
  if (!procCache.has(fn)) {
    const { rows } = await db.query(`
      select p.pronargs, p.proargnames, p.proretset, t.typname, t.typtype,
             array(select format_type(x, null) from unnest(p.proargtypes) x) as types
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
      where n.nspname = 'public' and p.proname = $1`, [fn]);
    if (!rows[0]) throw httpError(404, "PGRST202", `Fonction introuvable : ${fn}`);
    procCache.set(fn, rows[0]);
  }
  const proc = procCache.get(fn);
  const names = (proc.proargnames ?? []).slice(0, proc.pronargs);
  const args = names.filter((n) => body && n in body).map((n) => {
    const type = proc.types[names.indexOf(n)];
    return type === "json" || type === "jsonb"
      ? `${q(n)} => ($1::json -> '${n}')::${type}`
      : `${q(n)} => ($1::json ->> '${n}')::${type}`;
  });
  const call = `public.${q(fn)}(${args.join(", ")})`;
  const sql = proc.typname === "void"
    ? `select ${call}, null::json as data`
    : proc.proretset
      ? `select coalesce(json_agg(r), '[]'::json) as data from ${call} r`
      : `select to_json(${call}) as data`;
  const params = args.length ? [JSON.stringify(body ?? {})] : [];
  const data = await asUser(user, async (tx) => (await tx.query(sql, params)).rows[0].data);
  return { status: 200, json: data ?? null };
}

function pgError(error) {
  if (error.status) return error;
  const code = error.code ?? "XX000";
  const status = code === "42501" ? 403 : code.startsWith("23") ? 409 : code === "P0001" ? 400 : 400;
  return { status, body: { code, message: error.message, details: error.detail ?? null, hint: error.hint ?? null } };
}

// ----------------------------------------------------------------- temps réel
const sockets = new Set();
let refCounter = 0;

function filterMatches(filter, row) {
  if (!filter) return true;
  const m = filter.match(/^([a-z_]+)=eq\.(.*)$/);
  return m ? row && String(row[m[1]]) === m[2] : true;
}

async function dispatchChanges() {
  const { rows: changes } = await db.query("delete from demo.changes returning * ");
  changes.sort((a, b) => a.id - b.id);
  for (const change of changes) {
    for (const ws of sockets) {
      for (const [topic, channel] of ws.channels) {
        const ids = channel.bindings
          .filter((b) => b.table === change.tbl && (b.event === "*" || b.event === change.op)
            && filterMatches(b.filter, change.new_row ?? change.old_row))
          .map((b) => b.id);
        if (!ids.length) continue;
        if (change.op !== "DELETE") {
          const visible = await asUser(channel.user, async (tx) =>
            (await tx.query(`select 1 from public.${q(change.tbl)} where id::text = $1`, [String(change.new_row.id)])).rows.length > 0)
            .catch(() => false);
          if (!visible) continue;
        }
        ws.send(JSON.stringify([null, null, topic, "postgres_changes", {
          ids,
          data: {
            schema: "public", table: change.tbl, commit_timestamp: new Date(change.at).toISOString(), type: change.op,
            columns: [], record: change.new_row, old_record: change.old_row ?? undefined, errors: null,
          },
        }]));
      }
    }
  }
}

function onSocket(ws) {
  ws.channels = new Map();
  sockets.add(ws);
  ws.on("close", () => sockets.delete(ws));
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    const [joinRef, ref, topic, event, payload] = msg;
    const reply = (response = {}, status = "ok") => ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status, response }]));
    if (topic === "phoenix" && event === "heartbeat") return reply();
    if (event === "phx_join") {
      const bindings = (payload?.config?.postgres_changes ?? []).map((b) => ({ ...b, id: ++refCounter }));
      ws.channels.set(topic, { user: userFromToken(payload?.access_token ?? ""), bindings });
      return reply({ postgres_changes: bindings.map(({ id, event: e, schema, table, filter }) => ({ id, event: e, schema, table, filter })) });
    }
    if (event === "access_token") {
      const channel = ws.channels.get(topic);
      if (channel) channel.user = userFromToken(payload?.access_token ?? "") ?? channel.user;
      return;
    }
    if (event === "phx_leave") {
      ws.channels.delete(topic);
      return reply();
    }
  });
}

// ----------------------------------------------------------------- stockage des photos
const files = new Map();

// ----------------------------------------------------------------- serveur HTTP
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function handle(req, url, user) {
  const path = url.pathname;
  const raw = await readBody(req);
  const isJson = (req.headers["content-type"] ?? "").includes("json");
  const body = isJson && raw.length ? JSON.parse(raw.toString()) : null;

  // ---- Auth
  if (path === "/auth/v1/signup" && req.method === "POST") {
    if (!body?.email) return { status: 200, json: session(await createAuthUser(null, null), "anonymous") };
    const email = String(body.email).trim().toLowerCase();
    if ([...users.values()].some((u) => u.email === email)) {
      return { status: 422, json: { code: "user_already_exists", error_code: "user_already_exists", msg: "User already registered" } };
    }
    return { status: 200, json: session(await createAuthUser(email, String(body.password ?? "")), "password") };
  }
  // Connexion par code reçu par email (Email OTP) : envoi du code…
  if (path === "/auth/v1/otp" && req.method === "POST") {
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { status: 400, json: { code: "validation_failed", error_code: "validation_failed", msg: "Unable to validate email address: invalid format" } };
    }
    const exists = [...users.values()].some((u) => u.email === email);
    if (!exists && body?.create_user === false) {
      return { status: 422, json: { code: "otp_disabled", error_code: "otp_disabled", msg: "Signups not allowed for otp" } };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    otpCodes.set(email, { code, expires: Date.now() + 10 * 60_000 });
    console.log(`[démo] code de connexion pour ${email} : ${code}`);
    return { status: 200, json: {} };
  }
  // … puis vérification (crée le compte au premier code, email confirmé)
  if (path === "/auth/v1/verify" && req.method === "POST") {
    const email = String(body?.email ?? "").trim().toLowerCase();
    const entry = otpCodes.get(email);
    if (!entry || entry.expires < Date.now() || entry.code !== String(body?.token ?? "")) {
      return { status: 403, json: { code: "otp_expired", error_code: "otp_expired", msg: "Token has expired or is invalid" } };
    }
    otpCodes.delete(email);
    const u = [...users.values()].find((x) => x.email === email) ?? await createAuthUser(email, null, "email");
    return { status: 200, json: session(u, "otp") };
  }
  // Démo uniquement : dernier code envoyé à une adresse (aucun vrai email n'est envoyé)
  if (path === "/demo/otp" && req.method === "GET") {
    const entry = otpCodes.get(String(url.searchParams.get("email") ?? "").trim().toLowerCase());
    return { status: 200, json: { code: entry && entry.expires > Date.now() ? entry.code : null } };
  }
  // Connexion Google (simulée) : le navigateur est redirigé ici en navigation
  // complète par signInWithOAuth, comme vers le vrai /authorize de Supabase.
  if (path === "/auth/v1/authorize" && req.method === "GET") {
    const redirectTo = url.searchParams.get("redirect_to") || API_URL;
    const u = await getOrCreateDemoGoogleUser();
    const code = crypto.randomUUID();
    pkceCodes.set(code, u.id);
    const target = new URL(redirectTo);
    target.searchParams.set("code", code);
    return { status: 302, location: target.toString() };
  }
  if (path === "/auth/v1/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "refresh_token") {
      const [, id, method = "password"] = String(body?.refresh_token ?? "").match(/^rt_([^_]+)_?(\w*)$/) ?? [];
      const u = id ? users.get(id) : undefined;
      if (!u) return { status: 400, json: { error: "invalid_grant", error_description: "Invalid Refresh Token", msg: "Invalid Refresh Token" } };
      return { status: 200, json: session(u, method || "password") };
    }
    if (grant === "pkce") {
      const userId = pkceCodes.get(String(body?.auth_code ?? ""));
      pkceCodes.delete(String(body?.auth_code ?? ""));
      const u = userId && users.get(userId);
      if (!u) return { status: 400, json: { error: "invalid_grant", error_description: "invalid flow state, no valid flow state found", msg: "invalid flow state, no valid flow state found" } };
      return { status: 200, json: session(u, "oauth") };
    }
    const u = [...users.values()].find((x) => x.email && x.email === String(body?.email ?? "").toLowerCase());
    if (!u || u.password == null || u.password !== body?.password) {
      return { status: 400, json: { code: "invalid_credentials", error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" } };
    }
    return { status: 200, json: session(u, "password") };
  }
  if (path === "/auth/v1/user") {
    return user ? { status: 200, json: authUserJson(user) } : { status: 401, json: { msg: "Invalid JWT", code: "bad_jwt" } };
  }
  if (path === "/auth/v1/logout") return { status: 204 };

  // ---- REST / RPC
  if (path.startsWith("/rest/v1/rpc/")) return rpcRequest(path.slice("/rest/v1/rpc/".length), body, user);
  if (path.startsWith("/rest/v1/")) return restRequest(req.method, path.slice("/rest/v1/".length), url, body, user, req.headers);

  // ---- Storage (bucket product-images)
  const pub = path.match(/^\/storage\/v1\/object\/public\/product-images\/(.+)$/);
  if (pub) {
    const file = files.get(pub[1]);
    return file ? { status: 200, raw: file.data, type: file.type } : { status: 404, json: { message: "Not found" } };
  }
  const upload = path.match(/^\/storage\/v1\/object\/product-images\/(.+)$/);
  if (upload && req.method === "POST") {
    const isAdmin = await asUser(user, async (tx) => (await tx.query("select private.is_admin() as ok")).rows[0].ok);
    if (!isAdmin) throw httpError(403, "42501", "new row violates row-level security policy");
    let data = raw;
    let type = req.headers["content-type"] ?? "application/octet-stream";
    if (type.includes("multipart/form-data")) {
      const form = await new Request("http://x", { method: "POST", headers: { "content-type": type }, body: raw }).formData();
      const file = [...form.values()].find((v) => typeof v !== "string");
      data = Buffer.from(await file.arrayBuffer());
      type = file.type || "image/webp";
    }
    files.set(upload[1], { data, type });
    return { status: 200, json: { Key: `product-images/${upload[1]}`, Id: upload[1] } };
  }

  // ---- Edge Function manage-drivers (même contrôles que la vraie fonction)
  if (path === "/functions/v1/manage-drivers" && req.method === "POST") {
    if (!user) return { status: 401, json: { error: "Session invalide : reconnectez-vous." } };
    const isAdmin = await asUser(user, async (tx) => (await tx.query("select private.is_admin() as ok")).rows[0].ok);
    if (!isAdmin) return { status: 403, json: { error: "Action réservée aux administrateurs." } };
    if (body?.action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if ([...users.values()].some((u) => u.email === email)) return { status: 400, json: { error: "Un compte existe déjà avec cet email." } };
      if (String(body.password ?? "").length < 8) return { status: 400, json: { error: "Mot de passe : 8 caractères minimum." } };
      const u = await createAuthUser(email, String(body.password));
      const { rows } = await db.query("select private.make_driver($1, $2, $3, $4) as id", [u.id, body.name, body.phone, email]);
      return { status: 200, json: { driver_id: rows[0].id } };
    }
    if (body?.action === "set-password") {
      const { rows } = await db.query("select p.user_id from drivers d join profiles p on p.id = d.profile_id where d.id = $1", [body.driver_id]);
      const u = users.get(rows[0]?.user_id);
      if (!u) return { status: 404, json: { error: "Livreur introuvable." } };
      u.password = String(body.password);
      return { status: 200, json: { ok: true } };
    }
    return { status: 400, json: { error: "Action inconnue." } };
  }
  if (path.startsWith("/functions/v1/")) return { status: 404, json: { error: "Fonction non disponible en démo." } };
  return { status: 404, json: { message: `Route non gérée en démo : ${path}` } };
}

const server = createServer(async (req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": req.headers.origin ?? "*",
    "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Expose-Headers": "Content-Range, X-Total-Count",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }
  const url = new URL(req.url, API_URL);
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const user = userFromToken(auth);
  let result;
  try {
    result = await handle(req, url, user);
  } catch (error) {
    const e = pgError(error);
    result = { status: e.status, json: e.body };
    if (e.status >= 500 || e.body.code === "PGRST100" || e.body.code === "PGRST200") console.error("[démo] erreur", req.method, req.url, e.body.message);
  }
  if (req.method !== "GET") dispatchChanges().catch((e) => console.error("[démo] temps réel", e.message));
  if (result.location) {
    res.writeHead(result.status, { ...cors, Location: result.location });
    return res.end();
  }
  if (result.raw) {
    res.writeHead(result.status, { ...cors, "Content-Type": result.type, "Cache-Control": "max-age=3600" });
    return res.end(result.raw);
  }
  if (result.json === undefined) {
    res.writeHead(result.status, cors);
    return res.end();
  }
  res.writeHead(result.status, { ...cors, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(result.json));
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/realtime/v1/websocket")) return socket.destroy();
  wss.handleUpgrade(req, socket, head, onSocket);
});
await new Promise((resolve) => server.listen(API_PORT, resolve));

// ----------------------------------------------------------------- les 3 applications
const vite = join(ROOT, "node_modules/vite/bin/vite.js");
const apps = [["client", 5173], ["admin", 5174], ["livreur", 5175]];
for (const [app, port] of apps) {
  const child = spawn(process.execPath, [vite, "--port", String(port), "--strictPort"], {
    cwd: join(ROOT, "apps", app),
    env: { ...process.env, VITE_SUPABASE_URL: API_URL, VITE_SUPABASE_ANON_KEY: PUBLIC_KEY, VITE_SUPABASE_PUBLISHABLE_KEY: "" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  process.on("exit", () => child.kill());
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
// Démo : une erreur imprévue est affichée sans arrêter le serveur
process.on("uncaughtException", (e) => console.error("[démo] erreur inattendue :", e));
process.on("unhandledRejection", (e) => console.error("[démo] promesse rejetée :", e));

console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  HOUCINE CHAPATI — mode démo local (données en mémoire)     │
  ├─────────────────────────────────────────────────────────────┤
  │  Client         http://localhost:5173                       │
  │  Administration http://localhost:5174   admin@demo.dz       │
  │  Livreur        http://localhost:5175   karim@demo.dz       │
  │                 (mot de passe des comptes : ${PASSWORD})        │
  │  Arrêt : Ctrl+C                                             │
  └─────────────────────────────────────────────────────────────┘`);
if (LAN_IP) {
  console.log(`
  Depuis un téléphone sur le même Wi-Fi :
    Client         http://${LAN_IP}:5173
    Administration http://${LAN_IP}:5174
    Livreur        http://${LAN_IP}:5175
  (la géolocalisation du navigateur exige le https ou "localhost" : elle ne
   fonctionnera pas via cette adresse réseau — utilisez les coordonnées GPS
   collées à la main si besoin)`);
} else {
  log("Aucune adresse réseau détectée : les apps restent accessibles uniquement depuis ce PC (localhost).");
}
log(`API Supabase simulée sur ${API_URL}`);
