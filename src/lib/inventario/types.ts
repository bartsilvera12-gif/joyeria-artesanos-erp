export type MetodoValuacion = "CPP" | "FIFO" | "LIFO";
export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE";
export type OrigenMovimiento = "compra" | "venta" | "ajuste_manual" | "inventario_inicial";

export type NotaPosicion = "top" | "heart" | "base";

export interface ProductoNotaRef {
  nota_id: string;
  posicion: NotaPosicion;
  orden?: number | null;
  /* Hidratado desde join — opcional */
  nombre?: string | null;
}

export interface Producto {
  id: string;
  nombre: string;
  sku: string;
  /** Modelo del perfume (ej. Sauvage). Mapea a "SKU PRODUCT" del Excel. */
  modelo?: string | null;
  /** Si false, el producto queda dado de baja (no se lista en ventas). */
  activo?: boolean;
  costo_promedio: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  /** Cantidad mínima sugerida para venta minorista (informativo). */
  cantidad_minima_minorista?: number | null;
  unidad_medida: string;
  metodo_valuacion: MetodoValuacion;
  codigo_barras?: string | null;
  codigo_barras_interno?: boolean;
  imagen_path?: string | null;
  imagen_url?: string | null;
  categoria_principal_id?: string | null;
  ubicacion_principal_id?: string | null;
  proveedor_principal_id?: string | null;
  /* Campos web pública (Fase 1) */
  slug_web?: string | null;
  visible_web?: boolean;
  destacado_web?: boolean;
  descripcion_corta?: string | null;
  descripcion_web?: string | null;
  marca?: string | null;
  /** FK opcional a elevate.marcas. Coexiste con marca text legacy. */
  marca_id?: string | null;
  precio_web?: number | null;
  /* Precio mayorista informativo (Fase Mayorista). NO aplica descuento en
   * checkout — solo se muestra como referencia en la web pública si
   * visible_mayorista_web=true. */
  precio_mayorista?: number | null;
  cantidad_minima_mayorista?: number | null;
  visible_mayorista_web?: boolean;
  /* Catálogo enriquecido (Fase 1 catálogo) */
  precio_oferta?: number | null;
  oferta_hasta?: string | null;        // ISO timestamptz
  nuevo_hasta?: string | null;         // ISO date
  concentracion?: string | null;
  volumen_ml?: number | null;
  genero?: "masculino" | "femenino" | "unisex" | null;
  proximamente?: boolean;
  orden_web?: number | null;
  familia_olfativa_id?: string | null;
  /* Notas hidratadas — solo desde server al cargar/editar */
  notas?: ProductoNotaRef[];
  /** Fase Presentaciones: si true, el producto se vende por ml y la web
   *  obliga a elegir una presentación. */
  tiene_presentaciones?: boolean;
  /** Fase Decants: si true, este producto puede entregarse como obsequio
   *  sin cargo en una venta del ERP. */
  es_decant?: boolean;

  /* ─────────────────────────────────────────────────────────────────
   * Campos opcionales heredados del ERP base (gastro/autopartes).
   * No se usan en joyería, pero el componente InventarioDesktop —
   * importado del repo Autorepuestos Felix — los referencia como
   * filtros/columnas opcionales. Quedan como `?` para no romper el
   * compilador; los renders contra `undefined` se omiten naturalmente.
   * ───────────────────────────────────────────────────────────────── */
  es_vendible?: boolean;
  es_insumo?: boolean;
  controla_stock?: boolean;
  modo_receta?: string;
  distribuidor_nombre?: string | null;
  ubicacion_deposito?: string | null;

  /* Campos heredados del ERP autorepuestos. Opcionales — no se persisten en
   * joyería; sólo permiten compilar los formularios portados. */
  precio_distribuidor?: number | null;
  codigo_oem?: string | null;
  codigo_alternativo?: string | null;
  marca_repuesto?: string | null;
  garantia_meses?: number | null;
  distribuidor_comision_pct?: number | null;
  permitir_venta_sin_stock?: boolean;
  descripcion?: string | null;
  valorizado?: boolean;
  unidad_compra?: string | null;
  unidad_receta?: string | null;
  factor_compra_receta?: number | null;
  tiempo_prep_minutos?: number | null;

  /** Desglose multi-sucursal: dónde está el producto y con cuánto stock.
   *  Solo presente en lecturas de admin (operativos ven su propia sucursal). */
  sucursales?: Array<{
    sucursal_id: string;
    nombre: string;
    es_principal: boolean;
    stock_actual: number;
  }>;
}

/** Fase Presentaciones: cada presentación por ml de un producto. */
export interface ProductoPresentacion {
  id: string;
  empresa_id: string;
  producto_id: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  volumen_ml: number;
  costo_promedio: number;
  precio_venta: number;
  precio_web: number | null;
  precio_oferta: number | null;
  oferta_hasta: string | null;
  precio_mayorista: number | null;
  cantidad_minima_mayorista: number | null;
  visible_mayorista_web: boolean;
  stock_actual: number;
  stock_minimo: number;
  imagen_path: string | null;
  imagen_url: string | null;
  visible_web: boolean;
  activo: boolean;
  orden: number;
  created_at?: string;
  updated_at?: string;
}

export interface MovimientoInventario {
  id: string;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario: number;
  origen: OrigenMovimiento;
  fecha: string;       // ISO string
  referencia?: string; // ej: "COMP-000001"
  created_by?: string | null;
  usuario_nombre?: string | null;
}
