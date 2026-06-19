import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getAuthUserForApiRoute } from "@/lib/auth/get-auth-user-for-api-route";
import { NextResponse } from "next/server";

/**
 * GET /api/empresas/mis-dashboard-views
 *
 * Elevate es instancia monocliente (single_client). Todas las vistas
 * activas del catálogo son operativas para el único admin de la empresa.
 * No hay riesgo cross-tenant.
 *
 * Endpoint simplificado: si hay usuario autenticado, devolvemos las
 * vistas activas directamente del catálogo (`dashboard_views`). Sin
 * resolver de empresa_dashboard_views / usuario_dashboard_views — esos
 * paths fallaban silenciosamente en runtime Hostinger en algún edge
 * case (cache, RLS, env vars).
 *
 * Fallback final hardcodeado: si todo lo demás falla, devolver las 4
 * vistas estándar para que el dashboard sea navegable. Los slugs son
 * los que conoce el frontend (`isDashboardTabSlug`).
 */

type DashView = { id: string; nombre: string; slug: string; orden: number };

const HARDCODED_FALLBACK: DashView[] = [
  { id: "fb-comercial", nombre: "Comercial", slug: "comercial", orden: 10 },
  { id: "fb-financiero", nombre: "Financiero", slug: "financiero", orden: 20 },
  { id: "fb-inventario", nombre: "Inventario", slug: "inventario", orden: 30 },
  { id: "fb-ventas", nombre: "Ventas", slug: "ventas", orden: 40 },
];

export async function GET(request: Request) {
  try {
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supaUrl || !serviceKey) {
      // Sin envs no podemos consultar; devolvemos el fallback duro.
      return NextResponse.json({
        views: HARDCODED_FALLBACK,
        defaultSlug: HARDCODED_FALLBACK[0].slug,
        defaultViewId: HARDCODED_FALLBACK[0].id,
      });
    }

    const user = await getAuthUserForApiRoute(request);
    if (!user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    let views: DashView[] = [];
    try {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase
        .from("dashboard_views")
        .select("id, nombre, slug, orden")
        .eq("activo", true)
        .order("orden", { ascending: true });
      if (error) {
        console.error("[mis-dashboard-views] catalog query error", error.message);
      } else if (Array.isArray(data)) {
        views = data.map((m: { id?: unknown; nombre?: unknown; slug?: unknown; orden?: unknown }) => ({
          id: String(m.id ?? ""),
          nombre: String(m.nombre ?? ""),
          slug: String(m.slug ?? ""),
          orden: Number(m.orden) || 0,
        }));
      }
    } catch (e) {
      console.error("[mis-dashboard-views] catalog throw", e instanceof Error ? e.message : e);
    }

    // Si la DB no devolvió nada útil, fallback duro.
    if (views.length === 0) {
      console.warn("[mis-dashboard-views] DB vacía o error → fallback hardcoded");
      views = HARDCODED_FALLBACK;
    }

    return NextResponse.json({
      views,
      defaultSlug: views[0]?.slug ?? null,
      defaultViewId: views[0]?.id ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[mis-dashboard-views] outer", msg);
    // Incluso ante error inesperado, devolvemos fallback para no romper UI.
    return NextResponse.json({
      views: HARDCODED_FALLBACK,
      defaultSlug: HARDCODED_FALLBACK[0].slug,
      defaultViewId: HARDCODED_FALLBACK[0].id,
    });
  }
}
