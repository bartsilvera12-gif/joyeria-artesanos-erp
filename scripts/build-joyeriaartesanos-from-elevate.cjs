/**
 * Genera supabase/migrations/20260619120000_joyeriaartesanos_schema.sql
 * concatenando TODAS las migraciones de la repo en orden cronológico y
 * reescribiendo los esquemas `public` / `zentra_erp` / `elevate` ->
 * `joyeriaartesanos`. Resultado: un único schema autocontenido con el ERP
 * base + el overlay Elevate.
 *
 * Schemas que NO se tocan: auth, extensions, storage, graphql, pg_catalog,
 * information_schema, realtime.
 *
 * También quita lo que expone el schema vía PostgREST (GRANT/REVOKE/ALTER
 * DEFAULT PRIVILEGES dirigidos a anon|authenticated, NOTIFY pgrst).
 *
 * Uso:
 *   node scripts/build-joyeriaartesanos-from-elevate.cjs            # genera
 *   node scripts/build-joyeriaartesanos-from-elevate.cjs --apply    # + aplica
 *
 * Aplicar requiere SUPABASE_DB_URL en .env.local.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const OUTPUT_FILE = path.join(
  MIGRATIONS_DIR,
  "20260619120000_joyeriaartesanos_schema.sql",
);
const OUTPUT_BASENAME = path.basename(OUTPUT_FILE);

const TARGET = "joyeriaartesanos";
const SOURCE_SCHEMAS = ["public", "zentra_erp", "elevate"];

// UUID fijo del tenant único — distinto del de Elevate (...e1e7).
const ELEVATE_UUID = "00000000-0000-0000-0000-00000000e1e7";
const JOYERIA_UUID = "00000000-0000-0000-0000-0000000a17e5";

// Migraciones a saltear: el archivo generado por este script no debe incluirse
// a sí mismo, y los archivos que solo definen objetos en `auth` o duplican
// algo del overlay también.
const SKIP = new Set([OUTPUT_BASENAME]);

// Patrones de migraciones a omitir por ser específicas de multi-tenant o
// arreglos a otros schemas (triple7, erp_*) que no existen en una instancia
// monocliente. La gran mayoría son no-ops en este contexto pero suman ruido.
const SKIP_PATTERNS = [
  /fix_tenant_/i,
  /fix_all_tenant_/i,
  /fix_erp_prefixed_tenant_/i,
  /fix_triple7_/i,
  /fix_zentra_chat_/i,
  /provision_fix_/i,
  /provision_run_/i,
  /zentra_erp_full_tenant_clone/i,
  /zentra_erp_mirror_/i,
  /empresas_drop_tenant_after_delete/i,
  /empresa_data_schema_omnicanal_provision/i,
  /cliente_tipos_servicio_reseed_erp_tenants/i,
  /ensure_data_schema_fix_public_fks/i,
  /repair_remote_supabase/i,
];

function transformSql(sql) {
  let out = sql;
  out = out.split(ELEVATE_UUID).join(JOYERIA_UUID);
  out = rewriteSchemaReferences(out);
  out = rewriteBrand(out);
  out = stripExposure(out);
  out = compactSql(out);
  return out;
}

// Quita comentarios de línea completa y colapsa líneas en blanco para que el
// archivo final sea más liviano. Conserva `COMMENT ON ...` statements (no son
// comentarios, son SQL) y comentarios en cola de línea con código.
function compactSql(sql) {
  const lines = sql.replace(/\r\n?/g, "\n").split("\n");
  const kept = lines.filter((l) => !/^\s*--/.test(l));
  // Colapsa 2+ líneas vacías a 1
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Reescribe referencias a los esquemas fuente -> TARGET sin tocar `auth.*`,
// `extensions.*`, etc., ni los roles literales `PUBLIC` de GRANT/REVOKE.
function rewriteSchemaReferences(sql) {
  let out = sql;
  for (const src of SOURCE_SCHEMAS) {
    const reDot = new RegExp(`\\b${src}\\.`, "g");
    out = out.replace(reDot, `${TARGET}.`);

    const reQuotedDot = new RegExp(`"${src}"\\.`, "g");
    out = out.replace(reQuotedDot, `"${TARGET}".`);

    const reString = new RegExp(`'${src}'`, "g");
    out = out.replace(reString, `'${TARGET}'`);

    const reSchemaKeyword = new RegExp(
      `\\b(CREATE|DROP|ALTER)\\s+SCHEMA(\\s+IF\\s+(NOT\\s+)?EXISTS)?\\s+${src}\\b`,
      "gi",
    );
    out = out.replace(reSchemaKeyword, (_m, verb, ifEx) => {
      return `${verb} SCHEMA${ifEx || ""} ${TARGET}`;
    });

    const reSearchPathEq = new RegExp(
      `(search_path\\s*=\\s*)${src}\\b`,
      "gi",
    );
    out = out.replace(reSearchPathEq, `$1${TARGET}`);

    const reSearchPathTo = new RegExp(
      `(search_path\\s+TO\\s+)${src}\\b`,
      "gi",
    );
    out = out.replace(reSearchPathTo, `$1${TARGET}`);

    const reNspname = new RegExp(`(nspname\\s*=\\s*)'${src}'`, "gi");
    out = out.replace(reNspname, `$1'${TARGET}'`);
  }
  return out;
}

function rewriteBrand(sql) {
  return sql
    .replace(/ELEVATE/g, "JOYERIAARTESANOS")
    .replace(/Elevate/g, "JoyeriaArtesanos");
}

function stripExposure(sql) {
  // Normaliza CRLF -> LF para que los anchors $ se comporten igual.
  const lines = sql.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let dollarDepth = 0;
  let buffering = false;
  let buf = [];

  const flushBuffer = () => {
    const stmt = buf.join("\n");
    const exposes =
      /\b(anon|authenticated)\b/.test(stmt) ||
      /\bNOTIFY\s+pgrst\b/i.test(stmt);
    if (!exposes) out.push(stmt);
    buf = [];
    buffering = false;
  };

  for (const line of lines) {
    const codeOnly = line.replace(/--.*$/, "");
    const dollarCount = (codeOnly.match(/\$\$/g) || []).length;

    if (dollarDepth % 2 === 1) {
      out.push(line);
      dollarDepth += dollarCount;
      continue;
    }

    if (!buffering) {
      if (
        /^[ \t]*(GRANT|REVOKE|NOTIFY|ALTER\s+DEFAULT\s+PRIVILEGES)\b/i.test(line)
      ) {
        buffering = true;
        buf.push(line);
        if (/;\s*(--.*)?$/.test(line)) flushBuffer();
        dollarDepth += dollarCount;
        continue;
      }
      out.push(line);
      dollarDepth += dollarCount;
      continue;
    }

    buf.push(line);
    dollarDepth += dollarCount;
    if (/;\s*(--.*)?$/.test(line)) flushBuffer();
  }
  if (buffering) flushBuffer();
  return out.join("\n");
}

function buildHeader(files) {
  return `-- =============================================================================
-- Schema \`${TARGET}\` — ERP autocontenido (base + overlay Elevate).
-- Generado por scripts/build-joyeriaartesanos-from-elevate.cjs concatenando
-- ${files.length} migraciones cronológicamente y reescribiendo los schemas
-- public / zentra_erp / elevate -> ${TARGET}. NO EDITAR A MANO.
--
-- Exposición a PostgREST (GRANT a anon/authenticated, NOTIFY pgrst) NO
-- incluida: se aplica aparte.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS ${TARGET};

-- Extensiones requeridas por algunas migraciones (índices GIN trigram, etc.).
-- En Supabase viven en el schema \`extensions\`; lo incluimos en el search_path
-- para que operadores como gin_trgm_ops sean visibles desde DO blocks.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
SET search_path = ${TARGET}, extensions, public, pg_catalog;

GRANT USAGE ON SCHEMA ${TARGET} TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${TARGET}
  GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${TARGET}
  GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${TARGET}
  GRANT ALL ON FUNCTIONS TO postgres, service_role;
COMMENT ON SCHEMA ${TARGET} IS 'ERP Joyería Artesanos — réplica autocontenida de Elevate';

`;
}

// Migraciones a forzar a una posición específica para resolver dependencias
// que el orden cronológico crudo no respeta. Cada entrada mueve el archivo
// indicado a la posición INMEDIATAMENTE DESPUÉS del "after" dado.
//   - elevate_catalog_bootstrap: crea schema + tablas base (empresas, usuarios,
//     clientes, modulos, ...) que migraciones tempranas dan por existentes.
//   - 20250309000001_pagos_trazabilidad: ALTERa public.pagos, pero pagos
//     recién se crea en 20250312000009_suscripciones_facturas_pagos.
const REORDER = [
  { file: "20260700990000_elevate_catalog_bootstrap.sql", first: true },
  {
    file: "20250309000001_pagos_trazabilidad.sql",
    after: "20250312000009_suscripciones_facturas_pagos.sql",
  },
];

function applyReorder(files) {
  let arr = [...files];
  for (const r of REORDER) {
    const idx = arr.indexOf(r.file);
    if (idx === -1) continue;
    arr.splice(idx, 1);
    if (r.first) {
      arr.unshift(r.file);
    } else if (r.after) {
      const target = arr.indexOf(r.after);
      if (target === -1) arr.push(r.file);
      else arr.splice(target + 1, 0, r.file);
    }
  }
  return arr;
}

function main() {
  let files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /\.sql$/i.test(f))
    .filter((f) => !SKIP.has(f))
    .filter((f) => !SKIP_PATTERNS.some((re) => re.test(f)))
    .sort();

  files = applyReorder(files);

  if (files.length === 0) {
    console.error("No se encontraron migraciones");
    process.exit(1);
  }

  const sections = files.map((f) => {
    const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    return `-- @${f}\n` + transformSql(raw);
  });

  const combined = buildHeader(files) + sections.join("\n");
  fs.writeFileSync(OUTPUT_FILE, combined, "utf8");
  console.log(
    `Generado: ${path.relative(ROOT, OUTPUT_FILE)} (${files.length} migraciones, ${combined.length.toLocaleString()} bytes)`,
  );

  if (process.argv.includes("--apply")) {
    return applyToDatabase(combined);
  }
}

async function applyToDatabase(sql) {
  require("dotenv").config({ path: path.join(ROOT, ".env.local") });
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    console.error("Falta SUPABASE_DB_URL en .env.local — no se aplica");
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
    const { rows: schemaRows } = await c.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
      [TARGET],
    );
    if (schemaRows.length === 0) {
      throw new Error("El schema no aparece después de aplicar el SQL");
    }
    const { rows: tableRows } = await c.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1",
      [TARGET],
    );
    console.log(`Aplicado OK — schema '${TARGET}' con ${tableRows[0].n} tablas.`);
  } finally {
    await c.end();
  }
}

Promise.resolve()
  .then(main)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
