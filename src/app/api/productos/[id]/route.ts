import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  rowToProductoApi,
  DuplicadoError,
} from "@/lib/inventario/server/productos-pg";
import {
  existsInTenantPostgrest,
  updateProductoPostgrest,
  setCategoriaPrincipalPostgrest,
} from "@/lib/inventario/server/productos-postgrest";
import { postgrestGet, postgrestDelete, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { syncCatalogoExtras } from "@/lib/inventario/server/catalogo-web-extras";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";

/**
 * Campos del producto que afectan la página web pública (catálogo, ofertas,
 * marca, descripciones SEO, decants, etc.). Solo el admin puede modificarlos:
 * operativos de sucursal pueden ajustar stock/precios/categoría, pero no la
 * presencia y presentación en la web.
 */
const WEB_ONLY_FIELDS = [
  "slug_web", "visible_web", "destacado_web",
  "descripcion_corta", "descripcion_web", "descripcion",
  "marca", "marca_id", "precio_web",
  "precio_oferta", "oferta_hasta", "nuevo_hasta",
  "concentracion", "volumen_ml", "genero",
  "proximamente", "orden_web", "familia_olfativa_id",
  "familia_olfativa_nombre", "notas_top", "notas_heart", "notas_base",
  "visible_mayorista_web", "es_decant",
] as const;

const PRODUCTO_COLS_PRIV =
  "id,empresa_id,nombre,sku,modelo,costo_promedio,precio_venta,stock_actual,stock_minimo," +
  "cantidad_minima_minorista," +
  "unidad_medida,metodo_valuacion,activo,created_at,updated_at," +
  "codigo_barras,codigo_barras_interno,imagen_path,imagen_url," +
  "categoria_principal_id,ubicacion_principal_id,proveedor_principal_id," +
  "slug_web,visible_web,destacado_web,descripcion_corta,descripcion_web,marca,marca_id,precio_web,precio_mayorista,cantidad_minima_mayorista,visible_mayorista_web," +
  // Fix: estas columnas faltaban y causaban que el editor reabriera el producto
  // con los campos del catálogo web / promo vacíos aunque estuvieran guardados
  // en DB (el PATCH sí los persistía; solo el GET no los traía de vuelta).
  "precio_oferta,oferta_hasta,nuevo_hasta,concentracion,volumen_ml,genero," +
  "proximamente,orden_web,familia_olfativa_id,tiene_presentaciones,es_decant";

type ProductoRow = Record<string, unknown> & { id?: string };

/**
 * GET /api/productos/[id] — lee un producto vía PostgREST HTTPS con JWT del
 * usuario. RLS por empresa + filtro defensivo empresa_id=eq.X.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: PRODUCTO_COLS_PRIV,
      empresa_id: `eq.${empresaId}`,
      id: `eq.${id}`,
      limit: "1",
    });
    const r = await postgrestGet<ProductoRow>("productos", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/productos/[id] GET]", r.error);
      return NextResponse.json(errorResponse("No se pudo cargar el producto."), { status: 502 });
    }
    const row = r.rows[0];
    if (!row) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    // rowToProductoApi normaliza shape (string IDs, etc.)
    return NextResponse.json(successResponse({ producto: rowToProductoApi(row as never) }));
  } catch (err) {
    console.error("[/api/productos/[id] GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el producto."), { status: 500 });
  }
}
import { normalizeUpperText, normalizeUpperCodigoBarras } from "@/lib/text/normalize";

/**
 * Legacy pool-based existsInTenant — quedó como referencia. NO usar en
 * runtime web. Mantenido para no romper imports indirectos si los hubiera.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

async function existsInTenant(
  schema: string,
  empresaId: string,
  table: "categorias_productos" | "inventario_ubicaciones" | "proveedores",
  id: string
): Promise<boolean> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const s = assertAllowedChatDataSchema(schema);
  const t = quoteSchemaTable(s, table);
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM ${t} WHERE id = $1::uuid AND empresa_id = $2::uuid LIMIT 1`,
    [id, empresaId]
  );
  return rows.length > 0;
}

/**
 * PATCH /api/productos/[id]
 *
 * Update parcial vía PostgREST HTTPS con JWT del usuario. RLS por empresa
 * cubre ownership. Aplica solo los campos presentes en el body.
 */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    // Guard: solo admin modifica campos de la página web pública. Los demás
    // pueden tocar stock/precios/categoría pero no la presencia/aspecto del
    // producto en el catálogo público. Si vienen, los descartamos silenciosamente
    // (no rompemos el PATCH del operativo por un campo extra que no debería tocar).
    const auth = await getAuthWithRol(request);
    if (!isAdmin(auth)) {
      for (const k of WEB_ONLY_FIELDS) {
        if (k in body) delete body[k];
      }
    }

    const patch: Parameters<typeof updateProductoPostgrest>[3] = {};
    if (body.nombre !== undefined) patch.nombre = normalizeUpperText(body.nombre);
    if (body.sku !== undefined) patch.sku = normalizeUpperText(body.sku);
    if (body.modelo !== undefined) {
      patch.modelo = typeof body.modelo === "string" ? body.modelo.trim().toUpperCase() || null : null;
    }
    if (body.costo_promedio !== undefined) patch.costo_promedio = Number(body.costo_promedio) || 0;
    if (body.precio_venta !== undefined) patch.precio_venta = Number(body.precio_venta) || 0;
    // Stock total: en modelo multi-sucursal va a Principal vía producto_stock_sucursal;
    // el trigger reconcilia productos.stock_actual. Si el schema no tiene esa tabla,
    // cae al PATCH directo a productos.stock_actual (legacy). Lo resolvemos abajo
    // tras detectar si hay sucursales — acá solo dejamos el valor pendiente.
    const stockActualEdit = body.stock_actual !== undefined ? Number(body.stock_actual) || 0 : null;
    if (body.stock_minimo !== undefined) patch.stock_minimo = Number(body.stock_minimo) || 0;
    if (body.cantidad_minima_minorista !== undefined) {
      const v = body.cantidad_minima_minorista;
      if (v === null || v === "") patch.cantidad_minima_minorista = null;
      else {
        const n = Number(v);
        patch.cantidad_minima_minorista =
          Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
      }
    }
    if (body.unidad_medida !== undefined) patch.unidad_medida = normalizeUpperText(body.unidad_medida) || "UNIDAD";
    if (body.activo !== undefined) patch.activo = body.activo === true;
    if (body.metodo_valuacion !== undefined) {
      const mv = body.metodo_valuacion;
      patch.metodo_valuacion = mv === "FIFO" || mv === "LIFO" ? mv : "CPP";
    }
    if (body.codigo_barras !== undefined) {
      patch.codigo_barras = normalizeUpperCodigoBarras(body.codigo_barras);
    }
    if (body.codigo_barras_interno !== undefined) {
      patch.codigo_barras_interno = body.codigo_barras_interno === true;
    }
    if (body.imagen_path !== undefined) {
      const v = body.imagen_path != null ? String(body.imagen_path) : "";
      patch.imagen_path = v || null;
    }
    if (body.imagen_url !== undefined) {
      const v = body.imagen_url != null ? String(body.imagen_url) : "";
      patch.imagen_url = v || null;
    }

    // Relaciones opcionales — validar ownership
    let categoriaCambia = false;
    let categoriaNueva: string | null = null;
    if (body.categoria_principal_id !== undefined) {
      const v = body.categoria_principal_id == null ? null : String(body.categoria_principal_id);
      if (v && !(await existsInTenantPostgrest(jwt, empresaId, "categorias_productos", v))) {
        return NextResponse.json(errorResponse("La categoría seleccionada no existe."), { status: 400 });
      }
      patch.categoria_principal_id = v;
      categoriaCambia = true;
      categoriaNueva = v;
    }
    if (body.ubicacion_principal_id !== undefined) {
      const v = body.ubicacion_principal_id == null ? null : String(body.ubicacion_principal_id);
      if (v && !(await existsInTenantPostgrest(jwt, empresaId, "inventario_ubicaciones", v))) {
        return NextResponse.json(errorResponse("La ubicación seleccionada no existe."), { status: 400 });
      }
      patch.ubicacion_principal_id = v;
    }
    if (body.proveedor_principal_id !== undefined) {
      const v = body.proveedor_principal_id == null ? null : String(body.proveedor_principal_id);
      if (v && !(await existsInTenantPostgrest(jwt, empresaId, "proveedores", v))) {
        return NextResponse.json(errorResponse("El proveedor seleccionado no existe."), { status: 400 });
      }
      patch.proveedor_principal_id = v;
    }

    // Campos web pública (Fase 1)
    if (body.slug_web !== undefined) {
      const v = typeof body.slug_web === "string" ? body.slug_web.trim().toLowerCase() : "";
      patch.slug_web = v || null;
    }
    if (body.visible_web !== undefined) patch.visible_web = body.visible_web === true;
    if (body.destacado_web !== undefined) patch.destacado_web = body.destacado_web === true;
    if (body.descripcion_corta !== undefined) {
      patch.descripcion_corta = typeof body.descripcion_corta === "string" ? body.descripcion_corta : null;
    }
    if (body.descripcion_web !== undefined) {
      patch.descripcion_web = typeof body.descripcion_web === "string" ? body.descripcion_web : null;
    }
    if (body.marca !== undefined) {
      patch.marca = typeof body.marca === "string" ? body.marca.trim() || null : null;
    }
    if (body.es_decant !== undefined) {
      patch.es_decant = body.es_decant === true;
    }
    if (body.marca_id !== undefined) {
      const v = body.marca_id == null ? null : String(body.marca_id);
      if (v && !(await existsInTenantPostgrest(jwt, empresaId, "marcas", v))) {
        return NextResponse.json(errorResponse("La marca seleccionada no existe."), { status: 400 });
      }
      patch.marca_id = v;
    }
    if (body.precio_web !== undefined) {
      const v = body.precio_web;
      if (v === null || v === "") patch.precio_web = null;
      else patch.precio_web = Number.isFinite(Number(v)) ? Number(v) : null;
    }

    // Precio mayorista informativo (Fase Mayorista). Validación cruzada al
    // final si visible=true.
    if (body.precio_mayorista !== undefined) {
      const v = body.precio_mayorista;
      if (v === null || v === "") patch.precio_mayorista = null;
      else {
        const n = Number(v);
        patch.precio_mayorista = Number.isFinite(n) && n >= 0 ? n : null;
      }
    }
    if (body.cantidad_minima_mayorista !== undefined) {
      const v = body.cantidad_minima_mayorista;
      if (v === null || v === "") patch.cantidad_minima_mayorista = null;
      else {
        const n = Number(v);
        patch.cantidad_minima_mayorista =
          Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
      }
    }
    if (body.visible_mayorista_web !== undefined) {
      patch.visible_mayorista_web = body.visible_mayorista_web === true;
    }
    // Validación cruzada: si quedaría visible=true, exigir precio y cant.
    if (patch.visible_mayorista_web === true) {
      // valores efectivos tras el patch
      const efPrecio =
        patch.precio_mayorista !== undefined
          ? patch.precio_mayorista
          : undefined; // se acepta también si ya está en BD
      const efMin =
        patch.cantidad_minima_mayorista !== undefined
          ? patch.cantidad_minima_mayorista
          : undefined;
      // Solo bloqueamos si en el body se setean explícitamente como null/0.
      if ((efPrecio !== undefined && (efPrecio == null || efPrecio <= 0)) ||
          (efMin !== undefined && (efMin == null || efMin < 1))) {
        return NextResponse.json(
          errorResponse(
            "Para mostrar el precio mayorista en la web cargá un precio > 0 y una cantidad mínima >= 1."
          ),
          { status: 400 }
        );
      }
    }

    // Catálogo enriquecido (Fase 1 catálogo)
    const numOrNull = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const strOrNull = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : v === null || v === "" ? null : null;

    if (body.precio_oferta !== undefined) patch.precio_oferta = numOrNull(body.precio_oferta);
    if (body.oferta_hasta !== undefined) patch.oferta_hasta = strOrNull(body.oferta_hasta);
    if (body.nuevo_hasta !== undefined) patch.nuevo_hasta = strOrNull(body.nuevo_hasta);
    if (body.concentracion !== undefined) {
      patch.concentracion = typeof body.concentracion === "string" ? body.concentracion.trim() || null : null;
    }
    if (body.volumen_ml !== undefined) {
      const v = numOrNull(body.volumen_ml);
      patch.volumen_ml = v == null ? null : Math.max(0, Math.floor(v));
    }
    if (body.genero !== undefined) {
      const g = typeof body.genero === "string" ? body.genero.trim().toLowerCase() : "";
      patch.genero = g === "masculino" || g === "femenino" || g === "unisex" ? g : null;
    }
    if (body.proximamente !== undefined) patch.proximamente = body.proximamente === true;
    if (body.orden_web !== undefined) {
      const v = numOrNull(body.orden_web);
      patch.orden_web = v == null ? null : Math.floor(v);
    }
    if (body.familia_olfativa_id !== undefined) {
      patch.familia_olfativa_id = strOrNull(body.familia_olfativa_id);
    }

    try {
      const row = await updateProductoPostgrest(jwt, empresaId, id, patch);
      if (!row) {
        return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
      }
      // Catálogo enriquecido: familia + notas (opt-in por body)
      try {
        const arr = (v: unknown): string[] =>
          Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim()) : [];
        const hasFamilia = body.familia_olfativa_nombre !== undefined;
        const hasNotas = body.notas_top !== undefined || body.notas_heart !== undefined || body.notas_base !== undefined;
        if (hasFamilia || hasNotas) {
          const familiaNombre = hasFamilia
            ? typeof body.familia_olfativa_nombre === "string"
              ? body.familia_olfativa_nombre.trim() || null
              : null
            : undefined;
          await syncCatalogoExtras(jwt, empresaId, id, {
            familia_nombre: familiaNombre,
            notas_top: body.notas_top !== undefined ? arr(body.notas_top) : undefined,
            notas_heart: body.notas_heart !== undefined ? arr(body.notas_heart) : undefined,
            notas_base: body.notas_base !== undefined ? arr(body.notas_base) : undefined,
          });
        }
      } catch (err) {
        console.error("[/api/productos/[id]] syncCatalogoExtras fallo", {
          empresaId, id,
          message: err instanceof Error ? err.message : String(err),
        });
      }

      // Sincronizar categoria principal en puente producto_categorias
      if (categoriaCambia) {
        try {
          await setCategoriaPrincipalPostgrest(jwt, empresaId, id, categoriaNueva);
        } catch (err) {
          console.error("[/api/productos/[id]] setCategoriaPrincipal fallo", {
            empresaId, id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Multi-sucursal: cuando admin edita "Stock actual" desde el form, ese
      // valor representa el TOTAL del producto. Lo bajamos a Principal en
      // producto_stock_sucursal — la diferencia con lo que ya hay en otras
      // sucursales. Si no alcanza (otras tienen más que el nuevo total),
      // devolvemos un warning pero no rompemos el PATCH ya hecho.
      let stockWarning: string | null = null;
      if (stockActualEdit !== null) {
        try {
          const pool = getChatPostgresPool();
          if (pool) {
            const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
            const tPSS = quoteSchemaTable(schema, "producto_stock_sucursal");
            const tS = quoteSchemaTable(schema, "sucursales");
            const principalRow = await pool.query<{ id: string }>(
              `SELECT id FROM ${tS} WHERE empresa_id=$1::uuid AND es_principal=true LIMIT 1`,
              [empresaId],
            );
            const principalId = principalRow.rows[0]?.id ?? null;
            if (principalId) {
              const otrasRow = await pool.query<{ s: number | string }>(
                `SELECT COALESCE(SUM(stock_actual), 0)::float8 AS s
                   FROM ${tPSS}
                  WHERE producto_id=$1::uuid AND sucursal_id <> $2::uuid`,
                [id, principalId],
              );
              const otrasSuma = Number(otrasRow.rows[0]?.s ?? 0);
              const principalTarget = stockActualEdit - otrasSuma;
              if (principalTarget < 0) {
                stockWarning =
                  `El stock total ingresado (${stockActualEdit}) es menor a lo que ya está ` +
                  `repartido en otras sucursales (${otrasSuma}). Principal quedó en 0.`;
              }
              await pool.query(
                `INSERT INTO ${tPSS} (producto_id, sucursal_id, stock_actual, stock_minimo, updated_at)
                   VALUES ($1::uuid, $2::uuid, $3::numeric, 0, now())
                 ON CONFLICT (producto_id, sucursal_id)
                   DO UPDATE SET stock_actual = EXCLUDED.stock_actual, updated_at = now()`,
                [id, principalId, Math.max(0, principalTarget)],
              );
            }
          }
        } catch (err) {
          console.error("[/api/productos/[id]] sync Principal pss fallo", {
            empresaId, id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return NextResponse.json(successResponse({ producto: rowToProductoApi(row), warning: stockWarning }));
    } catch (err) {
      if (err instanceof DuplicadoError) {
        return NextResponse.json(errorResponse(err.message), { status: 409 });
      }
      console.error("[/api/productos/[id] PATCH]", {
        empresaId,
        id,
        message: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string })?.code,
      });
      return NextResponse.json(
        errorResponse("No se pudo actualizar el producto. Revisá los datos e intentá nuevamente."),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/productos/[id] PATCH] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse("No se pudo actualizar el producto."),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/productos/[id]
 *
 * Hard delete: borra la fila de `productos`. Si hay FKs (ventas_items,
 * pedidos_web_items, etc.) PostgREST devuelve 409 y reportamos un mensaje
 * legible — el usuario tiene que dar de baja con el toggle "Activo" en su
 * lugar.
 */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    try {
      const qs = new URLSearchParams({
        empresa_id: `eq.${empresaId}`,
        id: `eq.${id}`,
      });
      const r = await postgrestDelete<ProductoRow>("productos", qs.toString(), {
        role: "jwt",
        jwt,
      });
      if (!r.ok) {
        const msg = String(r.error?.message ?? "");
        // FK violation → no se puede borrar duro, sugerir desactivar
        if (msg.includes("foreign key") || msg.includes("violates")) {
          return NextResponse.json(
            errorResponse(
              "No se puede borrar: el producto tiene ventas/pedidos asociados. Usá el toggle 'Activo' para ocultarlo en su lugar.",
            ),
            { status: 409 },
          );
        }
        throw new Error(msg || "DELETE PostgREST failed");
      }
      const rows = (r.rows ?? []) as ProductoRow[];
      if (!rows.length) {
        return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
      }
      return NextResponse.json(successResponse({ producto: rowToProductoApi(rows[0] as unknown as Parameters<typeof rowToProductoApi>[0]) }));
    } catch (err) {
      console.error("[/api/productos/[id] DELETE]", {
        empresaId,
        id,
        message: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        errorResponse("No se pudo borrar el producto."),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/productos/[id] DELETE] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse("No se pudo borrar el producto."),
      { status: 500 }
    );
  }
}
