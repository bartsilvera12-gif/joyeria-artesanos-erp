"use client";
import { confirm } from "@/components/ui/dialog";

import { useCallback, useEffect, useRef, useState } from "react";
import { Star, Trash2, Upload, ImageOff } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const MAX_IMAGENES = 5;
const ACCEPT = "image/jpeg,image/png,image/webp";

interface ImagenRow {
  id: string;
  producto_id: string;
  imagen_path: string;
  imagen_url: string;
  orden: number;
  es_principal: boolean;
  alt_text: string | null;
  created_at: string;
}

interface Props {
  productoId: string;
  /** Fallback legacy: si todavía no hay galería en BD pero el producto trae
   *  imagen_url legacy, se muestra como principal hasta que el backfill se
   *  refleje (no debería darse en producción tras la migración). */
  fallbackUrl?: string | null;
  /** Notifica al padre cuando cambia la imagen principal para que el form
   *  (state imagen_url) refleje el valor actual. */
  onPrincipalChange?: (info: { imagen_path: string | null; imagen_url: string | null }) => void;
}

/**
 * Galería de imágenes del producto (hasta 5).
 *
 * Lista las filas de `producto_imagenes` con miniaturas y permite:
 *   - subir nueva (botón "Agregar" deshabilitado al llegar a 5);
 *   - marcar principal (estrella);
 *   - eliminar (basura);
 *   - reordenar con flechas ←/→ (PATCH orden).
 *
 * Mantener compatibilidad: el endpoint sincroniza la URL principal con
 * `productos.imagen_url` para que el catálogo/card siga usando ese campo.
 */
export function ProductGaleria({ productoId, fallbackUrl, onPrincipalChange }: Props) {
  const [imagenes, setImagenes] = useState<ImagenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/productos/${productoId}/imagenes`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (r.ok && j?.success) {
        setImagenes((j.data.imagenes ?? []) as ImagenRow[]);
      } else {
        setError(j?.error ?? "No se pudo cargar la galería");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [productoId]);

  useEffect(() => {
    load();
  }, [load]);

  function notifyPrincipal(next: ImagenRow[]) {
    const p = next.find((i) => i.es_principal) ?? null;
    if (onPrincipalChange) {
      onPrincipalChange({
        imagen_path: p ? p.imagen_path : null,
        imagen_url: p ? p.imagen_url : null,
      });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (imagenes.length >= MAX_IMAGENES) {
      setError(`Solo se permiten ${MAX_IMAGENES} imágenes. Eliminá una antes.`);
      e.target.value = "";
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const r = await fetchWithSupabaseSession(`/api/productos/${productoId}/imagenes`, {
        method: "POST",
        body: form,
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo subir la imagen");
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function setPrincipal(imagenId: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/productos/${productoId}/imagenes/${imagenId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ es_principal: true }),
        }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo marcar como principal");
      } else {
        const next = imagenes.map((i) => ({ ...i, es_principal: i.id === imagenId }));
        setImagenes(next);
        notifyPrincipal(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(imagenId: string) {
    if (!(await confirm({ message: "¿Eliminar esta imagen? No se puede deshacer.", variant: "danger", confirmText: "Aceptar" }))) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/productos/${productoId}/imagenes/${imagenId}`,
        { method: "DELETE" }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo eliminar");
      } else {
        await load();
        // load() refrescará y notifyPrincipal lo hará vía useEffect indirecto;
        // pero como onPrincipalChange depende del nuevo estado, lo emitimos
        // manualmente con un peek a las imágenes actualizadas en próximo render.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function move(imagenId: string, delta: -1 | 1) {
    const idx = imagenes.findIndex((i) => i.id === imagenId);
    if (idx < 0) return;
    const swapIdx = idx + delta;
    if (swapIdx < 0 || swapIdx >= imagenes.length) return;
    const a = imagenes[idx];
    const b = imagenes[swapIdx];
    // Intercambia los orden y persiste secuencialmente.
    setBusy(true);
    setError(null);
    try {
      const r1 = await fetchWithSupabaseSession(`/api/productos/${productoId}/imagenes/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden: b.orden }),
      });
      const j1 = await r1.json();
      if (!r1.ok || !j1?.success) {
        setError(j1?.error ?? "No se pudo reordenar");
        return;
      }
      const r2 = await fetchWithSupabaseSession(`/api/productos/${productoId}/imagenes/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden: a.orden }),
      });
      const j2 = await r2.json();
      if (!r2.ok || !j2?.success) {
        setError(j2?.error ?? "No se pudo reordenar");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Render
  const total = imagenes.length;
  const principal = imagenes.find((i) => i.es_principal);
  const principalUrl = principal?.imagen_url ?? fallbackUrl ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {total}/{MAX_IMAGENES} imágenes. La marcada como principal aparece en
          la card del catálogo.
        </p>
        <div>
          <label
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${
              total >= MAX_IMAGENES || busy
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-[#4FAEB2] hover:bg-[#3F8E91] text-white"
            }`}
          >
            <Upload size={14} aria-hidden="true" />
            {busy ? "Subiendo…" : "Agregar imagen"}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={handleUpload}
              disabled={total >= MAX_IMAGENES || busy}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Vista previa principal grande */}
      {principalUrl ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={principalUrl}
            alt={principal?.alt_text ?? "Imagen principal"}
            className="mx-auto max-h-48 object-contain"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
          <ImageOff size={28} className="mx-auto mb-2" aria-hidden="true" />
          Sin imagen principal todavía.
        </div>
      )}

      {/* Grilla de miniaturas con acciones */}
      {loading ? (
        <p className="text-xs text-slate-400">Cargando galería…</p>
      ) : imagenes.length === 0 ? (
        <p className="text-xs text-slate-400">No hay imágenes cargadas todavía.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {imagenes.map((img, idx) => (
            <div
              key={img.id}
              className={`relative rounded-lg border-2 overflow-hidden bg-white ${
                img.es_principal ? "border-amber-400" : "border-slate-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.imagen_url}
                alt={img.alt_text ?? `Imagen ${idx + 1}`}
                className="aspect-square w-full object-cover"
              />
              {img.es_principal && (
                <span className="absolute top-1 left-1 bg-amber-400 text-amber-900 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  Principal
                </span>
              )}
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(img.id, -1)}
                    disabled={idx === 0 || busy}
                    className="bg-white/90 hover:bg-white text-slate-700 text-[10px] px-1.5 py-0.5 rounded shadow disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Subir"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(img.id, 1)}
                    disabled={idx === imagenes.length - 1 || busy}
                    className="bg-white/90 hover:bg-white text-slate-700 text-[10px] px-1.5 py-0.5 rounded shadow disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Bajar"
                  >
                    →
                  </button>
                </div>
                <div className="flex gap-1">
                  {!img.es_principal && (
                    <button
                      type="button"
                      onClick={() => setPrincipal(img.id)}
                      disabled={busy}
                      className="bg-white/90 hover:bg-amber-400 hover:text-white text-amber-600 text-[10px] p-1 rounded shadow"
                      aria-label="Marcar como principal"
                      title="Marcar como principal"
                    >
                      <Star size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(img.id)}
                    disabled={busy}
                    className="bg-white/90 hover:bg-red-500 hover:text-white text-red-600 text-[10px] p-1 rounded shadow"
                    aria-label="Eliminar"
                    title="Eliminar"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
