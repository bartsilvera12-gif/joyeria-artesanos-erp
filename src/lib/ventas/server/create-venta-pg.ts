import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

export interface CreateVentaItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_venta_original: number;
  precio_venta: number;
  tipo_iva: "EXENTA" | "5%" | "10%";
  subtotal: number;
  monto_iva: number;
  total_linea: number;
  /** Fase Decants: si true, el ítem se entrega como obsequio. Server-side
   *  valida que el producto tenga es_decant=true y fuerza precios a 0. */
  es_sin_cargo?: boolean;
  /** Motivo cuando es_sin_cargo=true (ej. "decant_obsequio"). */
  motivo_sin_cargo?: string | null;
}

export interface CreateVentaPgParams {
  schema: string;
  empresaId: string;
  clienteId: string | null;
  observaciones: string | null;
  moneda: "GS" | "USD";
  tipoCambio: number;
  tipoVenta: "CONTADO" | "CREDITO";
  plazoDias: number | null;
  items: CreateVentaItemInput[];
  /** Totales enviados por el cliente (se contrastan con el recálculo). */
  subtotalDeclarado: number;
  montoIvaDeclarado: number;
  totalDeclarado: number;
  /** Método de pago (módulo caja). Opcional; default null/efectivo. */
  metodoPago?: "efectivo" | "tarjeta" | "transferencia" | null;
  /**
   * Sucursal en la que se materializa la venta (Joyería Artesanos
   * multi-sucursal). Si viene, el descuento de stock se hace en
   * `producto_stock_sucursal` (un trigger sincroniza productos.stock_actual).
   * Si es null, se usa el path legacy (UPDATE productos.stock_actual directo).
   */
  sucursalId?: string | null;
}

function qTable(schema: string, table: string): string {
  return quoteSchemaTable(schema, table);
}

function recalcTotals(items: CreateVentaItemInput[]) {
  let subtotal = 0;
  let montoIva = 0;
  let total = 0;
  for (const it of items) {
    // Las líneas marcadas sin_cargo aportan 0 al recálculo (server-side las
    // forzaremos a 0 más adelante; acá ya no se confía en sus valores).
    if (it.es_sin_cargo === true) continue;
    subtotal += it.subtotal;
    montoIva += it.monto_iva;
    total += it.total_linea;
  }
  return { subtotal, montoIva, total };
}

const TOL = 2; // guaraníes — tolerancia de redondeo

/**
 * Crea venta + ítems + movimientos + descuenta stock en una transacción Postgres.
 * Requiere SUPABASE_DB_URL / DIRECT_URL / DATABASE_URL en el servidor.
 */
export async function createVentaTransaccionalPg(
  params: CreateVentaPgParams
): Promise<{ ventaId: string; numeroControl: string; fechaIso: string }> {
  const pool = getChatPostgresPool();
  if (!pool) {
    throw new Error("Sin conexión directa a Postgres (configura SUPABASE_DB_URL).");
  }

  const items = params.items;
  if (!items.length) {
    throw new Error("La venta debe tener al menos un ítem.");
  }

  const calc = recalcTotals(items);
  if (
    Math.abs(calc.subtotal - params.subtotalDeclarado) > TOL ||
    Math.abs(calc.montoIva - params.montoIvaDeclarado) > TOL ||
    Math.abs(calc.total - params.totalDeclarado) > TOL
  ) {
    throw new Error("Los totales no coinciden con los ítems; revisá el carrito.");
  }

  const qtyByProduct = new Map<string, number>();
  for (const it of items) {
    const prev = qtyByProduct.get(it.producto_id) ?? 0;
    qtyByProduct.set(it.producto_id, prev + it.cantidad);
  }

  const ventasT = qTable(params.schema, "ventas");
  const cajasT = qTable(params.schema, "cajas");
  const itemsT = qTable(params.schema, "ventas_items");
  const movT = qTable(params.schema, "movimientos_inventario");
  const prodT = qTable(params.schema, "productos");
  const stockSucT = qTable(params.schema, "producto_stock_sucursal");
  const cliT = qTable(params.schema, "clientes");
  const sucursalId = params.sucursalId ?? null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (params.clienteId) {
      const ck = await client.query<{ ok: number }>(
        `SELECT 1 AS ok FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
        [params.clienteId, params.empresaId]
      );
      if (ck.rows.length === 0) {
        throw new Error("Cliente no encontrado en esta empresa.");
      }
    }

    const ids = [...qtyByProduct.keys()];
    const lockSql = `
      SELECT id, stock_actual, costo_promedio, nombre, sku, es_decant
      FROM ${prodT}
      WHERE empresa_id = $1 AND id = ANY($2::uuid[])
      FOR UPDATE
    `;
    const locked = await client.query<{
      id: string;
      stock_actual: string;
      costo_promedio: string;
      nombre: string;
      sku: string;
      es_decant: boolean;
    }>(lockSql, [params.empresaId, ids]);

    if (locked.rows.length !== ids.length) {
      throw new Error("Uno o más productos no existen o no pertenecen a esta empresa.");
    }

    const stockMap = new Map<
      string,
      { stock: number; costo: number; nombre: string; sku: string; esDecant: boolean }
    >();
    for (const row of locked.rows) {
      stockMap.set(row.id, {
        stock: Number(row.stock_actual),
        costo: Number(row.costo_promedio),
        nombre: row.nombre,
        sku: row.sku,
        esDecant: row.es_decant === true,
      });
    }

    // Multi-sucursal: el stock relevante es el de la sucursal donde se vende.
    // Reemplaza el total agregado por el valor per-sucursal (lock incluido).
    if (sucursalId) {
      const ssLocked = await client.query<{ producto_id: string; stock_actual: string }>(
        `SELECT producto_id, stock_actual
         FROM ${stockSucT}
         WHERE sucursal_id = $1 AND producto_id = ANY($2::uuid[])
         FOR UPDATE`,
        [sucursalId, ids]
      );
      const ssMap = new Map<string, number>();
      for (const row of ssLocked.rows) {
        ssMap.set(row.producto_id, Number(row.stock_actual));
      }
      for (const id of ids) {
        const ref = stockMap.get(id);
        if (!ref) continue;
        ref.stock = ssMap.has(id) ? (ssMap.get(id) as number) : 0;
      }
    }

    // Validación Fase Decants: rechazar items sin_cargo cuyo producto no es decant.
    for (const it of items) {
      if (it.es_sin_cargo === true) {
        const p = stockMap.get(it.producto_id);
        if (!p) continue; // el chequeo de existencia ya falló arriba
        if (!p.esDecant) {
          throw new Error(
            `"${p.nombre}" no es un decant. Solo los productos marcados como decant pueden entregarse sin cargo.`
          );
        }
      }
    }

    for (const [pid, need] of qtyByProduct) {
      const p = stockMap.get(pid)!;
      if (p.stock < need) {
        throw new Error(
          `Stock insuficiente para "${p.nombre}". Disponible: ${p.stock} u.; requerido: ${need}.`
        );
      }
    }

    const maxRow = await client.query<{ mx: string | null }>(
      `
      SELECT COALESCE(MAX(
        CASE
          WHEN numero_control ~ '^VTA-[0-9]+$'
          THEN substring(numero_control from '[0-9]+$')::bigint
          ELSE NULL::bigint
        END
      ), 0)::text AS mx
      FROM ${ventasT}
      WHERE empresa_id = $1
      `,
      [params.empresaId]
    );
    const nextNum = BigInt(maxRow.rows[0]?.mx ?? "0") + BigInt(1);
    const numeroControl = `VTA-${String(nextNum).padStart(6, "0")}`;

    const fechaIso = new Date().toISOString();

    // Caja abierta actual (best-effort): si la tabla `cajas` aún no existe o
    // no hay caja abierta, la venta se registra sin `caja_id`.
    // Multi-sucursal: cuando hay sucursalId, busca caja abierta DE ESA sucursal.
    let cajaIdActual: string | null = null;
    try {
      const cajaSql = sucursalId
        ? `SELECT id FROM ${cajasT}
           WHERE empresa_id = $1 AND estado = 'abierta' AND sucursal_id = $2
           ORDER BY fecha_apertura DESC LIMIT 1`
        : `SELECT id FROM ${cajasT}
           WHERE empresa_id = $1 AND estado = 'abierta'
           ORDER BY fecha_apertura DESC LIMIT 1`;
      const cajaArgs = sucursalId ? [params.empresaId, sucursalId] : [params.empresaId];
      const cQ = await client.query<{ id: string }>(cajaSql, cajaArgs);
      cajaIdActual = cQ.rows[0]?.id ?? null;
    } catch { /* tabla cajas inexistente: continuar sin enlace */ }

    const metodoPago = params.metodoPago ?? null;

    const insVenta = await client.query<{ id: string }>(
      `
      INSERT INTO ${ventasT} (
        empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
        subtotal, monto_iva, total, estado, tipo_venta, plazo_dias, fecha, observaciones,
        caja_id, metodo_pago, sucursal_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, 'completada', $9, $10, $11::timestamptz, $12,
        $13, $14, $15
      )
      RETURNING id
      `,
      [
        params.empresaId,
        params.clienteId,
        numeroControl,
        params.moneda,
        params.tipoCambio,
        calc.subtotal,
        calc.montoIva,
        calc.total,
        params.tipoVenta,
        params.plazoDias,
        fechaIso,
        params.observaciones,
        cajaIdActual,
        metodoPago,
        sucursalId,
      ]
    );

    const ventaId = insVenta.rows[0].id;

    for (const line of items) {
      const p = stockMap.get(line.producto_id)!;
      const esSinCargo = line.es_sin_cargo === true;

      // Cálculos efectivos server-side (no se confía en el cliente para items
      // sin_cargo: se fuerzan precios y se calcula costo promocional).
      const precioVentaOriginal = esSinCargo ? 0 : line.precio_venta_original;
      const precioVenta = esSinCargo ? 0 : line.precio_venta;
      const subtotal = esSinCargo ? 0 : line.subtotal;
      const montoIva = esSinCargo ? 0 : line.monto_iva;
      const totalLinea = esSinCargo ? 0 : line.total_linea;
      const motivo = esSinCargo
        ? (typeof line.motivo_sin_cargo === "string" && line.motivo_sin_cargo.trim()
            ? line.motivo_sin_cargo.trim().slice(0, 120)
            : "decant_obsequio")
        : null;
      const costoSnapshot = esSinCargo ? p.costo : null;
      const costoPromocionalTotal = esSinCargo ? p.costo * line.cantidad : null;
      const origenMov = esSinCargo ? "venta_regalo" : "venta";
      const referenciaMov = esSinCargo ? `${numeroControl}-REGALO` : numeroControl;

      await client.query(
        `
        INSERT INTO ${itemsT} (
          empresa_id, venta_id, producto_id, producto_nombre, sku,
          cantidad, precio_venta_original, precio_venta, tipo_iva,
          subtotal, monto_iva, total_linea,
          es_sin_cargo, motivo_sin_cargo, costo_unitario_snapshot, costo_promocional_total
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15, $16
        )
        `,
        [
          params.empresaId,
          ventaId,
          line.producto_id,
          line.producto_nombre,
          line.sku,
          line.cantidad,
          precioVentaOriginal,
          precioVenta,
          esSinCargo ? "EXENTA" : line.tipo_iva,
          subtotal,
          montoIva,
          totalLinea,
          esSinCargo,
          motivo,
          costoSnapshot,
          costoPromocionalTotal,
        ]
      );

      const nuevoStock = p.stock - line.cantidad;
      if (sucursalId) {
        // El trigger trg_sync_producto_stock_total_aiud actualiza productos.stock_actual.
        await client.query(
          `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (producto_id, sucursal_id) DO UPDATE
           SET stock_actual = EXCLUDED.stock_actual, updated_at = now()`,
          [line.producto_id, sucursalId, nuevoStock]
        );
      } else {
        await client.query(
          `UPDATE ${prodT} SET stock_actual = $1 WHERE id = $2 AND empresa_id = $3`,
          [nuevoStock, line.producto_id, params.empresaId]
        );
      }
      p.stock = nuevoStock;

      await client.query(
        `
        INSERT INTO ${movT} (
          empresa_id, producto_id, producto_nombre, producto_sku,
          tipo, cantidad, costo_unitario, origen, referencia, fecha, venta_id
        ) VALUES (
          $1, $2, $3, $4,
          'SALIDA', $5, $6, $7, $8, $9::timestamptz, $10
        )
        `,
        [
          params.empresaId,
          line.producto_id,
          line.producto_nombre,
          line.sku,
          line.cantidad,
          p.costo,
          origenMov,
          referenciaMov,
          fechaIso,
          ventaId,
        ]
      );
    }

    await client.query("COMMIT");
    return { ventaId, numeroControl, fechaIso };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
