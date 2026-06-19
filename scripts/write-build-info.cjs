#!/usr/bin/env node
/**
 * Escribe build-info.json con el commit y la fecha de build.
 * Corre como prebuild script. Hostinger lo ejecuta automáticamente
 * al hacer `npm run build` porque npm corre `prebuild` antes de `build`.
 *
 * Si no hay .git disponible, escribe "unknown".
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
} catch {
  // git no disponible (env build sin .git): mantener "unknown"
}

const info = {
  commit,
  short: commit.slice(0, 7),
  builtAt: new Date().toISOString(),
};

const out = path.join(process.cwd(), "build-info.json");
fs.writeFileSync(out, JSON.stringify(info, null, 2));
console.log("[write-build-info]", info);
