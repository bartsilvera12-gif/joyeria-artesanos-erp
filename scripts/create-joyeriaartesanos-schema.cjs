/**
 * Crea el schema `joyeriaartesanos` en la base de datos configurada en
 * SUPABASE_DB_URL (.env.local). Idempotente.
 *
 * Uso:  node scripts/create-joyeriaartesanos-schema.cjs
 */
const path = require("path");
const fs = require("fs");
const { config } = require("dotenv");
const pg = require("pg");

config({ path: path.resolve(process.cwd(), ".env.local") });

const url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  console.error("Falta SUPABASE_DB_URL en .env.local");
  process.exit(2);
}

const sqlFile = path.resolve(
  process.cwd(),
  "supabase/migrations/20260619120000_joyeriaartesanos_schema.sql",
);
const sql = fs.readFileSync(sqlFile, "utf8");

async function main() {
  const c = new pg.Client({
    connectionString: url,
    ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  try {
    await c.query(sql);
    const { rows } = await c.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
      ["joyeriaartesanos"],
    );
    if (rows.length === 0) {
      throw new Error("El schema no aparece después de aplicar la migración");
    }
    console.log("Schema 'joyeriaartesanos' listo.");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
