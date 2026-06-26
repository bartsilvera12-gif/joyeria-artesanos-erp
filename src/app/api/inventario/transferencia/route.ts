import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * POST /api/inventario/transferencia
 *
 * Mueve `cantidad` unidades de `producto_id` desde `desde_sucursal_id`
 * hacia `hacia_sucursal_id`. Solo admin (los usuarios operativos sólo
 * ven su sucursal y no deberían mover stock fuera de ella).
 *
 * Atómico: BEGIN/COMMIT, valida stock origen antes de actualizar. El
 * trigger `sync_producto_stock_total` recalcula `productos.stock_actual`
 * al cierre.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });
  if (!isAdmin(auth)) {
    return NextResponse.json(
      errorResponse("Solo administradores pueden transferir stock entre sucursales."),
      { status: 403 },
    );
  }

  let body: { producto_id?: string; desde_sucursal_id?: string; hacia_sucursal_id?: string; cantidad?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }

  const productoId = String(body.producto_id ?? "").trim();
  const desde = String(body.desde_sucursal_id ?? "").trim();
  const hacia = String(body.hacia_sucursal_id ?? "").trim();
  const cantidad = Number(body.cantidad);
  if (!productoId || !desde || !hacia) {
    return NextResponse.json(errorResponse("Faltan parámetros (producto_id, desde_sucursal_id, hacia_sucursal_id)."), { status: 400 });
  }
  if (desde === hacia) {
    return NextResponse.json(errorResponse("La sucursal origen y destino deben ser distintas."), { status: 400 });
  }
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return NextResponse.json(errorResponse("La cantidad debe ser mayor a cero."), { status: 400 });
  }

  const pool = getChatPostgresPool();
  if (!pool) {
    return NextResponse.json(errorResponse("Base de datos no disponible."), { status: 503 });
  }

  const empresaId = auth.empresa_id;
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const tPSS = quoteSchemaTable(schema, "producto_stock_sucursal");
  const tP = quoteSchemaTable(schema, "productos");
  const tS = quoteSchemaTable(schema, "sucursales");
  const tM = quoteSchemaTable(schema, "movimientos_inventario");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Validar ownership del producto y sucursales (mismo empresa_id).
    const owner = await client.query<{ producto: string | null; desde: string | null; hacia: string | null; nombre: string; sku: string; costo: number }>(
      `SELECT
         (SELECT empresa_id::text FROM ${tP} WHERE id=$1::uuid) AS producto,
         (SELECT empresa_id::text FROM ${tS} WHERE id=$2::uuid) AS desde,
         (SELECT empresa_id::text FROM ${tS} WHERE id=$3::uuid) AS hacia,
         (SELECT nombre FROM ${tP} WHERE id=$1::uuid) AS nombre,
         (SELECT sku FROM ${tP} WHERE id=$1::uuid) AS sku,
         (SELECT COALESCE(costo_promedio,0)::float8 FROM ${tP} WHERE id=$1::uuid) AS costo`,
      [productoId, desde, hacia],
    );
    const row = owner.rows[0];
    if (!row?.producto || row.producto !== empresaId) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Producto no encontrado en tu empresa."), { status: 404 });
    }
    if (row.desde !== empresaId || row.hacia !== empresaId) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Sucursal inválida para tu empresa."), { status: 400 });
    }

    // 2. Lock pesimista de la fila origen + validación de stock disponible.
    const lockOrigen = await client.query<{ stock: number | string }>(
      `SELECT stock_actual::float8 AS stock FROM ${tPSS}
        WHERE producto_id=$1::uuid AND sucursal_id=$2::uuid FOR UPDATE`,
      [productoId, desde],
    );
    const stockOrigen = Number(lockOrigen.rows[0]?.stock ?? 0);
    if (stockOrigen < cantidad) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(`Stock insuficiente en sucursal origen (disponible: ${stockOrigen}).`),
        { status: 400 },
      );
    }

    // 3. Descontar origen, sumar destino (upsert para crear la fila destino si no existía).
    await client.query(
      `UPDATE ${tPSS} SET stock_actual = stock_actual - $3::numeric, updated_at = now()
        WHERE producto_id=$1::uuid AND sucursal_id=$2::uuid`,
      [productoId, desde, cantidad],
    );
    await client.query(
      `INSERT INTO ${tPSS} (producto_id, sucursal_id, stock_actual, stock_minimo, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::numeric, 0, now())
       ON CONFLICT (producto_id, sucursal_id)
         DO UPDATE SET stock_actual = ${tPSS}.stock_actual + EXCLUDED.stock_actual,
                       updated_at   = now()`,
      [productoId, hacia, cantidad],
    );

    // 4. Movimientos de inventario (best-effort, no rompen la transferencia).
    const refTransfer = `TRANSFERENCIA:${desde.slice(0, 8)}→${hacia.slice(0, 8)}`;
    try {
      await client.query(
        `INSERT INTO ${tM} (empresa_id, producto_id, producto_nombre, producto_sku,
                            tipo, cantidad, costo_unitario, origen, referencia, fecha,
                            created_by, usuario_nombre)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'SALIDA', $5::numeric, $6::numeric, 'transferencia', $7, now(),
                 $8::uuid, $9)`,
        [empresaId, productoId, row.nombre ?? "", row.sku ?? "", cantidad, row.costo,
         refTransfer, auth.usuarioCatalogId ?? null, auth.user?.email ?? null],
      );
      await client.query(
        `INSERT INTO ${tM} (empresa_id, producto_id, producto_nombre, producto_sku,
                            tipo, cantidad, costo_unitario, origen, referencia, fecha,
                            created_by, usuario_nombre)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'ENTRADA', $5::numeric, $6::numeric, 'transferencia', $7, now(),
                 $8::uuid, $9)`,
        [empresaId, productoId, row.nombre ?? "", row.sku ?? "", cantidad, row.costo,
         refTransfer, auth.usuarioCatalogId ?? null, auth.user?.email ?? null],
      );
    } catch (e) {
      console.warn("[transferencia] movimientos no registrados:", e instanceof Error ? e.message : e);
    }

    await client.query("COMMIT");

    return NextResponse.json(successResponse({
      producto_id: productoId,
      desde_sucursal_id: desde,
      hacia_sucursal_id: hacia,
      cantidad,
    }));
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* swallow */ }
    console.error("[transferencia]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo transferir el stock."), { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * GET /api/inventario/transferencia?producto_id=...
 *
 * Devuelve el desglose de stock por sucursal del producto. Pensado para
 * mostrar en el modal de transferencia (admin) y la sección stock per-sucursal
 * del detalle (todos los roles, ya que es informativo).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });
  const url = new URL(request.url);
  const productoId = (url.searchParams.get("producto_id") ?? "").trim();
  if (!productoId) {
    return NextResponse.json(errorResponse("Falta producto_id."), { status: 400 });
  }
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(successResponse({ stocks: [] }));
  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tPSS = quoteSchemaTable(schema, "producto_stock_sucursal");
    const tS = quoteSchemaTable(schema, "sucursales");
    const r = await pool.query<{ sucursal_id: string; nombre: string; es_principal: boolean; stock_actual: number | string }>(
      `SELECT s.id AS sucursal_id, s.nombre, s.es_principal,
              COALESCE(pss.stock_actual, 0)::float8 AS stock_actual
         FROM ${tS} s
         LEFT JOIN ${tPSS} pss
           ON pss.sucursal_id = s.id AND pss.producto_id = $1::uuid
        WHERE s.empresa_id = $2::uuid AND s.activo = true
        ORDER BY s.es_principal DESC, s.nombre ASC`,
      [productoId, auth.empresa_id],
    );
    return NextResponse.json(successResponse({ stocks: r.rows }));
  } catch (e) {
    console.error("[transferencia GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(successResponse({ stocks: [] }));
  }
}
