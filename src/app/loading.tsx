import { ZentraLoadingScreen } from "@/components/ui/ZentraLoadingScreen";

/**
 * Loading global del App Router. Se muestra automáticamente mientras
 * Next.js carga una ruta server-side (page.tsx + data fetching). Cubre
 * el caso de "pantalla vacía" o "salto brusco" al navegar entre páginas
 * del ERP. Capa client-side de cada ruta puede mostrar sus propios
 * skeletons después del primer paint.
 */
export default function GlobalLoading() {
  return <ZentraLoadingScreen />;
}
