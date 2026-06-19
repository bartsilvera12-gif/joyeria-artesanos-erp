"use client";

import { useCotizacion } from "./CotizacionContext";

/**
 * Muestra el equivalente aproximado en USD para un precio en guaraníes.
 *
 * Renderiza `≈ USD 65,00` debajo del precio principal en Gs. Si no hay
 * cotización válida cargada en el ERP, NO renderiza nada (degradación
 * silenciosa: nunca aparece NaN/Infinity/error).
 *
 * El estilo es discreto y elegante para alinearse con el theme Elevate.
 */
export function UsdEquivalent({
  priceGs,
  className = "",
}: {
  priceGs: number;
  className?: string;
}) {
  const cotizacion = useCotizacion();
  if (!cotizacion || cotizacion <= 0) return null;
  if (!Number.isFinite(priceGs) || priceGs <= 0) return null;
  const usd = priceGs / cotizacion;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const texto = usd.toLocaleString("es-PY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Más legible que la versión anterior (text-xs muted): sube a `text-sm`
  // con `text-primary/85` (color bordó de la marca atenuado al 85%) para
  // ganar contraste sin competir con el precio principal en guaraníes que
  // usa `text-primary` puro a tamaño mayor. Mantiene `font-editorial` para
  // conservar elegancia y `tracking-wide` para legibilidad.
  return (
    <span
      className={`text-sm tracking-wide font-editorial text-primary/85 ${className}`}
      title={`Equivalente aproximado · cotización Gs. ${cotizacion.toLocaleString("es-PY")} por USD 1`}
    >
      ≈ USD {texto}
    </span>
  );
}
