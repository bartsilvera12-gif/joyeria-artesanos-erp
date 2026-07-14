/**
 * Anula una venta: marca estado='anulada' y reintegra el stock en la sucursal
 * donde se registro. Registra un movimiento_inventario ENTRADA por cada linea
 * con origen='ANULACION_VENTA'. Transaccional.
 *
 * NO revierte movimientos de caja: si la venta estaba en una caja abierta y ya
 * cerrada, no hay forma segura de rollback ahi. Para caja abierta el usuario
 * deberia registrar un movimiento manual, o cerrar y reconciliar.
 */
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

export interface AnularVentaParams {
  schema: string;
  empresaId: string;
  ventaId: string;
  usuarioNombre?: string | null;
}

export interface AnularVentaResult {
  ventaId: string;
  numero_control: string;
  itemsRevertidos: number;
}

function qT(schema: string, table: string): string {
  return quoteSchemaTable(schema, table);
}

export async function anularVentaPg(
  params: AnularVentaParams,
): Promise<AnularVentaResult> {
  const pool = await getChatPostgresPool();
  if (!pool) throw new Error("Postgres pool no disponible (falta SUPABASE_DB_URL).");
  const ventasT = qT(params.schema, "ventas");
  const itemsT = qT(params.schema, "ventas_items");
  const prodT = qT(params.schema, "productos");
  const stockSucT = qT(params.schema, "producto_stock_sucursal");
  const movT = qT(params.schema, "movimientos_inventario");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const vRes = await client.query<{
      id: string;
      numero_control: string;
      estado: string;
      sucursal_id: string | null;
      observaciones: string | null;
    }>(
      `SELECT id, numero_control, estado, sucursal_id, observaciones
       FROM ${ventasT}
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [params.ventaId, params.empresaId],
    );
    if (vRes.rowCount === 0) {
      throw new Error("Venta no encontrada.");
    }
    const venta = vRes.rows[0];
    if ((venta.estado ?? "").toLowerCase() === "anulada") {
      throw new Error("La venta ya estaba anulada.");
    }

    const itemsRes = await client.query<{
      producto_id: string;
      producto_nombre: string | null;
      sku: string | null;
      cantidad: string;
      costo_unitario_snapshot: string | null;
    }>(
      `SELECT producto_id, producto_nombre, sku, cantidad, costo_unitario_snapshot
       FROM ${itemsT}
       WHERE venta_id = $1 AND empresa_id = $2`,
      [params.ventaId, params.empresaId],
    );

    const fechaIso = new Date().toISOString();
    let itemsRevertidos = 0;

    for (const it of itemsRes.rows) {
      const cantidad = Number(it.cantidad) || 0;
      if (cantidad <= 0) continue;
      const costo = Number(it.costo_unitario_snapshot ?? 0) || 0;

      if (venta.sucursal_id) {
        await client.query(
          `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (producto_id, sucursal_id) DO UPDATE
           SET stock_actual = ${stockSucT}.stock_actual + EXCLUDED.stock_actual,
               updated_at = now()`,
          [it.producto_id, venta.sucursal_id, cantidad],
        );
      } else {
        await client.query(
          `UPDATE ${prodT}
           SET stock_actual = stock_actual + $1
           WHERE id = $2 AND empresa_id = $3`,
          [cantidad, it.producto_id, params.empresaId],
        );
      }

      await client.query(
        `INSERT INTO ${movT} (
           empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, costo_unitario, origen, referencia, fecha, venta_id
         ) VALUES (
           $1, $2, $3, $4,
           'ENTRADA', $5, $6, 'ANULACION_VENTA', $7, $8::timestamptz, $9
         )`,
        [
          params.empresaId,
          it.producto_id,
          it.producto_nombre,
          it.sku,
          cantidad,
          costo,
          venta.numero_control,
          fechaIso,
          params.ventaId,
        ],
      );

      itemsRevertidos++;
    }

    const marca = `[anulada ${fechaIso}${
      params.usuarioNombre ? ` por ${params.usuarioNombre}` : ""
    }]`;
    const obsNueva = venta.observaciones
      ? `${venta.observaciones}\n${marca}`
      : marca;

    await client.query(
      `UPDATE ${ventasT}
       SET estado = 'anulada', observaciones = $1, updated_at = now()
       WHERE id = $2 AND empresa_id = $3`,
      [obsNueva, params.ventaId, params.empresaId],
    );

    await client.query("COMMIT");
    return {
      ventaId: params.ventaId,
      numero_control: venta.numero_control,
      itemsRevertidos,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
