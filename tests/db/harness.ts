import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

export type Db = PGlite;
export type Tx = Transaction;

/** Base neuve : stub Supabase + toutes les migrations + seed. */
export async function createDb(): Promise<Db> {
  const db = await PGlite.create();
  await db.exec(read("tests/db/supabase-stub.sql"));
  const migrations = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    try {
      await db.exec(read(`supabase/migrations/${file}`));
    } catch (error) {
      throw new Error(`Migration ${file} : ${(error as Error).message}`);
    }
  }
  await db.exec(read("supabase/seed.sql"));
  return db;
}

/** Crée un compte Auth (le trigger crée le profil CUSTOMER). */
export async function createUser(db: Db, email: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email, is_anonymous) values ($1, $2) returning id",
    [email, email === null],
  );
  return rows[0]!.id;
}

/** Exécute fn avec les droits d'un utilisateur (JWT simulé), comme via l'API. */
export async function as<T>(
  db: Db, userId: string | null, fn: (tx: Tx) => Promise<T>, provider: "email" | "google" | "anonymous" = "email",
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId
        ? { sub: userId, role: "authenticated", is_anonymous: provider === "anonymous", app_metadata: { provider, providers: [provider] } }
        : { role: "anon" }),
    ]);
    return fn(tx);
  });
}

/** Message d'erreur Postgres d'un appel (ou "OK" s'il réussit). */
export async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as Error).message;
  }
}
