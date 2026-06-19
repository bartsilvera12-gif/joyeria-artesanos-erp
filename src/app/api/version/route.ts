import { NextResponse } from "next/server";

/**
 * GET /api/version
 *
 * Endpoint público de diagnóstico para confirmar qué commit está corriendo
 * en producción. Vercel expone VERCEL_GIT_COMMIT_SHA/MESSAGE/REF en runtime.
 * Útil para validar que un fix ya está deployado antes de hacer pruebas.
 */
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    commit_short: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "",
    deployed_at: process.env.VERCEL_DEPLOYMENT_ID
      ? new Date().toISOString()
      : "no_vercel",
  });
}
