import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { listCategoriasProductoPostgrest } from "@/lib/inventario/server/catalogos-postgrest";
import { getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const empresaId = ctx.auth.empresa_id;
  const jwt = await getAccessTokenForRequest(request);

  try {
    const rows = await listCategoriasProductoPostgrest(jwt, empresaId, { soloActivas: false });
    const byId = new Map(rows.map((r) => [r.id, r.nombre]));
    const buf = buildXlsxBuffer(rows, [
      { header: "NOMBRE", value: (r) => r.nombre, width: 28 },
      { header: "CODIGO", value: (r) => r.codigo ?? "", width: 14 },
      { header: "DESCRIPCION", value: (r) => r.descripcion ?? "", width: 32 },
      { header: "CATEGORIA_PADRE", value: (r) => r.parent_id ? (byId.get(r.parent_id) ?? "") : "", width: 24 },
      { header: "ACTIVO", value: (r) => r.activo ? "SI" : "NO", width: 8 },
    ], { sheetName: "Categorias" });

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`categorias-productos-${nowStamp()}`),
    });
  } catch (err) {
    console.error("[/api/inventario/categorias/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
