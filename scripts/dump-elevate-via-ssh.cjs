/**
 * SSH al VPS, corre `pg_dump --schema=elevate` dentro del contenedor
 * supabase-db, y guarda el dump crudo en supabase/migrations/_elevate.dump.sql
 * (no se commitea; usado como input por build-joyeriaartesanos-from-dump.cjs).
 *
 * Credenciales se leen de variables de entorno (no se hardcodean):
 *   NEURA_SSH_HOST, NEURA_SSH_USER, NEURA_SSH_PASS,
 *   NEURA_DB_NAME (default postgres),
 *   NEURA_DB_USER (default postgres).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");

const HOST = process.env.NEURA_SSH_HOST;
const USER = process.env.NEURA_SSH_USER || "root";
const PASS = process.env.NEURA_SSH_PASS;
const DB = process.env.NEURA_DB_NAME || "postgres";
const DB_USER = process.env.NEURA_DB_USER || "postgres";
const CONTAINER = process.env.NEURA_DB_CONTAINER || "supabase-db";

if (!HOST || !PASS) {
  console.error(
    "Falta NEURA_SSH_HOST y/o NEURA_SSH_PASS en el entorno. No se ejecuta.",
  );
  process.exit(2);
}

const OUT = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "_elevate.dump.sql",
);

const CMD = `docker exec ${CONTAINER} pg_dump -U ${DB_USER} -d ${DB} --schema-only --schema=elevate --no-owner --no-privileges --no-comments`;

const c = new Client();
c.on("ready", () => {
  c.exec(CMD, (err, stream) => {
    if (err) {
      console.error("EXEC ERR:", err.message);
      c.end();
      process.exit(1);
    }
    const chunks = [];
    let stderr = "";
    stream
      .on("data", (d) => chunks.push(d))
      .stderr.on("data", (d) => (stderr += d.toString()));
    stream.on("close", (code) => {
      const out = Buffer.concat(chunks).toString("utf8");
      if (code !== 0) {
        console.error("pg_dump exit", code, "\nstderr:", stderr);
        c.end();
        process.exit(1);
      }
      fs.writeFileSync(OUT, out, "utf8");
      console.log(
        `Dump OK: ${path.relative(process.cwd(), OUT)} (${out.length.toLocaleString()} bytes)`,
      );
      c.end();
    });
  });
})
  .on("error", (e) => {
    console.error("SSH ERR:", e.message);
    process.exit(1);
  })
  .connect({
    host: HOST,
    port: 22,
    username: USER,
    password: PASS,
    readyTimeout: 30000,
  });
