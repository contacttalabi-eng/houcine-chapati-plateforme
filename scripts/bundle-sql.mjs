// Regroupe migrations + seed dans un seul fichier à coller dans
// Supabase → SQL Editor (pour installer la base sans la CLI Supabase).
//   npm run db:bundle  →  supabase/dist/setup.sql
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "supabase");
const migrations = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();

const parts = [
  "-- Houcine Chapati — installation complète de la base (généré par npm run db:bundle)",
  "-- À exécuter UNE FOIS sur un projet Supabase neuf : SQL Editor → New query → coller → Run.",
  "",
  ...migrations.map((f) => `-- ===== migrations/${f}\n${readFileSync(join(root, "migrations", f), "utf8")}`),
  `-- ===== seed.sql\n${readFileSync(join(root, "seed.sql"), "utf8")}`,
];

mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", "setup.sql");
writeFileSync(out, parts.join("\n"));
console.log(`✓ ${migrations.length} migrations + seed → ${out}`);
