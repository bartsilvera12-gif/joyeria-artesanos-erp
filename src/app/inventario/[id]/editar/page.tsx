"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import { getProducto, productoExiste, updateProducto } from "@/lib/inventario/storage";
import type { MetodoValuacion } from "@/lib/inventario/types";
import { ProductGaleria } from "@/components/inventario/ProductGaleria";
import { PresentacionesEditor } from "@/components/inventario/PresentacionesEditor";
import SelectFromList from "@/components/inventario/SelectFromList";
import { UNIDADES_MEDIDA, isUnidadMedidaCanonica, normalizeUnidadMedida } from "@/lib/inventario/unidades-medida";
import {
  CatalogoWebFields,
  catalogoWebToPayload,
  emptyCatalogoWeb,
  type CatalogoWebState,
} from "@/components/inventario/CatalogoWebFields";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { AcordesSelector } from "@/components/inventario/AcordesSelector";

interface CatRow { id: string; nombre: string }
interface UbiRow { id: string; nombre: string; tipo: string }
interface ProvRow { id: string; nombre: string }

export default function EditarProductoPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) ?? "";

  const [cargando, setCargando] = useState(true);
  const [errorDuplicado, setErrorDuplicado] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    sku: "",
    modelo: "",
    codigo_barras: "",
    codigo_barras_interno: false,
    costo_promedio: "",
    markup: "",
    precio_venta: "",
    stock_actual: "",
    stock_minimo: "",
    cantidad_minima_minorista: "",
    unidad_medida: "",
    metodo_valuacion: "CPP" as MetodoValuacion,
    activo: true,
    es_decant: false,
  });
  const [acordesSeleccionados, setAcordesSeleccionados] = useState<string[]>([]);
  const [acordesOriginal, setAcordesOriginal] = useState<string[]>([]);
  const [imagenPath, setImagenPath] = useState<string | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [codigoOriginal, setCodigoOriginal] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generandoCodigo, setGenerandoCodigo] = useState(false);
  const [generandoSku, setGenerandoSku] = useState(false);

  /**
   * Llama a /api/productos/generar-sku para obtener el próximo SKU disponible.
   * En edición el SKU ya suele estar cargado → siempre pedir confirmación.
   */
  async function handleGenerarSku() {
    if (generandoSku) return;
    if (form.sku.trim() && !confirm("Este producto ya tiene SKU. ¿Reemplazarlo por uno generado automáticamente?")) {
      return;
    }
    setGenerandoSku(true);
    setErrorDuplicado(null);
    setErrorGeneral(null);
    try {
      const r = await fetchWithSupabaseSession("/api/productos/generar-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefijo: "ELE_PER" }),
      });
      const j = await r.json();
      if (r.ok && j?.success && typeof j.data?.sku === "string") {
        setForm((prev) => ({ ...prev, sku: j.data.sku }));
      } else {
        setErrorGeneral(j?.error ?? "No se pudo generar el SKU.");
      }
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : "Error de red");
    } finally {
      setGenerandoSku(false);
    }
  }

  // Relaciones
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [ubicacionId, setUbicacionId] = useState<string | null>(null);
  const [proveedorId, setProveedorId] = useState<string | null>(null);

  // Catálogo web (Fase 1 catálogo enriquecido)
  const [catWeb, setCatWeb] = useState<CatalogoWebState>(emptyCatalogoWeb);
  // Snapshot inicial de familia + notas para detectar cambios y NO borrar
  // accidentalmente datos existentes al guardar.
  const [extrasOriginal, setExtrasOriginal] = useState<{
    familia: string;
    top: string;
    heart: string;
    base: string;
  } | null>(null);
  function slugify(input: string): string {
    return input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }
  const [categorias, setCategorias] = useState<CatRow[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbiRow[]>([]);
  const [proveedores, setProveedores] = useState<ProvRow[]>([]);
  const [marcas, setMarcas] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    let cancel = false;
    async function load(url: string) {
      try {
        const r = await fetchWithSupabaseSession(url, { cache: "no-store" });
        const j = await r.json();
        return r.ok && j?.success ? j.data : null;
      } catch { return null; }
    }
    (async () => {
      const [cats, ubis, provs, mks] = await Promise.all([
        load("/api/inventario/categorias"),
        load("/api/inventario/ubicaciones"),
        load("/api/proveedores"),
        load("/api/inventario/marcas"),
      ]);
      if (cancel) return;
      if (cats?.categorias) setCategorias(cats.categorias as CatRow[]);
      if (ubis?.ubicaciones) setUbicaciones(ubis.ubicaciones as UbiRow[]);
      if (provs?.proveedores) setProveedores(provs.proveedores as ProvRow[]);
      if (mks?.marcas) setMarcas(mks.marcas as { id: string; nombre: string }[]);
    })();
    return () => { cancel = true; };
  }, []);

  async function handleGenerarCodigoInterno() {
    if (generandoCodigo) return;
    setGenerandoCodigo(true);
    setErrorDuplicado(null);
    setErrorGeneral(null);
    try {
      const res = await fetchWithSupabaseSession("/api/productos/codigo-interno", {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json?.success && json.data?.codigo) {
        setForm((prev) => ({
          ...prev,
          codigo_barras: json.data.codigo as string,
          codigo_barras_interno: true,
        }));
      } else {
        setErrorGeneral(json?.error ?? "No se pudo generar el código.");
      }
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : "Error de red");
    } finally {
      setGenerandoCodigo(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getProducto(id).then((p) => {
      if (cancelled || !p) return;
      const costo = p.costo_promedio;
      const precio = p.precio_venta;
      const markup = costo > 0 ? ((precio - costo) / costo) * 100 : 0;
      setForm({
        nombre: p.nombre,
        sku: p.sku,
        modelo: p.modelo ?? "",
        codigo_barras: p.codigo_barras ?? "",
        codigo_barras_interno: p.codigo_barras_interno === true,
        costo_promedio: String(p.costo_promedio),
        markup: markup.toFixed(2),
        precio_venta: String(p.precio_venta),
        stock_actual: String(p.stock_actual),
        stock_minimo: String(p.stock_minimo),
        cantidad_minima_minorista:
          p.cantidad_minima_minorista == null ? "" : String(p.cantidad_minima_minorista),
        unidad_medida: p.unidad_medida,
        metodo_valuacion: p.metodo_valuacion,
        activo: p.activo !== false,
        es_decant: p.es_decant === true,
      });
      setCodigoOriginal(p.codigo_barras ?? null);
      setImagenPath(p.imagen_path ?? null);
      setImagenUrl(p.imagen_url ?? null);
      setCategoriaId(p.categoria_principal_id ?? null);
      setUbicacionId(p.ubicacion_principal_id ?? null);
      setProveedorId(p.proveedor_principal_id ?? null);
      // Catálogo web: hidratar todos los campos enriquecidos del producto
      const fmtDt = (s: string | null | undefined) =>
        s ? new Date(s).toISOString().slice(0, 16) : "";
      const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) : "");
      setCatWeb({
        slug_web: p.slug_web ?? "",
        visible_web: p.visible_web === true,
        destacado_web: p.destacado_web === true,
        descripcion_corta: p.descripcion_corta ?? "",
        descripcion_web: p.descripcion_web ?? "",
        marca_id: p.marca_id ?? "",
        marca: p.marca ?? "",
        precio_mayorista:
          p.precio_mayorista == null ? "" : String(p.precio_mayorista),
        cantidad_minima_mayorista:
          p.cantidad_minima_mayorista == null
            ? ""
            : String(p.cantidad_minima_mayorista),
        visible_mayorista_web: p.visible_mayorista_web === true,
        precio_web: p.precio_web == null ? "" : String(p.precio_web),
        precio_oferta: p.precio_oferta == null ? "" : String(p.precio_oferta),
        oferta_hasta: fmtDt(p.oferta_hasta),
        nuevo_hasta: fmtDate(p.nuevo_hasta),
        concentracion: p.concentracion ?? "",
        volumen_ml: p.volumen_ml == null ? "" : String(p.volumen_ml),
        genero: (p.genero === "masculino" || p.genero === "femenino" || p.genero === "unisex") ? p.genero : "",
        proximamente: p.proximamente === true,
        orden_web: p.orden_web == null ? "" : String(p.orden_web),
        // familia + notas se hidratan en un segundo fetch a /catalogo-extras
        familia_olfativa_nombre: "",
        notas_top_csv: "",
        notas_heart_csv: "",
        notas_base_csv: "",
      });

      // Hidratar acordes principales (best-effort).
      fetchWithSupabaseSession(`/api/productos/${encodeURIComponent(id)}/acordes`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (cancelled || !j?.success) return;
          const rows = (j.data?.acordes ?? []) as Array<{ acorde_id: string }>;
          const ids = rows.map((r) => r.acorde_id);
          setAcordesSeleccionados(ids);
          setAcordesOriginal(ids);
        })
        .catch(() => undefined);

      // Hidratar familia + notas
      fetchWithSupabaseSession(`/api/productos/${encodeURIComponent(id)}/catalogo-extras`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (cancelled || !j?.success) return;
          const d = j.data as {
            familia_olfativa_nombre: string | null;
            notas_top: string[];
            notas_heart: string[];
            notas_base: string[];
          };
          const familia = d.familia_olfativa_nombre ?? "";
          const top = (d.notas_top ?? []).join(", ");
          const heart = (d.notas_heart ?? []).join(", ");
          const base = (d.notas_base ?? []).join(", ");
          setCatWeb((prev) => ({
            ...prev,
            familia_olfativa_nombre: familia,
            notas_top_csv: top,
            notas_heart_csv: heart,
            notas_base_csv: base,
          }));
          setExtrasOriginal({ familia, top, heart, base });
        })
        .catch(() => undefined);
    }).finally(() => {
      if (!cancelled) setCargando(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    if (e.target.name === "codigo_barras") {
      const next = e.target.value;
      // Si el codigo cambia respecto al original guardado, deja de ser "interno".
      setForm((prev) => ({
        ...prev,
        codigo_barras: next,
        codigo_barras_interno: next === (codigoOriginal ?? "") ? prev.codigo_barras_interno : false,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // costo_promedio y precio_venta son INDEPENDIENTES. Cambiar uno no
  // sobrescribe al otro. Markup y margen son derivados read-only.
  function handleCostoChange(costo: number) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    setForm((prev) => ({ ...prev, costo_promedio: String(costo) }));
  }

  function handlePrecioChange(precio: number) {
    setErrorDuplicado(null);
    setErrorGeneral(null);
    setForm((prev) => ({ ...prev, precio_venta: String(precio) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrorDuplicado(null);
    setErrorGeneral(null);

    const codigoIngresado = form.codigo_barras.trim();
    // Ya no aplicamos validación de prefijo: el código interno es EAN-13
    // numérico y los códigos reales de fábrica también son numéricos.

    const duplicado = await productoExiste(form.sku, form.nombre);
    if (duplicado && duplicado.id !== id) {
      setErrorDuplicado(`Ya existe "${duplicado.nombre}" con SKU ${duplicado.sku}.`);
      return;
    }

    setSubmitting(true);
    try {
      // Reglas de codigo en edicion:
      // - Si quedo igual al original -> no tocar el campo (preservar codigo_barras_interno).
      // - Si cambio y no esta vacio -> codigo_barras_interno = false (manual).
      // - Si quedo vacio -> codigo_barras = null, codigo_barras_interno = false.
      //   (No auto-regeneramos en edicion: evita sorprender al usuario.)
      const cambioCodigo = codigoIngresado !== (codigoOriginal ?? "");
      const cw = catalogoWebToPayload(catWeb);
      const slugEfectivo = cw.slug_web
        ? slugify(cw.slug_web)
        : cw.visible_web ? slugify(form.nombre) : null;
      const cantMinMinorista = (() => {
        const t = form.cantidad_minima_minorista.trim();
        if (!t) return null;
        const n = parseInt(t, 10);
        return Number.isFinite(n) && n >= 1 ? n : null;
      })();
      const updatePayload: Parameters<typeof updateProducto>[1] = {
        nombre: form.nombre.trim().toUpperCase(),
        sku: form.sku.trim().toUpperCase(),
        modelo: form.modelo.trim() ? form.modelo.trim().toUpperCase() : null,
        costo_promedio: parseFloat(form.costo_promedio) || 0,
        precio_venta: parseFloat(form.precio_venta) || 0,
        stock_actual: parseInt(form.stock_actual) || 0,
        stock_minimo: parseInt(form.stock_minimo) || 0,
        cantidad_minima_minorista: cantMinMinorista,
        unidad_medida: form.unidad_medida.trim().toUpperCase(),
        metodo_valuacion: form.metodo_valuacion,
        activo: form.activo === true,
        es_decant: form.es_decant === true,
        categoria_principal_id: categoriaId,
        ubicacion_principal_id: ubicacionId,
        proveedor_principal_id: proveedorId,
        // Catálogo web (Fase 1)
        slug_web: slugEfectivo,
        visible_web: cw.visible_web,
        destacado_web: cw.destacado_web,
        marca: cw.marca,
        marca_id: cw.marca_id,
        precio_mayorista: cw.precio_mayorista,
        cantidad_minima_mayorista: cw.cantidad_minima_mayorista,
        visible_mayorista_web: cw.visible_mayorista_web,
        descripcion_corta: cw.descripcion_corta,
        descripcion_web: cw.descripcion_web,
        precio_web: cw.precio_web,
        // Catálogo enriquecido
        precio_oferta: cw.precio_oferta,
        oferta_hasta: cw.oferta_hasta,
        nuevo_hasta: cw.nuevo_hasta,
        concentracion: cw.concentracion,
        volumen_ml: cw.volumen_ml,
        genero: cw.genero,
        proximamente: cw.proximamente,
        orden_web: cw.orden_web,
      };
      if (cambioCodigo) {
        updatePayload.codigo_barras = codigoIngresado || null;
        updatePayload.codigo_barras_interno =
          codigoIngresado.length > 0 && form.codigo_barras_interno === true;
      }

      try {
        const actualizado = await updateProducto(id, updatePayload);
        if (actualizado) {
          // Familia + notas: solo enviar lo que cambió respecto al snapshot
          // inicial, para NO borrar accidentalmente datos existentes.
          const extrasBody: Record<string, unknown> = {};
          if (extrasOriginal) {
            if (cw.familia_olfativa_nombre !== (extrasOriginal.familia || null)) {
              extrasBody.familia_olfativa_nombre = cw.familia_olfativa_nombre;
            }
            if (catWeb.notas_top_csv.trim() !== extrasOriginal.top) {
              extrasBody.notas_top = cw.notas_top;
            }
            if (catWeb.notas_heart_csv.trim() !== extrasOriginal.heart) {
              extrasBody.notas_heart = cw.notas_heart;
            }
            if (catWeb.notas_base_csv.trim() !== extrasOriginal.base) {
              extrasBody.notas_base = cw.notas_base;
            }
          } else {
            // Sin snapshot (raro): si el usuario completó algo, mandar.
            if (cw.familia_olfativa_nombre) extrasBody.familia_olfativa_nombre = cw.familia_olfativa_nombre;
            if (cw.notas_top.length) extrasBody.notas_top = cw.notas_top;
            if (cw.notas_heart.length) extrasBody.notas_heart = cw.notas_heart;
            if (cw.notas_base.length) extrasBody.notas_base = cw.notas_base;
          }
          if (Object.keys(extrasBody).length > 0) {
            try {
              await fetchWithSupabaseSession(`/api/productos/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(extrasBody),
              });
            } catch (e) {
              console.warn("[editar producto] catálogo extras fallaron", e);
            }
          }
          // Acordes: solo enviar si cambiaron (orden o composición).
          const cambioAcordes =
            acordesSeleccionados.length !== acordesOriginal.length ||
            acordesSeleccionados.some((id, i) => id !== acordesOriginal[i]);
          if (cambioAcordes) {
            try {
              await fetchWithSupabaseSession(`/api/productos/${encodeURIComponent(id)}/acordes`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ acorde_ids: acordesSeleccionados }),
              });
            } catch (e) {
              console.warn("[editar producto] acordes fallaron", e);
            }
          }
          router.push("/inventario");
        } else {
          setErrorGeneral("No se pudo guardar los cambios. Revisá los datos e intentá nuevamente.");
        }
      } catch (err) {
        setErrorGeneral(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const costo = parseFloat(form.costo_promedio);
  const precio = parseFloat(form.precio_venta);
  // Precio efectivo = precio_oferta si está vigente, sino precio_venta.
  const precioOfertaN = parseFloat(catWeb.precio_oferta);
  const ofertaVigente = (() => {
    if (!Number.isFinite(precioOfertaN) || precioOfertaN <= 0) return false;
    if (!catWeb.oferta_hasta) return true;
    const t = Date.parse(catWeb.oferta_hasta);
    if (Number.isNaN(t)) return true;
    return t >= Date.now();
  })();
  const precioEfectivo = ofertaVigente ? precioOfertaN : precio;

  const costoOk = Number.isFinite(costo) && costo > 0;
  const precioEfectivoOk = Number.isFinite(precioEfectivo) && precioEfectivo > 0;
  const markupCalc = costoOk && Number.isFinite(precioEfectivo)
    ? ((precioEfectivo - costo) / costo) * 100
    : null;
  const margenVentaCalc = precioEfectivoOk && Number.isFinite(costo)
    ? ((precioEfectivo - costo) / precioEfectivo) * 100
    : null;
  const esPerdida = costoOk && precioEfectivoOk && precioEfectivo < costo;

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-gray-500 transition-colors text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-2";

  if (cargando) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-gray-800">Editar producto</h1>
        <p className="text-gray-500 animate-pulse">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Editar producto</h1>
        <p className="text-gray-600">Modifica los datos del producto</p>
      </div>

      <div className="bg-white rounded-xl shadow p-6 max-w-5xl">
        <form className="space-y-6" onSubmit={handleSubmit}>
          {errorGeneral && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{errorGeneral}</p>
            </div>
          )}
          {errorDuplicado && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-700">{errorDuplicado}</p>
            </div>
          )}

          <div>
            <label className={labelClass}>Nombre del producto</label>
            <input
              type="text"
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              className={`${inputClass} uppercase`}
              required
            />
          </div>

          {/* Modelo (SKU PRODUCT) */}
          <div>
            <label className={labelClass}>
              Modelo del perfume{" "}
              <span className="ml-1 text-[10px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                SKU PRODUCT
              </span>
            </label>
            <input
              type="text"
              name="modelo"
              value={form.modelo}
              onChange={handleChange}
              placeholder="Ej: SAUVAGE, 1 MILLION, BLEU DE CHANEL"
              className={`${inputClass} uppercase`}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>SKU</label>
              <input
                type="text"
                name="sku"
                value={form.sku}
                onChange={handleChange}
                className={`${inputClass} uppercase`}
                required
              />
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleGenerarSku}
                  disabled={generandoSku}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900 border border-emerald-200 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Genera el próximo SKU disponible con formato ELE_PER_####"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0v2.431l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
                  </svg>
                  {generandoSku ? "Generando..." : "Generar SKU"}
                </button>
                <span className="ml-2 text-xs text-gray-400">(automático, ELE_PER_####)</span>
              </div>
            </div>
            <div>
              <label className={labelClass}>Unidad de medida</label>
              <select
                name="unidad_medida"
                value={normalizeUnidadMedida(form.unidad_medida)}
                onChange={handleChange}
                className={inputClass}
                required
              >
                {/* Producto legacy con valor fuera de catálogo: mostrar opción "Actual: …" */}
                {form.unidad_medida && !isUnidadMedidaCanonica(normalizeUnidadMedida(form.unidad_medida)) && (
                  <option value={normalizeUnidadMedida(form.unidad_medida)}>
                    Actual: {normalizeUnidadMedida(form.unidad_medida)}
                  </option>
                )}
                {UNIDADES_MEDIDA.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Activo + Es decant */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 bg-slate-50/40 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="activo"
                  checked={form.activo === true}
                  onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Producto activo
                  </span>
                  <span className="block text-xs text-slate-600 mt-0.5">
                    Si está apagado, el producto no aparece en listados de venta ni en
                    el catálogo público.
                  </span>
                </span>
              </label>
            </div>
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="es_decant"
                  checked={form.es_decant === true}
                  onChange={(e) => setForm((prev) => ({ ...prev, es_decant: e.target.checked }))}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-semibold text-emerald-900">
                    Es decant / muestra
                  </span>
                  <span className="block text-xs text-emerald-800/80 mt-0.5">
                    Para productos pequeños que pueden entregarse como obsequio. Si se
                    entrega sin cargo en Ventas, descuenta stock y registra costo promocional.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Código de barras */}
          <div>
            <label className={labelClass}>
              Código de barras
              {form.codigo_barras_interno && form.codigo_barras && form.codigo_barras === codigoOriginal && (
                <span className="ml-2 align-middle text-[10px] uppercase tracking-wider bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
                  EAN-13 interno
                </span>
              )}
            </label>
            <input
              type="text"
              name="codigo_barras"
              value={form.codigo_barras}
              onChange={handleChange}
              placeholder="Escaneá el código del producto o generá uno interno"
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-gray-500">
              Si el producto trae código de fábrica, escanealo. Si no, generá uno interno para imprimir etiqueta y leer con pistolita.
            </p>
            {!form.codigo_barras.trim() && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleGenerarCodigoInterno}
                  disabled={generandoCodigo}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0v2.431l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
                  </svg>
                  {generandoCodigo ? "Generando..." : "Generar código de barras interno"}
                </button>
                <span className="ml-2 text-xs text-gray-400">(opcional)</span>
              </div>
            )}
          </div>

          {/* Presentaciones por ml (Fase Presentaciones). */}
          <div className="border-t border-slate-100 pt-6">
            <PresentacionesEditor
              productoId={id}
              fallbackImagenUrl={imagenUrl}
            />
          </div>

          {/* Galería del producto — hasta 5 imágenes (Fase Galería). El
              componente sincroniza la principal con productos.imagen_url
              server-side, así que el catálogo público sigue funcionando. */}
          <div>
            <label className={labelClass}>Galería del producto</label>
            <ProductGaleria
              productoId={id}
              fallbackUrl={imagenUrl}
              onPrincipalChange={(info) => {
                setImagenPath(info.imagen_path);
                setImagenUrl(info.imagen_url);
              }}
            />
          </div>

          {/* Clasificación, Proveedor, Ubicación */}
          <div className="border-t border-slate-100 pt-6">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                Clasificación y ubicación
              </p>
              <span className="text-xs text-gray-400">Opcional</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-4 min-w-0">
                <label className={labelClass}>Categoría principal</label>
                <SelectFromList
                  value={categoriaId}
                  onChange={setCategoriaId}
                  options={categorias.map((c) => ({ id: c.id, label: c.nombre }))}
                  emptyShort="Sin categorías"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400 truncate">
                    {categorias.length === 0 ? "Todavía no cargaste categorías." : `${categorias.length} disponibles`}
                  </span>
                  <Link
                    href="/inventario/categorias"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-2.5 py-1 rounded-md transition-colors"
                  >
                    + Crear
                  </Link>
                </div>
              </div>
              <div className="md:col-span-4 min-w-0">
                <label className={labelClass}>Proveedor principal</label>
                <SelectFromList
                  value={proveedorId}
                  onChange={setProveedorId}
                  options={proveedores.map((p) => ({ id: p.id, label: p.nombre }))}
                  emptyShort="Sin proveedores"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400 truncate">
                    {proveedores.length === 0 ? "Todavía no cargaste proveedores." : `${proveedores.length} disponibles`}
                  </span>
                  <Link
                    href="/proveedores/nuevo"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-2.5 py-1 rounded-md transition-colors"
                  >
                    + Crear
                  </Link>
                </div>
              </div>
              <div className="md:col-span-4 min-w-0">
                <label className={labelClass}>Ubicación principal</label>
                <SelectFromList
                  value={ubicacionId}
                  onChange={setUbicacionId}
                  options={ubicaciones.map((u) => ({ id: u.id, label: u.nombre, sublabel: u.tipo }))}
                  emptyShort="Sin ubicaciones"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400 truncate">
                    {ubicaciones.length === 0 ? "Todavía no cargaste ubicaciones." : `${ubicaciones.length} disponibles`}
                  </span>
                  <Link
                    href="/inventario/ubicaciones"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-2.5 py-1 rounded-md transition-colors"
                  >
                    + Crear
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">Precios</p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Costo promedio (Gs.)</label>
                <MontoInput
                  value={form.costo_promedio}
                  onChange={handleCostoChange}
                  className={inputClass}
                  decimals={false}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Precio de venta (Gs.)</label>
                <MontoInput
                  value={form.precio_venta}
                  onChange={handlePrecioChange}
                  className={inputClass}
                  decimals={false}
                  required
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="border border-blue-100 bg-blue-50 rounded-lg px-4 py-3">
                <p className="text-xs font-medium mb-1 text-blue-500">Markup s/costo</p>
                <p className="text-lg font-bold tabular-nums text-blue-700">
                  {markupCalc !== null ? `${markupCalc.toFixed(2)}%` : "—"}
                </p>
                <p className="text-xs mt-0.5 text-blue-400">
                  {ofertaVigente ? "Calculado con precio de oferta" : "Calculado con precio de venta"}
                </p>
              </div>
              <div className="border border-green-100 bg-green-50 rounded-lg px-4 py-3">
                <p className="text-xs font-medium mb-1 text-green-500">Margen s/venta</p>
                <p className="text-lg font-bold tabular-nums text-green-700">
                  {margenVentaCalc !== null ? `${margenVentaCalc.toFixed(2)}%` : "—"}
                </p>
                <p className="text-xs mt-0.5 text-green-400">
                  {ofertaVigente ? "Calculado con precio de oferta" : "Calculado con precio de venta"}
                </p>
              </div>
            </div>
            {esPerdida && (
              <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-600">
                <span className="mt-0.5 text-base leading-none">⚠</span>
                <span>
                  Atención: con este precio el producto se vende{" "}
                  <strong>por debajo del costo</strong>.
                  {ofertaVigente ? " (precio de oferta vigente)" : ""}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className={labelClass}>Stock actual</label>
              <input
                type="number"
                name="stock_actual"
                value={form.stock_actual}
                onChange={handleChange}
                className={inputClass}
                min={0}
                required
              />
              <p className="mt-1 text-xs text-gray-400">
                Para ajustes de stock, preferí registrar un <Link href="/inventario/movimientos/nuevo" className="underline">movimiento</Link>.
              </p>
            </div>
            <div>
              <label className={labelClass}>Stock mínimo</label>
              <input
                type="number"
                name="stock_minimo"
                value={form.stock_minimo}
                onChange={handleChange}
                className={inputClass}
                min={0}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Cantidad mínima venta (minorista)</label>
              <input
                type="number"
                name="cantidad_minima_minorista"
                value={form.cantidad_minima_minorista}
                onChange={handleChange}
                placeholder="Vacío = sin mínimo"
                className={inputClass}
                min={1}
              />
              <p className="mt-1 text-xs text-gray-500">
                Referencia informativa para venta minorista (opcional).
              </p>
            </div>
          </div>

          {/* Método de valuación: fijo en CPP — no editable desde la UI.
              El backend recibe siempre `metodo_valuacion: "CPP"` desde state. */}
          {false && (
          <div>
            <label className={labelClass}>Método de valuación</label>
            <select
              name="metodo_valuacion"
              value={form.metodo_valuacion}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="CPP">CPP — Costo Promedio Ponderado</option>
              <option value="FIFO">FIFO — Primero en entrar, primero en salir</option>
              <option value="LIFO">LIFO — Último en entrar, primero en salir</option>
            </select>
          </div>
          )}

          {/* Acordes principales (con imagen, catálogo global) */}
          <AcordesSelector
            value={acordesSeleccionados}
            onChange={setAcordesSeleccionados}
          />

          <CatalogoWebFields
            value={catWeb}
            onChange={setCatWeb}
            nombre={form.nombre}
            precioVenta={form.precio_venta}
            marcas={marcas}
          />

          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-gray-900 text-white px-5 py-3 rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/inventario")}
              className="border border-gray-300 px-5 py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
