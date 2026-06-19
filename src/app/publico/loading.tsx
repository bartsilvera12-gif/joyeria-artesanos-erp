/**
 * Loading scoped a `/publico/*`. Devuelve `null` a propósito: en la web
 * pública NO queremos mostrar la pantalla Zentra del ERP (es marca interna
 * de Neura, no del cliente Elevate) cuando se carga o navega entre páginas.
 *
 * Al estar más cercano a las rutas públicas que `src/app/loading.tsx`, Next
 * lo prioriza y reemplaza al loading global solo para este árbol. El usuario
 * ve el HTML server-rendered apenas llega del server (streaming), sin
 * pantalla intermedia.
 *
 * El ERP (`/dashboard`, `/inventario`, etc.) sigue usando el loading global
 * de Zentra sin cambios.
 */
export default function PublicoLoading() {
  return null;
}
