# Toggles rápidos en lista de Inventario

## Archivos modificados

- `src/desktop/pages/InventarioDesktop.tsx`
  - Import de `useCallback` + iconos lucide-react (`Check`, `X`, `Eye`, `EyeOff`, `Star`, `Trash2`).
  - Estado `mutandoIds: Set<string>` para marcar filas con mutación en curso.
  - Helpers `toggleFlag` y `borrarProducto`:
    - `toggleFlag` hace optimistic update local + `PATCH /api/productos/:id` con `{ [campo]: nuevoValor }`. Si falla, dispara `setRefreshKey` para volver al estado real.
    - `borrarProducto` pide confirmación con `window.confirm`, hace `DELETE /api/productos/:id` y refresca la lista.
  - Nueva columna "Acciones" antes de "Editar" con 4 botones por fila:
    - Activo (`Check`/`X`, verde/gris).
    - Visible web (`Eye`/`EyeOff`, verde/gris).
    - Destacado (`Star` con fill ámbar cuando true).
    - Borrar (`Trash2`, rojo).
  - Loading state: contenedor con `opacity-60` + botones `disabled` mientras la fila está mutando.
  - `colSpan` de los rows de "Cargando…" y "Sin resultados" actualizado de 10 → 11.

- `src/app/api/productos/[id]/route.ts`
  - Agregado handler `DELETE` que hace soft-delete (`updateProductoPostgrest(..., { activo: false })`). Más seguro que un hard DELETE en producción por las FKs (ventas_items, pedidos_web_items, etc.). Auth + empresa cubiertos por `getTenantSupabaseFromAuth` + RLS, igual que el PATCH.

## Endpoint creado

- `DELETE /api/productos/[id]` — agregado al archivo existente (no se creó un archivo nuevo bajo `src/app/api/inventario/productos/[id]/route.ts` porque el endpoint `PATCH` ya vivía en `/api/productos/[id]` y ya aceptaba los tres campos `{ activo, visible_web, destacado_web }` en el body). Reutilizar el endpoint existente evita duplicar validaciones/normalizaciones.

## TypeScript

- Baseline (antes de los cambios): **12 errores**.
- Después de los cambios: **12 errores** — sin regresión.
- Los 12 errores preexistentes son ajenos al porteo (módulos faltantes en `agenda`, `gerencia`, etiquetas; UsuarioForm; GastoModal; DashboardDesktop `vendedor_usuario_id`).

## Restricciones respetadas

- No se tocó `route-slug-map.ts`, `resolve-effective-modules.ts`, `AuthGuard.tsx`, `Sidebar.tsx`, `BootContext.tsx`, middleware, supabase libs ni auth libs.
- No se commiteó ni pusheó nada.
