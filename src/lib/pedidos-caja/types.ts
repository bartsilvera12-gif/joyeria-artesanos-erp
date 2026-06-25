/**
 * Pedido armado en /buscador y enviado al cajero para cobrar.
 *
 * Vive en tabla `autorepuestosfelix.pedidos_caja`. Reemplaza el uso forzado
 * de `proyectos` (heredado del repo lomitería; este ERP no tiene módulo
 * de proyectos, no tiene sentido pasar por ahí).
 */

export type EstadoPedidoCaja = "pendiente" | "facturado" | "cancelado";

export interface PedidoCajaItem {
  producto_id: string;
  producto_nombre: string;
  sku: string | null;
  cantidad: number;
  precio_venta: number;
  tipo_precio: "minorista" | "mayorista";
}

export interface PedidoCaja {
  id: string;
  titulo: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  observacion: string | null;
  items: PedidoCajaItem[];
  total_estimado: number;
  estado: EstadoPedidoCaja;
  venta_id: string | null;
  venta_numero: string | null;
  armado_por_id: string | null;
  armado_por_email: string | null;
  created_at: string;
  facturado_at: string | null;
}
