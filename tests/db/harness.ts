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
    "insert into auth.users (email, is_anonymous, email_confirmed_at) values ($1, $2, case when $1::text is null then null else now() end) returning id",
    [email, email === null],
  );
  return rows[0]!.id;
}

/** Exécute fn avec les droits d'un utilisateur (JWT simulé), comme via l'API. */
/**
 * Mode de connexion simulé dans le jeton (claim « amr » de Supabase) :
 * password = mot de passe, otp/magiclink = anciens codes de connexion,
 * email_signup = code de confirmation d'inscription, recovery = code de
 * réinitialisation de mot de passe, google = OAuth Google.
 */
export type SignInMethod = "password" | "otp" | "magiclink" | "email_signup" | "recovery" | "google" | "anonymous";

const AMR_METHOD: Record<SignInMethod, string> = {
  password: "password", otp: "otp", magiclink: "magiclink", email_signup: "email/signup",
  recovery: "recovery", google: "oauth", anonymous: "anonymous",
};

export async function as<T>(
  db: Db, userId: string | null, fn: (tx: Tx) => Promise<T>, method: SignInMethod = "password",
): Promise<T> {
  const provider = method === "google" ? "google" : method === "anonymous" ? "anonymous" : "email";
  const amr = [{ method: AMR_METHOD[method], timestamp: Math.floor(Date.now() / 1000) }];
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId
        ? { sub: userId, role: "authenticated", is_anonymous: method === "anonymous", app_metadata: { provider, providers: [provider] }, amr }
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
