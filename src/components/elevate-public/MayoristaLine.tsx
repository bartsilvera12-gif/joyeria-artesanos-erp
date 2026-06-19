"use client";

/**
 * Línea informativa de precio mayorista (Fase Mayorista).
 *
 * Muestra "Mayorista desde N unidades: Gs. X" debajo del precio principal,
 * solo si el producto trae `mayorista` con valores sanos. Si no, no renderiza
 * nada — sin huecos vacíos, sin NaN, sin Infinity.
 *
 * El precio mayorista es solo referencia visual. NO aplica descuentos en
 * carrito ni en checkout — la lógica de precio en el RPC `crear_pedido_web`
 * sigue usando precio_venta.
 */
export function MayoristaLine({
  mayorista,
  className = "",
}: {
  mayorista?: { precio: number; cantidad_minima: number } | null;
  className?: string;
}) {
  if (!mayorista) return null;
  const { precio, cantidad_minima } = mayorista;
  if (!Number.isFinite(precio) || precio <= 0) return null;
  if (!Number.isFinite(cantidad_minima) || cantidad_minima < 1) return null;
  const precioFmt = `Gs. ${Math.round(precio).toLocaleString("es-PY")}`;
  return (
    <span
      className={`text-xs tracking-wide text-muted-foreground italic font-editorial ${className}`}
      title="Precio referencial mayorista. No aplica descuento automático en el carrito."
    >
      Mayorista desde {cantidad_minima} unidades: {precioFmt}
    </span>
  );
}
