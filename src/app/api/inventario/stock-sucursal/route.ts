import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * GET /api/inventario/stock-sucursal?producto_id=...
 *
 * Devuelve TODAS las sucursales de la empresa y, para cada una, el stock
 * actual del producto y un flag `incluido` (true si tiene fila en
 * producto_stock_sucursal — o sea, si el producto pertenece al inventario
 * de esa sucursal).
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
    const tP = quoteSchemaTable(schema, "productos");
    const r = await pool.query<{
      sucursal_id: string; nombre: string; es_principal: boolean;
      stock_actual: number | string; incluido: boolean;
    }>(
      `SELECT s.id AS sucursal_id, s.nombre, s.es_principal,
              COALESCE(pss.stock_actual, 0)::float8 AS stock_actual,
              (pss.producto_id IS NOT NULL) AS incluido
         FROM ${tS} s
         LEFT JOIN ${tPSS} pss
           ON pss.sucursal_id = s.id AND pss.producto_id = $1::uuid
        WHERE s.empresa_id = $2::uuid AND s.activo = true
        ORDER BY s.es_principal DESC, s.nombre ASC`,
      [productoId, auth.empresa_id],
    );
    // Fallback: si Principal no tiene fila o tiene 0 pero productos.stock_actual
    // dice otra cosa (legacy: producto creado/editado antes de que el PATCH
    // sincronizara producto_stock_sucursal), mostramos lo que está en productos
    // como Principal. Esto evita que la caja muestre 0 cuando el form arriba
    // dice 3.
    let stocks = r.rows;
    try {
      const totalRow = await pool.query<{ stock_actual: number | string }>(
        `SELECT stock_actual::float8 AS stock_actual FROM ${tP} WHERE id=$1::uuid`,
        [productoId],
      );
      const totalProducto = Number(totalRow.rows[0]?.stock_actual ?? 0);
      const sumaPss = stocks.reduce((acc, r) => acc + Number(r.stock_actual ?? 0), 0);
      if (sumaPss < totalProducto) {
        // Suma no llega al total → la diferencia va a Principal.
        const principalIdx = stocks.findIndex((s) => s.es_principal);
        const faltante = totalProducto - sumaPss;
        if (principalIdx >= 0) {
          stocks = stocks.map((s, i) =>
            i === principalIdx
              ? { ...s, stock_actual: Number(s.stock_actual) + faltante, incluido: true }
              : s,
          );
        }
      }
    } catch { /* ignorar fallback */ }
    return NextResponse.json(successResponse({ stocks }));
  } catch (e) {
    console.error("[stock-sucursal GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(successResponse({ stocks: [] }));
  }
}

/**
 * POST /api/inventario/stock-sucursal
 *
 * Admin-only. Body: `{producto_id, sucursal_id, stock_actual, incluido}`.
 *   - incluido=true  → UPSERT con el stock provisto (0 si no se manda).
 *   - incluido=false → DELETE de la fila (producto deja de aparecer en esa sucursal).
 * El trigger sync_producto_stock_total reconcilia productos.stock_actual.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });
  if (!isAdmin(auth)) {
    return NextResponse.json(
      errorResponse("Solo administradores pueden ajustar stock per-sucursal."),
      { status: 403 },
    );
  }

  let body: { producto_id?: string; sucursal_id?: string; stock_actual?: number | null; incluido?: boolean };
  try { body = await request.json(); } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }

  const productoId = String(body.producto_id ?? "").trim();
  const sucursalId = String(body.sucursal_id ?? "").trim();
  const incluido = body.incluido !== false; // default true
  if (!productoId || !sucursalId) {
    return NextResponse.json(errorResponse("Faltan producto_id o sucursal_id."), { status: 400 });
  }
  const stockNum = body.stock_actual == null ? 0 : Number(body.stock_actual);
  if (!Number.isFinite(stockNum) || stockNum < 0) {
    return NextResponse.json(errorResponse("Stock inválido."), { status: 400 });
  }

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Base de datos no disponible."), { status: 503 });

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tPSS = quoteSchemaTable(schema, "producto_stock_sucursal");
    const tP = quoteSchemaTable(schema, "productos");
    const tS = quoteSchemaTable(schema, "sucursales");

    // Validar ownership: producto y sucursal pertenecen a la empresa del usuario.
    const owner = await pool.query<{ producto: string | null; sucursal: string | null }>(
      `SELECT
         (SELECT empresa_id::text FROM ${tP} WHERE id=$1::uuid) AS producto,
         (SELECT empresa_id::text FROM ${tS} WHERE id=$2::uuid) AS sucursal`,
      [productoId, sucursalId],
    );
    const row = owner.rows[0];
    if (row?.producto !== auth.empresa_id || row?.sucursal !== auth.empresa_id) {
      return NextResponse.json(errorResponse("Producto o sucursal inválida."), { status: 400 });
    }

    // Principal es el "pool" del stock: todo lo que no esté asignado a otra
    // sucursal queda ahí. Cuando admin sube stock en Sucursal 2 (= sucursalId
    // != principal), restamos esa diferencia de Principal en la misma
    // transacción para que el total (productos.stock_actual) no cambie.
    // Si se está incluyendo Principal directamente, simplemente upsert sin
    // tocar otras sucursales.
    const principalRow = await pool.query<{ id: string }>(
      `SELECT id FROM ${tS} WHERE empresa_id=$1::uuid AND es_principal=true LIMIT 1`,
      [auth.empresa_id],
    );
    const principalId = principalRow.rows[0]?.id ?? null;
    const esPrincipal = principalId && sucursalId === principalId;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (esPrincipal) {
        // Edición directa de Principal (no debería pasar desde la UI nueva,
        // pero lo aceptamos para no perder flexibilidad). Sin auto-balance.
        if (incluido) {
          await client.query(
            `INSERT INTO ${tPSS} (producto_id, sucursal_id, stock_actual, stock_minimo, updated_at)
               VALUES ($1::uuid, $2::uuid, $3::numeric, 0, now())
             ON CONFLICT (producto_id, sucursal_id)
               DO UPDATE SET stock_actual = EXCLUDED.stock_actual, updated_at = now()`,
            [productoId, sucursalId, stockNum],
          );
        } else {
          await client.query(
            `DELETE FROM ${tPSS} WHERE producto_id=$1::uuid AND sucursal_id=$2::uuid`,
            [productoId, sucursalId],
          );
        }
        await client.query("COMMIT");
        return NextResponse.json(successResponse({ ok: true }));
      }

      // Sucursal no-principal: ajustar Principal en función del delta.
      // 1. Leer stock actual de esta sucursal y de Principal (lock pesimista).
      const stockThisRow = await client.query<{ stock: number | string }>(
        `SELECT stock_actual::float8 AS stock FROM ${tPSS}
          WHERE producto_id=$1::uuid AND sucursal_id=$2::uuid FOR UPDATE`,
        [productoId, sucursalId],
      );
      const currentThis = Number(stockThisRow.rows[0]?.stock ?? 0);

      let currentPrincipal = 0;
      if (principalId) {
        const stockPrinRow = await client.query<{ stock: number | string }>(
          `SELECT stock_actual::float8 AS stock FROM ${tPSS}
            WHERE producto_id=$1::uuid AND sucursal_id=$2::uuid FOR UPDATE`,
          [productoId, principalId],
        );
        currentPrincipal = Number(stockPrinRow.rows[0]?.stock ?? 0);
      }

      if (!incluido) {
        // Sacar el producto de esta sucursal: el stock que tenía vuelve a Principal.
        await client.query(
          `DELETE FROM ${tPSS} WHERE producto_id=$1::uuid AND sucursal_id=$2::uuid`,
          [productoId, sucursalId],
        );
        if (principalId && currentThis > 0) {
          await client.query(
            `INSERT INTO ${tPSS} (producto_id, sucursal_id, stock_actual, stock_minimo, updated_at)
               VALUES ($1::uuid, $2::uuid, $3::numeric, 0, now())
             ON CONFLICT (producto_id, sucursal_id)
               DO UPDATE SET stock_actual = ${tPSS}.stock_actual + $3::numeric, updated_at = now()`,
            [productoId, principalId, currentThis],
          );
        }
        await client.query("COMMIT");
        return NextResponse.json(successResponse({ ok: true }));
      }

      // Incluido=true: ajustar stock y rebalancear con Principal.
      const delta = stockNum - currentThis;
      if (delta > 0 && currentPrincipal < delta) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          errorResponse(
            `No alcanza el stock disponible. En esta sucursal querés ${stockNum} pero ` +
            `solo hay ${currentPrincipal + currentThis} en total disponible para mover.`,
          ),
          { status: 400 },
        );
      }
      // Upsert esta sucursal con el nuevo stock.
      await client.query(
        `INSERT INTO ${tPSS} (producto_id, sucursal_id, stock_actual, stock_minimo, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::numeric, 0, now())
         ON CONFLICT (producto_id, sucursal_id)
           DO UPDATE SET stock_actual = EXCLUDED.stock_actual, updated_at = now()`,
        [productoId, sucursalId, stockNum],
      );
      // Ajustar Principal (-delta) para preservar el total.
      if (principalId) {
        await client.query(
          `INSERT INTO ${tPSS} (producto_id, sucursal_id, stock_actual, stock_minimo, updated_at)
             VALUES ($1::uuid, $2::uuid, $3::numeric, 0, now())
           ON CONFLICT (producto_id, sucursal_id)
             DO UPDATE SET stock_actual = ${tPSS}.stock_actual - $4::numeric, updated_at = now()`,
          [productoId, principalId, Math.max(0, currentPrincipal - delta), delta],
        );
      }
      await client.query("COMMIT");
      return NextResponse.json(successResponse({ ok: true }));
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch { /* swallow */ }
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[stock-sucursal POST]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo actualizar el stock."), { status: 500 });
  }
}
