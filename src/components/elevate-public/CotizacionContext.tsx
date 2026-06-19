"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Cotización USD/PYG vigente para la web pública Elevate.
 *
 * Provider que fetchea una sola vez el endpoint público
 * `/api/public/elevate/cotizacion` y expone el valor (Gs. por 1 USD) vía
 * `useCotizacion()`. Si no hay cotización cargada en el ERP o el fetch falla,
 * `cotizacion` queda en `null` y los componentes que muestran USD
 * (UsdEquivalent) deben omitir el render — degradación silenciosa.
 *
 * El fetch se hace client-side para que el layout siga siendo estático y no
 * obligue a SSR por request en cada navegación.
 */
type CotizacionContextValue = {
  cotizacion: number | null;
};

const CotizacionContext = createContext<CotizacionContextValue>({ cotizacion: null });

type ApiResponse = { cotizacion: { cotizacion: number; vigente_desde: string } | null };

export function CotizacionProvider({ children }: { children: ReactNode }) {
  const [cotizacion, setCotizacion] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/elevate/cotizacion", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json().catch(() => null)) as ApiResponse | null;
        const v = j?.cotizacion?.cotizacion;
        if (!cancelled && typeof v === "number" && Number.isFinite(v) && v > 0) {
          setCotizacion(v);
        }
      })
      .catch(() => {
        // Silencio: la web simplemente no mostrará USD.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ cotizacion }), [cotizacion]);
  return <CotizacionContext.Provider value={value}>{children}</CotizacionContext.Provider>;
}

export function useCotizacion(): number | null {
  return useContext(CotizacionContext).cotizacion;
}
