# PORT_REPORT_2 — Porteo agresivo desde autorepuestos-felix-bogado

## Resumen TypeScript
- Baseline pre-porteo: 14 errores
- Estado actual: **12 errores** (todos pre-existentes, ninguno introducido por este porteo)
- `npx tsc --noEmit` ya no se rompe por nada de lo que portamos.

Los 12 errores remanentes son los mismos del baseline:
- `src/app/gastos/components/GastoModal.tsx` (variant prop) — dest-only legacy
- `src/app/usuarios/components/UsuarioDetalleClient.tsx`, `UsuarioNuevoForm.tsx` — dest-only legacy
- `src/desktop/pages/DashboardDesktop.tsx` (vendedor_usuario_id en ClienteRaw) — dest-only desktop
- `src/desktop/pages/EtiquetasDesktop.tsx` — referencia a `@/app/dashboard/etiquetas` que no existe
- `src/mobile/pages/AgendaMobile.tsx`, `GerenciaMobile.tsx` — hard-rule (`src/mobile/*`)
- `src/shared/hooks/useAgenda.ts`, `useGerencia.ts` — refieren módulos lib/agenda y lib/gerencia ausentes

## Archivos portados

### Pages prioritarios (estaban sin portar):
- `src/app/ventas/nueva/page.tsx`
- `src/app/compras/nueva/page.tsx`
- `src/app/clientes/nuevo/page.tsx` (con fix `SUPABASE_APP_SCHEMA as NEURA_CLIENT_SCHEMA`)
- `src/app/clientes/[id]/page.tsx` (mismo fix)
- `src/app/clientes/[id]/tipificacion/page.tsx`
- `src/app/clientes/[id]/estado-cuenta/page.tsx`
- `src/app/inventario/nuevo/page.tsx`
- `src/app/inventario/[id]/editar/page.tsx`
- `src/app/inventario/movimientos/nuevo/page.tsx`

### Componentes nuevos copiados del ref:
- `src/components/clientes/ClienteVehiculoEditor.tsx`
- `src/components/inventario/CompatibilidadVehicularEditor.tsx`
- `src/components/inventario/ProveedoresCostos.tsx`
- `src/components/inventario/ProductPickerModal.tsx` (sobrescrito; ahora con `precio_mayorista` / `precio_distribuidor` / `tipo_precio`)
- `src/components/ui/SearchableSelect.tsx`
- `src/components/AppLoadingScreen.tsx`
- `src/components/cobros/CobranzasResumenCards.tsx`
- `src/components/layout/MobileBottomNav.tsx`
- `src/components/BootContext.tsx` (sobrescrito — añade `mobileSidebarOpen` y `setMobileSidebarOpen`)

### Directorios nuevos copiados completos:
- `src/components/dashboard/`
- `src/components/proveedores/`
- `src/lib/cobros/`
- `src/lib/documentos/`
- `src/lib/entidades/`
- `src/lib/presupuestos/`
- `src/lib/produccion/`
- `src/lib/recetas/`
- `src/lib/recibos/server/`
- `src/lib/reportes/server/`
- `src/lib/unidades/`
- `src/app/presupuestos/`
- `src/app/_components/`
- `src/app/inventario/_components/`
- `src/app/configuracion/entidades-bancarias/`
- `src/app/dashboard/conversaciones/_components/`
- `src/app/dashboard/recetas/` (con fix NEURA_CLIENT_SCHEMA)

### Hooks nuevos:
- `src/hooks/useAutoClearFlag.ts`
- `src/hooks/useFacturaSifenEstados.ts`

### lib/* archivos individuales:
- `src/lib/compras/comprobante-storage.ts` (nuevo)
- `src/lib/compras/storage.ts`, `types.ts` (sobrescritos)
- `src/lib/clientes/storage.ts`, `types.ts`, `tipo-servicio-catalogo.ts` (sobrescritos)
- `src/lib/ventas/storage.ts`, `types.ts` (sobrescritos)
- `src/lib/ventas/server/pago-detalle-pg.ts` (nuevo)
- `src/lib/chat/debug-log.ts` (nuevo)
- `src/lib/modulos/module-access-cache.ts` (nuevo)
- `src/app/loading.tsx` (nuevo)

### Archivos diferentes copiados (no hard-rule):
- Todos los 37 archivos diff en `src/app/**` (excepto branding: layout.tsx, globals.css, page.tsx, login/page.tsx, icon.png, apple-icon.png, favicon.ico)
- Todos los 16 archivos diff en `src/components/**`
- Todos los 22 archivos diff en `src/lib/**` (excepto los que rompían build, ver abajo)

## Archivos RESTAURADOS del HEAD (rollback) porque rompían build

El ref tenía versiones más viejas que regresionaban funcionalidad joyería-específica:

- `src/lib/inventario/imagen-storage.ts` — ref no tenía `publicProductoImagenUrl` ni `isManagedBucketPath` (joyería las usa)
- `src/lib/inventario/types.ts` — ref no tenía campos de catálogo web joyería (`slug_web`, `visible_web`, `marca_id`, `precio_oferta`, `concentracion`, `volumen_ml`, `genero`, `proximamente`, `tiene_presentaciones`, `es_decant`, etc.)
- `src/lib/inventario/storage.ts` — depende de los tipos de arriba
- `src/lib/inventario/server/productos-pg.ts` — depende
- `src/lib/proyectos/brief-data.ts` — la firma de `applyBriefFormToExisting` cambió (ref tenía 2 args, dest usa 3 con `briefLists`)
- `src/lib/api/client.ts` — ref no exportaba `DuplicadoMatchClient`, `HistorialClienteFila`, `apiGetClienteHistorial` (dest sí los usa)
- `src/lib/fechas/calendario.ts` — ref no tenía `vencimientoPeriodo`
- `src/lib/ventas/server/create-venta-pg.ts` — ref no tenía `es_sin_cargo` / `motivo_sin_cargo` ni `FaltanteStock`
- `src/lib/compras/server/compras-pg.ts` — depende del schema joyería

## Types extendidos

- `src/lib/inventario/types.ts` — añadidos como `?` opcionales al final de `Producto`: `precio_distribuidor`, `codigo_oem`, `codigo_alternativo`, `marca_repuesto`, `garantia_meses`, `distribuidor_comision_pct`, `permitir_venta_sin_stock`, `descripcion`, `valorizado`, `unidad_compra`, `unidad_receta`, `factor_compra_receta`, `tiempo_prep_minutos`. Estos campos no se persisten en la DB de joyería; quedarán `undefined` en runtime. No es problema de TS.
- `src/lib/api/client.ts` — añadido `usa_nota_remision?: boolean` al body de `apiCreateCliente` (el formulario clientes/nuevo lo manda).

## Workarounds por hard-rule

- En `src/lib/supabase/schema.ts` no se exporta `NEURA_CLIENT_SCHEMA` (sí `SUPABASE_APP_SCHEMA`). Los siguientes archivos fueron modificados con `import { SUPABASE_APP_SCHEMA as NEURA_CLIENT_SCHEMA } from "@/lib/supabase/schema"`:
  - `src/app/clientes/nuevo/page.tsx`
  - `src/app/clientes/[id]/page.tsx`
  - `src/app/dashboard/recetas/[id]/page.tsx`
  - `src/app/dashboard/recetas/nueva/page.tsx`

  Resultado: el flag `SIMPLE_CLIENTE = NEURA_CLIENT_SCHEMA === "reservacaacupe"` quedará `false` en joyería (su `SUPABASE_APP_SCHEMA` por defecto es `"elevate"`).

## Dependencias DB que quedan con `undefined` en runtime

Los campos opcionales agregados a `Producto` (codigo_oem, marca_repuesto, garantia_meses, etc.) no existen en el schema `joyeriaartesanos`. Los formularios portados los leerán como `undefined` y al guardar no los enviarán. Si se quisieran usar habría que correr migración DB. Por ahora: compila y no rompe.

## NO se hizo commit ni push.
