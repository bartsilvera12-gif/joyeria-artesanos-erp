"use client";

import { slugifyNombre } from "@/lib/inventario/slug";
import { CONCENTRACIONES, isConcentracionCanonica } from "@/lib/inventario/concentraciones";

/**
 * Sección "Catálogo web" del formulario de productos del ERP.
 *
 * UX:
 *   - Slug con botón "Generar desde nombre".
 *   - Precio normal web NO se ingresa: la web siempre usa `precio_venta`
 *     del bloque superior. Solo se editan oferta y vigencia.
 *   - Pirámide olfativa libre (familia + notas CSV) — el server resuelve
 *     las filas auxiliares en `familias_olfativas` y `notas_olfativas`.
 */

export type MarcaOption = { id: string; nombre: string };

export type CatalogoWebState = {
  slug_web: string;
  visible_web: boolean;
  destacado_web: boolean;
  descripcion_corta: string;
  descripcion_web: string;
  /** FK opcional a elevate.marcas (Fase Marcas). */
  marca_id: string;
  /** Texto libre legacy — sigue persistiendo para compatibilidad. */
  marca: string;
  /** Precio mayorista informativo (Fase Mayorista). Strings para form. */
  precio_mayorista: string;
  cantidad_minima_mayorista: string;
  visible_mayorista_web: boolean;
  /** Legacy. NO editable desde UI. La web usa precio_venta. */
  precio_web: string;
  precio_oferta: string;
  oferta_hasta: string;
  nuevo_hasta: string;
  concentracion: string;
  volumen_ml: string;
  genero: "" | "masculino" | "femenino" | "unisex";
  proximamente: boolean;
  orden_web: string;
  familia_olfativa_nombre: string;
  notas_top_csv: string;
  notas_heart_csv: string;
  notas_base_csv: string;
};

export const emptyCatalogoWeb: CatalogoWebState = {
  slug_web: "",
  visible_web: false,
  destacado_web: false,
  descripcion_corta: "",
  descripcion_web: "",
  marca_id: "",
  marca: "",
  precio_mayorista: "",
  cantidad_minima_mayorista: "",
  visible_mayorista_web: false,
  precio_web: "",
  precio_oferta: "",
  oferta_hasta: "",
  nuevo_hasta: "",
  concentracion: "",
  volumen_ml: "",
  genero: "",
  proximamente: false,
  orden_web: "",
  familia_olfativa_nombre: "",
  notas_top_csv: "",
  notas_heart_csv: "",
  notas_base_csv: "",
};

interface Props {
  value: CatalogoWebState;
  onChange: (next: CatalogoWebState) => void;
  /** Nombre del producto en el bloque superior — usado por el botón "Generar slug". */
  nombre: string;
  /** Precio de venta del bloque superior — mostrado como informativo. */
  precioVenta?: string | number;
  /** Lista de marcas formales para selector (Fase Marcas). Opcional. */
  marcas?: MarcaOption[];
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none bg-white text-sm";
const labelClass = "block text-sm font-medium text-slate-700 mb-2";

function fmtGs(v: string | number | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `Gs. ${n.toLocaleString("es-PY")}`;
}

export function CatalogoWebFields({ value, onChange, nombre, precioVenta, marcas = [] }: Props) {
  function set<K extends keyof CatalogoWebState>(k: K, v: CatalogoWebState[K]) {
    onChange({ ...value, [k]: v });
  }

  /**
   * Al elegir una marca formal del selector, sincronizamos también `marca`
   * (texto legacy) con el nombre de la marca para que productos sin marca_id
   * (carga vieja) sigan funcionando y los nuevos exporten el nombre legible.
   */
  function handleMarcaIdChange(id: string) {
    const m = marcas.find((x) => x.id === id);
    onChange({
      ...value,
      marca_id: id,
      marca: m ? m.nombre : value.marca,
    });
  }

  function handleGenerarSlug() {
    const next = slugifyNombre(nombre);
    if (!next) return;
    set("slug_web", next);
  }

  return (
    <section className="border-t border-slate-100 pt-6 mt-2">
      <header className="mb-5">
        <h2 className="text-lg font-semibold text-slate-800">Catálogo web</h2>
        <p className="text-xs text-slate-500">
          Datos visibles en la tienda pública. Si <strong>Visible en web</strong> está apagado,
          el producto queda oculto.
        </p>
      </header>

      {/* Slug + acciones */}
      <div className="mb-5">
        <label className={labelClass}>Slug web</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={value.slug_web}
            onChange={(e) => set("slug_web", e.target.value.toLowerCase())}
            placeholder="oud-royale"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleGenerarSlug}
            disabled={!nombre || !nombre.trim()}
            className="shrink-0 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={nombre ? `Genera "${slugifyNombre(nombre)}"` : "Cargá el nombre primero"}
          >
            Generar desde nombre
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          URL pública: <code className="text-slate-700">/producto/{value.slug_web || "—"}</code>
        </p>
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.visible_web}
            onChange={(e) => set("visible_web", e.target.checked)}
            className="h-4 w-4"
          />
          <span>Visible en la web</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.destacado_web}
            onChange={(e) => set("destacado_web", e.target.checked)}
            className="h-4 w-4"
          />
          <span>Destacado (bestseller)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.proximamente}
            onChange={(e) => set("proximamente", e.target.checked)}
            className="h-4 w-4"
          />
          <span>Próximamente</span>
        </label>
      </div>

      {/* Marca formal + texto legacy + género */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={labelClass}>Marca</label>
          <select
            value={value.marca_id}
            onChange={(e) => handleMarcaIdChange(e.target.value)}
            className={inputClass}
          >
            <option value="">— Sin asignar —</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            ¿Falta una marca?{" "}
            <a href="/inventario/marcas" className="underline text-sky-700">
              Crearla en Marcas
            </a>
            .
          </p>
          {!value.marca_id && value.marca && (
            <p className="text-xs text-amber-700 mt-1">
              Marca legacy en texto: <strong>{value.marca}</strong>. Asignala al
              selector cuando puedas.
            </p>
          )}
          {/* Input legacy oculto: el valor sigue persistiendo en BD. Cuando
              cambia marca_id, el handler arriba sincroniza marca text. */}
          <input type="hidden" value={value.marca} readOnly />
        </div>
        <div>
          <label className={labelClass}>Género</label>
          <select
            value={value.genero}
            onChange={(e) => set("genero", e.target.value as CatalogoWebState["genero"])}
            className={inputClass}
          >
            <option value="">— Sin definir —</option>
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
            <option value="unisex">Unisex</option>
          </select>
        </div>
      </div>

      {/* Precio informativo + oferta */}
      <div className="border border-slate-200 rounded-lg bg-slate-50 p-4 mb-4">
        <p className="text-xs text-slate-600 mb-3">
          <strong>Precio normal web</strong> se toma automáticamente del{" "}
          <em>Precio de venta</em> cargado arriba:{" "}
          <span className="font-semibold text-slate-800">{fmtGs(precioVenta)}</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Precio de oferta (Gs.)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={value.precio_oferta}
              onChange={(e) => set("precio_oferta", e.target.value)}
              placeholder="Vacío = sin oferta"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Oferta hasta</label>
            <input
              type="datetime-local"
              value={value.oferta_hasta}
              onChange={(e) => set("oferta_hasta", e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-slate-500 mt-1">Si vence, vuelve al precio normal.</p>
          </div>
        </div>
      </div>

      {/* Precio mayorista informativo (Fase Mayorista) */}
      <div className="border border-amber-200 rounded-lg bg-amber-50/40 p-4 mb-4">
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-amber-900">Precio mayorista</h3>
          <p className="text-xs text-amber-800/80">
            Mostrá una referencia mayorista en la web pública. <strong>No aplica
            descuentos automáticos</strong> en el carrito ni en el checkout.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Precio mayorista (Gs.)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={value.precio_mayorista}
              onChange={(e) => set("precio_mayorista", e.target.value)}
              placeholder="Vacío = sin precio mayorista"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Cantidad mínima</label>
            <input
              type="number"
              min={1}
              step={1}
              value={value.cantidad_minima_mayorista}
              onChange={(e) => set("cantidad_minima_mayorista", e.target.value)}
              placeholder="Ej. 6"
              className={inputClass}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.visible_mayorista_web}
                onChange={(e) => set("visible_mayorista_web", e.target.checked)}
                className="h-4 w-4"
              />
              <span>Mostrar en la web</span>
            </label>
          </div>
        </div>
        {value.visible_mayorista_web &&
          (!value.precio_mayorista.trim() || !value.cantidad_minima_mayorista.trim()) && (
            <p className="mt-2 text-xs text-red-700">
              Para mostrar en la web cargá precio y cantidad mínima.
            </p>
          )}
      </div>

      {/* Nuevo + atributos */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label className={labelClass}>Nuevo hasta</label>
          <input
            type="date"
            value={value.nuevo_hasta}
            onChange={(e) => set("nuevo_hasta", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Concentración</label>
          <select
            value={value.concentracion}
            onChange={(e) => set("concentracion", e.target.value)}
            className={inputClass}
          >
            <option value="">Seleccionar concentración</option>
            {/* Producto legacy con valor fuera de catálogo: opción "Actual: …" */}
            {value.concentracion &&
              !isConcentracionCanonica(value.concentracion) && (
                <option value={value.concentracion}>
                  Actual: {value.concentracion}
                </option>
              )}
            {CONCENTRACIONES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Volumen (ml)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={value.volumen_ml}
            onChange={(e) => set("volumen_ml", e.target.value)}
            placeholder="100"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Orden web</label>
          <input
            type="number"
            step={1}
            value={value.orden_web}
            onChange={(e) => set("orden_web", e.target.value)}
            placeholder="Más bajo = primero"
            className={inputClass}
          />
        </div>
      </div>

      {/* Descripciones */}
      <div className="grid grid-cols-1 gap-4 mb-4">
        <div>
          <label className={labelClass}>
            Descripción corta (card){" "}
            <span className="ml-1 text-[10px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal">
              SKU descripción
            </span>
          </label>
          <input
            type="text"
            value={value.descripcion_corta}
            onChange={(e) => set("descripcion_corta", e.target.value)}
            placeholder="Una línea para la tarjeta del catálogo"
            className={inputClass}
            maxLength={200}
          />
          <p className="text-xs text-slate-500 mt-1">
            Corresponde a la columna <strong>SKU DESCRIPCION</strong> del Excel — descripción breve del perfume.
          </p>
        </div>
        <div>
          <label className={labelClass}>Descripción larga (detalle)</label>
          <textarea
            value={value.descripcion_web}
            onChange={(e) => set("descripcion_web", e.target.value)}
            placeholder="Texto completo del producto en la página de detalle"
            className={`${inputClass} min-h-[100px]`}
          />
        </div>
      </div>

      {/* Familia + notas */}
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className={labelClass}>Familia olfativa</label>
          <input
            type="text"
            value={value.familia_olfativa_nombre}
            onChange={(e) => set("familia_olfativa_nombre", e.target.value)}
            placeholder="Amaderada · Oriental"
            className={inputClass}
          />
          <p className="text-xs text-slate-500 mt-1">
            Si no existe, se crea automáticamente al guardar.
          </p>
        </div>
        <div>
          <label className={labelClass}>Notas de salida (separadas por coma)</label>
          <input
            type="text"
            value={value.notas_top_csv}
            onChange={(e) => set("notas_top_csv", e.target.value)}
            placeholder="Bergamota, Limón, Mandarina"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Notas de corazón (separadas por coma)</label>
          <input
            type="text"
            value={value.notas_heart_csv}
            onChange={(e) => set("notas_heart_csv", e.target.value)}
            placeholder="Jazmín, Rosa"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Notas de fondo (separadas por coma)</label>
          <input
            type="text"
            value={value.notas_base_csv}
            onChange={(e) => set("notas_base_csv", e.target.value)}
            placeholder="Sándalo, Ámbar"
            className={inputClass}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Convierte el estado del form al payload que va al API. Normaliza:
 *   - números vacíos → null
 *   - genero "" → null
 *   - notas_top_csv / heart / base → arrays de strings recortados
 *
 * `precio_web` se mantiene en el payload por compatibilidad (campo legacy en DB),
 * pero NO se setea desde la UI — siempre null. El cliente público usa precio_venta.
 */
export function catalogoWebToPayload(s: CatalogoWebState) {
  const num = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const csv = (v: string): string[] =>
    v
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

  return {
    slug_web: s.slug_web.trim() || null,
    visible_web: !!s.visible_web,
    destacado_web: !!s.destacado_web,
    descripcion_corta: s.descripcion_corta.trim() || null,
    descripcion_web: s.descripcion_web.trim() || null,
    marca: s.marca.trim() || null,
    marca_id: s.marca_id || null,
    precio_mayorista: num(s.precio_mayorista),
    cantidad_minima_mayorista: (() => {
      const v = num(s.cantidad_minima_mayorista);
      return v == null ? null : Math.max(1, Math.floor(v));
    })(),
    visible_mayorista_web: !!s.visible_mayorista_web,
    /** Elevate no usa precio_web — la web toma precio_venta directo. */
    precio_web: null,
    precio_oferta: num(s.precio_oferta),
    oferta_hasta: s.oferta_hasta || null,
    nuevo_hasta: s.nuevo_hasta || null,
    concentracion: s.concentracion.trim() || null,
    volumen_ml: num(s.volumen_ml),
    genero: s.genero || null,
    proximamente: !!s.proximamente,
    orden_web: num(s.orden_web),
    familia_olfativa_nombre: s.familia_olfativa_nombre.trim() || null,
    notas_top: csv(s.notas_top_csv),
    notas_heart: csv(s.notas_heart_csv),
    notas_base: csv(s.notas_base_csv),
  };
}
