/**
 * Lee supabase/migrations/_elevate.dump.sql (pg_dump del schema elevate de
 * producción) y produce supabase/migrations/20260619120000_joyeriaartesanos_schema.sql
 * reescrito a `joyeriaartesanos`, sin exposición a PostgREST.
 *
 * Uso:
 *   node scripts/build-joyeriaartesanos-from-dump.cjs            # genera
 *   node scripts/build-joyeriaartesanos-from-dump.cjs --apply    # + aplica
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const IN_FILE = path.join(ROOT, "supabase", "migrations", "_elevate.dump.sql");
const OUT_FILE = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260619120000_joyeriaartesanos_schema.sql",
);

const SOURCE = "elevate";
const TARGET = "joyeriaartesanos";
const ELEVATE_UUID = "00000000-0000-0000-0000-00000000e1e7";
const JOYERIA_UUID = "00000000-0000-0000-0000-0000000a17e5";

function transform(sql) {
  let out = sql;

  // Reescrituras del schema elevate -> joyeriaartesanos.
  out = out.replace(new RegExp(`\\b${SOURCE}\\.`, "g"), `${TARGET}.`);
  out = out.replace(new RegExp(`"${SOURCE}"\\.`, "g"), `"${TARGET}".`);
  out = out.replace(new RegExp(`'${SOURCE}'`, "g"), `'${TARGET}'`);
  out = out.replace(
    new RegExp(
      `\\b(CREATE|DROP|ALTER)\\s+SCHEMA(\\s+IF\\s+(NOT\\s+)?EXISTS)?\\s+${SOURCE}\\b`,
      "gi",
    ),
    (_m, verb, ifEx) => `${verb} SCHEMA${ifEx || ""} ${TARGET}`,
  );
  out = out.replace(
    new RegExp(`(search_path\\s*=\\s*)${SOURCE}\\b`, "gi"),
    `$1${TARGET}`,
  );
  out = out.replace(
    new RegExp(`(search_path\\s+TO\\s+)${SOURCE}\\b`, "gi"),
    `$1${TARGET}`,
  );
  out = out.replace(
    new RegExp(`(nspname\\s*=\\s*)'${SOURCE}'`, "gi"),
    `$1'${TARGET}'`,
  );

  // Branding (en mensajes RAISE, comentarios, etc.)
  out = out.replace(/ELEVATE/g, "JOYERIAARTESANOS");
  out = out.replace(/Elevate/g, "JoyeriaArtesanos");

  // UUID fijo de la empresa única.
  out = out.split(ELEVATE_UUID).join(JOYERIA_UUID);

  // CREATE SCHEMA TARGET -> idempotente.
  out = out.replace(
    new RegExp(`CREATE SCHEMA ${TARGET};`, "g"),
    `CREATE SCHEMA IF NOT EXISTS ${TARGET};`,
  );

  // pg_trgm vive en el schema \`extensions\` en una instalación estándar de
  // Supabase. En esta DB la fuente lo tiene en \`elevate\` y por eso el dump
  // referencia \`elevate.gin_trgm_ops\` (que tras el rename quedaría como
  // \`joyeriaartesanos.gin_trgm_ops\`, inexistente). Reapuntamos esos refs a
  // \`extensions.gin_trgm_ops\` y el setup de la extensión se hace en el
  // header del archivo final (ver buildHeader).
  out = out.replace(
    /\bjoyeriaartesanos\.(gin_trgm_ops|gist_trgm_ops|similarity|show_trgm|set_limit|show_limit|word_similarity|strict_word_similarity)\b/g,
    "extensions.$1",
  );

  out = stripExposure(out);
  return out;
}

// Quita statements que exponen el schema a PostgREST: GRANT/REVOKE/ALTER
// DEFAULT PRIVILEGES dirigidos a anon|authenticated, y NOTIFY pgrst.
// NO toca CREATE POLICY (queda definido pero inerte hasta que se otorguen
// los grants aparte).
function stripExposure(sql) {
  const lines = sql.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let dollarDepth = 0;
  let buffering = false;
  let buf = [];

  const flush = () => {
    const stmt = buf.join("\n");
    const exposes =
      /\b(anon|authenticated)\b/.test(stmt) ||
      /\bNOTIFY\s+pgrst\b/i.test(stmt);
    if (!exposes) out.push(stmt);
    buf = [];
    buffering = false;
  };

  for (const line of lines) {
    const code = line.replace(/--.*$/, "");
    const dol = (code.match(/\$\$/g) || []).length;

    if (dollarDepth % 2 === 1) {
      out.push(line);
      dollarDepth += dol;
      continue;
    }

    if (!buffering) {
      if (
        /^[ \t]*(GRANT|REVOKE|NOTIFY|ALTER\s+DEFAULT\s+PRIVILEGES)\b/i.test(line)
      ) {
        buffering = true;
        buf.push(line);
        if (/;\s*(--.*)?$/.test(line)) flush();
        dollarDepth += dol;
        continue;
      }
      out.push(line);
      dollarDepth += dol;
      continue;
    }

    buf.push(line);
    dollarDepth += dol;
    if (/;\s*(--.*)?$/.test(line)) flush();
  }
  if (buffering) flush();
  return out.join("\n");
}

function main() {
  if (!fs.existsSync(IN_FILE)) {
    console.error(`No existe ${IN_FILE}. Corré primero dump-elevate-via-ssh.`);
    process.exit(2);
  }
  const raw = fs.readFileSync(IN_FILE, "utf8");
  const sql = transform(raw);
  const header = `-- =============================================================================
-- Schema \`${TARGET}\` — réplica del schema \`elevate\` de producción.
-- Generado por scripts/build-joyeriaartesanos-from-dump.cjs a partir de
-- supabase/migrations/_elevate.dump.sql (pg_dump --schema=elevate).
-- Exposición a PostgREST (GRANT/REVOKE/NOTIFY pgrst) NO incluida.
--
-- IMPORTANTE: este SQL hace DROP SCHEMA CASCADE primero. Si ya hay datos
-- en \`${TARGET}\` los vas a perder. Pensado para arrancar/recrear desde cero.
-- =============================================================================

DROP SCHEMA IF EXISTS ${TARGET} CASCADE;

-- Garantiza que pg_trgm esté en el schema \`extensions\` (estándar Supabase).
-- Si ya está ahí, no-op. Si está en otro schema (por ej. \`elevate\`), lo
-- mueve — Postgres actualiza automáticamente los índices que dependen del
-- operator class, así que esquemas existentes (incluido elevate) siguen
-- funcionando referenciando \`extensions.gin_trgm_ops\`.
DO $neura$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF v_schema IS NULL THEN
    CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
  ELSIF v_schema <> 'extensions' THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END
$neura$;

`;
  fs.writeFileSync(OUT_FILE, header + sql, "utf8");
  console.log(
    `Generado: ${path.relative(ROOT, OUT_FILE)} (${(header + sql).length.toLocaleString()} bytes)`,
  );

  if (process.argv.includes("--apply")) return apply(header + sql);
}

async function apply(sql) {
  require("dotenv").config({ path: path.join(ROOT, ".env.local") });
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    console.error("Falta SUPABASE_DB_URL en .env.local");
    process.exit(2);
  }
  const pg = require("pg");
  const c = new pg.Client({
    connectionString: url,
    ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  try {
    await c.query(sql);
    const { rows } = await c.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1",
      [TARGET],
    );
    console.log(`OK — schema '${TARGET}' con ${rows[0].n} tablas.`);
  } finally {
    await c.end();
  }
}

main();
