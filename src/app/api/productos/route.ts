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
  insertProductoPostgrest,
  insertMovimientoInicialPostgrest,
  setCategoriaPrincipalPostgrest,
} from "@/lib/inventario/server/productos-postgrest";
import { normalizeUpperText, normalizeUpperCodigoBarras } from "@/lib/text/normalize";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { syncCatalogoExtras } from "@/lib/inventario/server/catalogo-web-extras";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";

/** Campos de presentación en la página web pública — solo admin los maneja. */
const WEB_ONLY_FIELDS = [
  "slug_web", "visible_web", "destacado_web",
  "descripcion_corta", "descripcion_web",
  "marca", "marca_id", "precio_web",
  "precio_oferta", "oferta_hasta", "nuevo_hasta",
  "concentracion", "volumen_ml", "genero",
  "proximamente", "orden_web", "familia_olfativa_id",
  "familia_olfativa_nombre", "notas_top", "notas_heart", "notas_base",
  "visible_mayorista_web", "es_decant",
] as const;

const PRODUCTOS_COLS_PRIV =
  "id,empresa_id,nombre,sku,modelo,costo_promedio,precio_venta,stock_actual,stock_minimo," +
  "cantidad_minima_minorista," +
  "unidad_medida,metodo_valuacion,activo,created_at,updated_at," +
  "codigo_barras,codigo_barras_interno,imagen_path,imagen_url," +
  "categoria_principal_id,ubicacion_principal_id,proveedor_principal_id," +
  "slug_web,visible_web,destacado_web,descripcion_corta,descripcion_web,marca,marca_id,precio_web,precio_mayorista,cantidad_minima_mayorista,visible_mayorista_web," +
  "precio_oferta,oferta_hasta,nuevo_hasta,concentracion,volumen_ml,genero," +
  "proximamente,orden_web,familia_olfativa_id,tiene_presentaciones,es_decant";

/**
 * GET /api/productos — lista de productos activos.
 *
 * Transporte: PostgREST HTTPS con el JWT del usuario. La policy
 * `productos_select USING puede_acceder_empresa(empresa_id)` aplica RLS por
 * empresa. El filtro explícito empresa_id=eq.X es defensivo (defense in
 * depth) en caso de que la policy se relaje en el futuro.
 *
 * NO usa pg pool — en Hostinger hPanel el puerto 5432 está firewalled y
 * `SUPABASE_DB_URL` solo es válida para scripts/migraciones por SSH.
 */
export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      console.log(`[diag-prod] ctx=null status=401 ms=${Date.now() - t0}`);
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: PRODUCTOS_COLS_PRIV,
      empresa_id: `eq.${empresaId}`,
      activo: "eq.true",
      order: "nombre.asc",
      limit: "1000",
    });
    const r = await postgrestGet<Record<string, unknown>>("productos", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    console.log(
      `[diag-prod] empresaId=${empresaId} jwt_present=${!!jwt} pg_ok=${r.ok} rows=${
        r.ok ? r.rows.length : -1
      }${r.ok ? "" : " err=" + (r.error?.message ?? "?")} ms=${Date.now() - t0}`
    );
    if (!r.ok) {
      console.error("[/api/productos GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar los productos."), { status: 502 });
    }

    // Multi-sucursal: si el usuario tiene sucursal_id, mostrar SU stock en
    // stock_actual (no el agregado) Y filtrar a SOLO los productos que están
    // efectivamente asignados a esa sucursal (es decir, que tienen una fila en
    // producto_stock_sucursal). Sin esto el operativo veía todo el catálogo
    // del admin.
    //
    // Para admin (sin sucursal_id): adjunto un campo `sucursales` por producto
    // con la lista de sucursales donde está cargado, para mostrar la columna
    // "Ubicación" en la lista de inventario.
    let productos = r.rows;
    if (!ctx.auth.sucursal_id && productos.length) {
      try {
        const ids = productos.map((p) => String((p as { id?: string }).id ?? "")).filter(Boolean);
        const qss = new URLSearchParams();
        qss.set("select", "producto_id,sucursal_id,stock_actual,sucursal:sucursales(nombre,es_principal)");
        qss.set("producto_id", `in.(${ids.join(",")})`);
        const rs = await postgrestGet<{
          producto_id: string; sucursal_id: string; stock_actual: number | string;
          sucursal?: { nombre: string; es_principal: boolean } | null;
        }>("producto_stock_sucursal", qss.toString(), { role: "jwt", jwt, noStore: true });
        if (rs.ok) {
          const byProducto = new Map<string, { sucursal_id: string; nombre: string; es_principal: boolean; stock_actual: number }[]>();
          for (const row of rs.rows) {
            const arr = byProducto.get(row.producto_id) ?? [];
            arr.push({
              sucursal_id: row.sucursal_id,
              nombre: row.sucursal?.nombre ?? "",
              es_principal: row.sucursal?.es_principal === true,
              stock_actual: Number(row.stock_actual ?? 0),
            });
            byProducto.set(row.producto_id, arr);
          }
          productos = productos.map((p) => {
            const id = (p as { id?: string }).id;
            return { ...p, sucursales: id ? (byProducto.get(id) ?? []) : [] };
          });
        }
      } catch { /* schema sin sucursales: dejar sin campo */ }
    }
    if (ctx.auth.sucursal_id && productos.length) {
      try {
        const ids = productos.map((p) => String((p as { id?: string }).id ?? "")).filter(Boolean);
        const qss = new URLSearchParams();
        qss.set("select", "producto_id,stock_actual,stock_minimo");
        qss.set("sucursal_id", `eq.${ctx.auth.sucursal_id}`);
        qss.set("producto_id", `in.(${ids.join(",")})`);
        const rs = await postgrestGet<{ producto_id: string; stock_actual: number | string; stock_minimo: number | string | null }>(
          "producto_stock_sucursal",
          qss.toString(),
          { role: "jwt", jwt, noStore: true },
        );
        if (rs.ok) {
          const byId = new Map(rs.rows.map((row) => [row.producto_id, row]));
          productos = productos
            .filter((p) => {
              const id = (p as { id?: string }).id;
              return id ? byId.has(id) : false;
            })
            .map((p) => {
              const id = (p as { id?: string }).id;
              const ss = id ? byId.get(id) : undefined;
              return {
                ...p,
                stock_actual: ss ? Number(ss.stock_actual ?? 0) : 0,
                stock_minimo: ss && ss.stock_minimo != null ? Number(ss.stock_minimo) : (p as { stock_minimo?: number }).stock_minimo,
              };
            });
        }
      } catch { /* schema sin sucursales: dejar agregado */ }
    }
    return NextResponse.json(successResponse({ productos }));
  } catch (err) {
    console.error("[/api/productos GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los productos."), { status: 500 });
  }
}
/**
 * POST /api/productos
 *
 * Alta vía PostgREST HTTPS con JWT del usuario. RLS por empresa cubre
 * autorización. Si stock_actual > 0, graba movimiento ENTRADA inventario_inicial
 * (best-effort: si falla devuelve warning sin perder el producto).
 */
export async function POST(request: NextRequest) {
  try {
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

    // Guard: operativos de sucursal no pueden tocar campos de la página web.
    const authRol = await getAuthWithRol(request);
    if (!isAdmin(authRol)) {
      for (const k of WEB_ONLY_FIELDS) {
        if (k in body) delete body[k];
      }
    }

    const nombre = normalizeUpperText(body.nombre);
    const sku = normalizeUpperText(body.sku);
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    if (!sku) return NextResponse.json(errorResponse("El SKU es obligatorio."), { status: 400 });

    const modelo = typeof body.modelo === "string" ? body.modelo.trim().toUpperCase() || null : null;
    const codigoBarras = normalizeUpperCodigoBarras(body.codigo_barras);
    const codigoBarrasInterno = codigoBarras != null && body.codigo_barras_interno === true;
    const stockActual = Number(body.stock_actual ?? 0) || 0;
    // Multi-sucursal: si el form (o el usuario operativo) trae sucursal_id,
    // el stock_actual se imputa a esa sucursal. Usuarios con sucursal_id
    // propia no pueden saltar a otra: se fuerza la suya.
    const sucursalIdDestino =
      ctx.auth.sucursal_id ?? (typeof body.sucursal_id === "string" && body.sucursal_id.trim() ? String(body.sucursal_id) : null);
    const costoPromedio = Number(body.costo_promedio ?? 0) || 0;
    const stockMinimo = Number(body.stock_minimo ?? 0) || 0;
    const precioVenta = Number(body.precio_venta ?? 0) || 0;
    // cantidad_minima_minorista: nullable, > 0 si presente
    const cantMinMinRaw = Number(body.cantidad_minima_minorista);
    const cantidadMinimaMinorista =
      body.cantidad_minima_minorista == null || body.cantidad_minima_minorista === ""
        ? null
        : Number.isFinite(cantMinMinRaw) && cantMinMinRaw >= 1
          ? Math.floor(cantMinMinRaw)
          : null;
    // activo: default true al crear (queda dado de alta).
    const activo = body.activo === false ? false : true;
    const unidadMedida = normalizeUpperText(body.unidad_medida) || "UNIDAD";
    const metodoValuacion =
      body.metodo_valuacion === "FIFO" || body.metodo_valuacion === "LIFO"
        ? (body.metodo_valuacion as "FIFO" | "LIFO")
        : "CPP";

    // Relaciones opcionales — validar ownership en mismo tenant
    const categoriaPrincipalId = body.categoria_principal_id ? String(body.categoria_principal_id) : null;
    const ubicacionPrincipalId = body.ubicacion_principal_id ? String(body.ubicacion_principal_id) : null;
    const proveedorPrincipalId = body.proveedor_principal_id ? String(body.proveedor_principal_id) : null;

    if (categoriaPrincipalId && !(await existsInTenantPostgrest(jwt, empresaId, "categorias_productos", categoriaPrincipalId))) {
      return NextResponse.json(errorResponse("La categoría seleccionada no existe."), { status: 400 });
    }
    if (ubicacionPrincipalId && !(await existsInTenantPostgrest(jwt, empresaId, "inventario_ubicaciones", ubicacionPrincipalId))) {
      return NextResponse.json(errorResponse("La ubicación seleccionada no existe."), { status: 400 });
    }
    if (proveedorPrincipalId && !(await existsInTenantPostgrest(jwt, empresaId, "proveedores", proveedorPrincipalId))) {
      return NextResponse.json(errorResponse("El proveedor seleccionado no existe."), { status: 400 });
    }

    // marca_id opcional (Fase Marcas): si vino, validar ownership.
    const marcaId = body.marca_id ? String(body.marca_id) : null;
    if (marcaId && !(await existsInTenantPostgrest(jwt, empresaId, "marcas", marcaId))) {
      return NextResponse.json(errorResponse("La marca seleccionada no existe."), { status: 400 });
    }

    // Campos web pública (Fase 1) — opt-in; defaults false/null.
    const slugWeb = typeof body.slug_web === "string" ? body.slug_web.trim().toLowerCase() || null : null;
    const visibleWeb = body.visible_web === true;
    const destacadoWeb = body.destacado_web === true;
    const descripcionCorta = typeof body.descripcion_corta === "string" ? body.descripcion_corta : null;
    const descripcionWeb = typeof body.descripcion_web === "string" ? body.descripcion_web : null;
    const marca = typeof body.marca === "string" ? body.marca.trim() || null : null;
    const precioWebRaw = body.precio_web;
    const precioWeb = precioWebRaw == null || precioWebRaw === ""
      ? null
      : Number.isFinite(Number(precioWebRaw))
        ? Number(precioWebRaw)
        : null;

    // Catálogo enriquecido (Fase 1 catálogo) — todos opt-in
    const num = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    const generoRaw = str(body.genero)?.toLowerCase();
    const genero = generoRaw === "masculino" || generoRaw === "femenino" || generoRaw === "unisex" ? generoRaw : null;
    // Precio mayorista informativo (Fase Mayorista). Si visible=true, exigimos
    // que los otros dos campos tengan valores válidos.
    const mayorPrecioRaw = num(body.precio_mayorista);
    const mayorPrecio =
      mayorPrecioRaw == null || mayorPrecioRaw < 0 ? null : mayorPrecioRaw;
    const mayorMinRaw = num(body.cantidad_minima_mayorista);
    const mayorMin =
      mayorMinRaw == null || mayorMinRaw < 1 ? null : Math.floor(mayorMinRaw);
    const mayorVisible = body.visible_mayorista_web === true;
    if (mayorVisible && (mayorPrecio == null || mayorPrecio <= 0 || mayorMin == null || mayorMin < 1)) {
      return NextResponse.json(
        errorResponse(
          "Para mostrar el precio mayorista en la web cargá un precio > 0 y una cantidad mínima >= 1."
        ),
        { status: 400 }
      );
    }
    const precioOferta = num(body.precio_oferta);
    const ofertaHasta = str(body.oferta_hasta);
    const nuevoHasta = str(body.nuevo_hasta);
    const concentracion = str(body.concentracion);
    const volumenMl = num(body.volumen_ml);
    const proximamente = body.proximamente === true;
    const ordenWeb = num(body.orden_web);
    const familiaOlfativaId = str(body.familia_olfativa_id);
    const esDecant = body.es_decant === true;

    try {
      // En modo per-sucursal arrancamos el agregado en 0 y el trigger
      // sync_producto_stock_total lo reconcilia tras el upsert de stock.
      const stockActualParaProducto = sucursalIdDestino ? 0 : stockActual;

      const row = await insertProductoPostgrest(jwt, empresaId, {
        nombre,
        sku,
        modelo,
        costo_promedio: costoPromedio,
        precio_venta: precioVenta,
        stock_actual: stockActualParaProducto,
        stock_minimo: stockMinimo,
        cantidad_minima_minorista: cantidadMinimaMinorista,
        unidad_medida: unidadMedida,
        metodo_valuacion: metodoValuacion,
        activo,
        codigo_barras: codigoBarras,
        codigo_barras_interno: codigoBarrasInterno,
        categoria_principal_id: categoriaPrincipalId,
        ubicacion_principal_id: ubicacionPrincipalId,
        proveedor_principal_id: proveedorPrincipalId,
        slug_web: slugWeb,
        visible_web: visibleWeb,
        destacado_web: destacadoWeb,
        descripcion_corta: descripcionCorta,
        descripcion_web: descripcionWeb,
        marca,
        marca_id: marcaId,
        precio_web: precioWeb,
        precio_mayorista: mayorPrecio,
        cantidad_minima_mayorista: mayorMin,
        visible_mayorista_web: mayorVisible,
        precio_oferta: precioOferta,
        oferta_hasta: ofertaHasta,
        nuevo_hasta: nuevoHasta,
        concentracion,
        volumen_ml: volumenMl == null ? null : Math.max(0, Math.floor(volumenMl)),
        genero,
        proximamente,
        orden_web: ordenWeb == null ? null : Math.floor(ordenWeb),
        familia_olfativa_id: familiaOlfativaId,
        es_decant: esDecant,
      });

      // Multi-sucursal: crear filas per-sucursal con reparto explícito.
      //   - `stock_por_sucursal`: mapa sucursal_id→stock (no-principal). Lo
      //     asignado a otras sucursales se descuenta de Principal.
      //   - `incluir_sucursales`: lista a incluir (con stock=0 si no hay
      //     entrada en stock_por_sucursal). Principal va siempre con
      //     `stockActual - sum(otras)`.
      //   El trigger sync_producto_stock_total reconcilia productos.stock_actual.
      try {
        const incluirRaw = Array.isArray(body.incluir_sucursales) ? body.incluir_sucursales : [];
        const incluir = (incluirRaw as unknown[])
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        const stockMap: Record<string, number> = {};
        if (body.stock_por_sucursal && typeof body.stock_por_sucursal === "object") {
          for (const [k, v] of Object.entries(body.stock_por_sucursal as Record<string, unknown>)) {
            const n = Number(v);
            if (typeof k === "string" && k && Number.isFinite(n) && n >= 0) {
              stockMap[k] = n;
            }
          }
        }
        const setSucursales = new Set<string>([...incluir, ...Object.keys(stockMap)]);
        if (sucursalIdDestino) setSucursales.add(sucursalIdDestino);

        if (setSucursales.size > 0) {
          const pool = getChatPostgresPool();
          if (pool) {
            const schema = assertAllowedChatDataSchema(
              await fetchDataSchemaForEmpresaId(empresaId),
            );
            const tPSS = quoteSchemaTable(schema, "producto_stock_sucursal");
            const tS = quoteSchemaTable(schema, "sucursales");
            // Validar ownership y separar Principal del resto.
            const valid = await pool.query<{ id: string; es_principal: boolean }>(
              `SELECT id::text, es_principal FROM ${tS}
                WHERE empresa_id=$1::uuid
                  AND id::text = ANY($2::text[])`,
              [empresaId, [...setSucursales]],
            );
            const principalRow = await pool.query<{ id: string }>(
              `SELECT id::text FROM ${tS} WHERE empresa_id=$1::uuid AND es_principal=true LIMIT 1`,
              [empresaId],
            );
            const principalId = principalRow.rows[0]?.id ?? null;
            const validIds = new Set(valid.rows.map((r) => r.id));

            // Reparto: cuánto a cada no-principal y cuánto queda en Principal.
            let asignadoFueraPrincipal = 0;
            for (const sid of validIds) {
              if (sid === principalId) continue;
              const cant = stockMap[sid] ?? 0;
              asignadoFueraPrincipal += cant;
            }
            const stockPrincipal = Math.max(0, stockActual - asignadoFueraPrincipal);

            for (const sid of validIds) {
              const esPrincipal = sid === principalId;
              const stockParaFila = esPrincipal ? stockPrincipal : (stockMap[sid] ?? 0);
              const minimoParaFila = esPrincipal ? stockMinimo : 0;
              await pool.query(
                `INSERT INTO ${tPSS} (producto_id, sucursal_id, stock_actual, stock_minimo, updated_at)
                   VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric, now())
                 ON CONFLICT (producto_id, sucursal_id)
                   DO UPDATE SET stock_actual = EXCLUDED.stock_actual,
                                 stock_minimo = EXCLUDED.stock_minimo,
                                 updated_at   = now()`,
                [row.id, sid, stockParaFila, minimoParaFila],
              );
            }
          }
        }
      } catch (e) {
        console.error("[/api/productos] upsert producto_stock_sucursal fallo", {
          empresaId, productoId: row.id, sucursalIdDestino,
          message: e instanceof Error ? e.message : String(e),
        });
      }

      // Inventario inicial (mismo schema, via PG directo).
      // Si falla aqui, el producto YA fue creado — registramos el error en
      // logs y devolvemos warning al cliente, pero no perdemos el producto.
      let movWarning: string | null = null;
      if (stockActual > 0) {
        try {
          await insertMovimientoInicialPostgrest(jwt, empresaId, {
            producto_id: row.id,
            producto_nombre: row.nombre,
            producto_sku: row.sku,
            cantidad: stockActual,
            costo_unitario: costoPromedio,
            created_by: ctx.auth.usuarioCatalogId ?? null,
            usuario_nombre: ctx.auth.user?.email ?? null,
          });
        } catch (movErr) {
          const message = movErr instanceof Error ? movErr.message : String(movErr);
          console.error("[/api/productos] inventario_inicial fallo", {
            empresaId, productoId: row.id, message,
          });
          movWarning = "El producto se guardó pero no se pudo registrar el movimiento inicial de stock.";
        }
      }

      // Categoria principal: tambien insertar en puente producto_categorias.
      if (categoriaPrincipalId) {
        try {
          await setCategoriaPrincipalPostgrest(jwt, empresaId, row.id, categoriaPrincipalId);
        } catch (err) {
          console.error("[/api/productos] setCategoriaPrincipal fallo", {
            empresaId, productoId: row.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Catálogo enriquecido: familia + notas (best-effort, no rompe alta).
      try {
        const familiaNombre = typeof body.familia_olfativa_nombre === "string" ? body.familia_olfativa_nombre.trim() : null;
        const arr = (v: unknown): string[] =>
          Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim()) : [];
        const notas_top = arr(body.notas_top);
        const notas_heart = arr(body.notas_heart);
        const notas_base = arr(body.notas_base);
        if (familiaNombre !== null || notas_top.length || notas_heart.length || notas_base.length) {
          await syncCatalogoExtras(jwt, empresaId, row.id, {
            familia_nombre: familiaNombre,
            notas_top,
            notas_heart,
            notas_base,
          });
        }
      } catch (err) {
        console.error("[/api/productos] syncCatalogoExtras fallo", {
          empresaId, productoId: row.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }

      // Stock inicial por ubicacion: omitido en esta versión PostgREST. La
      // tabla inventario_stock_ubicacion sigue accesible vía PG pool en
      // entornos con SUPABASE_DB_URL alcanzable; en Hostinger se carga
      // desde Inventario → Stock por ubicación. No bloquea la creación.
      void ubicacionPrincipalId;

      return NextResponse.json(
        successResponse({ producto: rowToProductoApi(row), warning: movWarning })
      );
    } catch (err) {
      if (err instanceof DuplicadoError) {
        return NextResponse.json(errorResponse(err.message), { status: 409 });
      }
      console.error("[/api/productos POST]", {
        empresaId,
        message: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string })?.code,
      });
      return NextResponse.json(
        errorResponse("No se pudo guardar el producto. Revisá los datos e intentá nuevamente."),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/productos POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse("No se pudo guardar el producto. Revisá los datos e intentá nuevamente."),
      { status: 500 }
    );
  }
}
