/**
 * Sincronización de familia olfativa + pirámide de notas para un producto.
 *
 * Se llama desde POST/PATCH /api/productos despues de upsert del producto.
 * Usa PostgREST HTTPS con el JWT del usuario para respetar RLS por empresa.
 *
 * Comportamiento:
 *   - Si `familia_nombre` se pasa: find-or-create en familias_olfativas y
 *     actualiza `productos.familia_olfativa_id`.
 *   - Si `notas_*` se pasa (puede ser []): para cada posición, sincroniza
 *     producto_notas — elimina las que ya existen, inserta las nuevas (find-or-create
 *     en notas_olfativas).
 *
 * Errores: se loguean pero NO interrumpen el flujo del producto principal.
 * El producto ya está guardado; estos extras son best-effort.
 */
import { postgrestRequest } from "@/lib/supabase/postgrest-runtime";

type Position = "top" | "heart" | "base";

export interface CatalogoExtrasInput {
  familia_nombre?: string | null;
  notas_top?: string[];
  notas_heart?: string[];
  notas_base?: string[];
}

async function findOrCreateFamilia(
  jwt: string | null,
  empresaId: string,
  nombre: string
): Promise<string | null> {
  // 1) Buscar
  const qs = new URLSearchParams({
    select: "id",
    empresa_id: `eq.${empresaId}`,
    nombre: `eq.${nombre}`,
    limit: "1",
  });
  const found = await postgrestRequest<{ id: string }>(
    "familias_olfativas",
    qs.toString(),
    { method: "GET", role: "jwt", jwt }
  );
  if (found.ok && found.rows[0]?.id) return found.rows[0].id;

  // 2) Crear
  const created = await postgrestRequest<{ id: string }>("familias_olfativas", "", {
    method: "POST",
    role: "jwt",
    jwt,
    body: { empresa_id: empresaId, nombre, activo: true },
    prefer: "return=representation",
  });
  if (created.ok && created.rows[0]?.id) return created.rows[0].id;
  return null;
}

async function findOrCreateNota(
  jwt: string | null,
  empresaId: string,
  nombre: string
): Promise<string | null> {
  const qs = new URLSearchParams({
    select: "id",
    empresa_id: `eq.${empresaId}`,
    nombre: `eq.${nombre}`,
    limit: "1",
  });
  const found = await postgrestRequest<{ id: string }>("notas_olfativas", qs.toString(), {
    method: "GET",
    role: "jwt",
    jwt,
  });
  if (found.ok && found.rows[0]?.id) return found.rows[0].id;

  const created = await postgrestRequest<{ id: string }>("notas_olfativas", "", {
    method: "POST",
    role: "jwt",
    jwt,
    body: { empresa_id: empresaId, nombre, activo: true },
    prefer: "return=representation",
  });
  if (created.ok && created.rows[0]?.id) return created.rows[0].id;
  return null;
}

async function setFamiliaInProducto(
  jwt: string | null,
  empresaId: string,
  productoId: string,
  familiaId: string | null
): Promise<void> {
  const qs = new URLSearchParams({
    id: `eq.${productoId}`,
    empresa_id: `eq.${empresaId}`,
  });
  await postgrestRequest("productos", qs.toString(), {
    method: "PATCH",
    role: "jwt",
    jwt,
    body: { familia_olfativa_id: familiaId },
  });
}

async function replaceNotasPos(
  jwt: string | null,
  empresaId: string,
  productoId: string,
  pos: Position,
  nombres: string[]
): Promise<void> {
  // 1) Borrar las existentes para esta posición
  const del = new URLSearchParams({
    producto_id: `eq.${productoId}`,
    posicion: `eq.${pos}`,
  });
  await postgrestRequest("producto_notas", del.toString(), {
    method: "DELETE",
    role: "jwt",
    jwt,
  });
  // 2) Insertar las nuevas
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < nombres.length; i++) {
    const id = await findOrCreateNota(jwt, empresaId, nombres[i]);
    if (id) rows.push({ producto_id: productoId, nota_id: id, posicion: pos, orden: i + 1 });
  }
  if (rows.length === 0) return;
  await postgrestRequest("producto_notas", "", {
    method: "POST",
    role: "jwt",
    jwt,
    body: rows,
  });
}

/**
 * Punto de entrada. Best-effort: cualquier error se logea pero no aborta.
 */
export async function syncCatalogoExtras(
  jwt: string | null,
  empresaId: string,
  productoId: string,
  extras: CatalogoExtrasInput
): Promise<{ familia_id: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  let familiaId: string | null = null;

  try {
    if (extras.familia_nombre !== undefined) {
      if (extras.familia_nombre && extras.familia_nombre.trim()) {
        familiaId = await findOrCreateFamilia(jwt, empresaId, extras.familia_nombre.trim());
        if (familiaId) {
          await setFamiliaInProducto(jwt, empresaId, productoId, familiaId);
        } else {
          warnings.push("No se pudo crear/asociar la familia olfativa.");
        }
      } else {
        await setFamiliaInProducto(jwt, empresaId, productoId, null);
      }
    }
  } catch (e) {
    warnings.push(
      "Familia olfativa: " + (e instanceof Error ? e.message : "error desconocido")
    );
  }

  for (const [pos, list] of [
    ["top", extras.notas_top] as const,
    ["heart", extras.notas_heart] as const,
    ["base", extras.notas_base] as const,
  ]) {
    if (list === undefined) continue;
    try {
      await replaceNotasPos(jwt, empresaId, productoId, pos, list);
    } catch (e) {
      warnings.push(
        `Notas ${pos}: ` + (e instanceof Error ? e.message : "error desconocido")
      );
    }
  }

  return { familia_id: familiaId, warnings };
}
