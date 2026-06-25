"use client";
import { confirm } from "@/components/ui/dialog";

import { useCallback, useEffect, useState } from "react";
import { X, Trash2, Plus } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface Marca {
  id: string;
  nombre: string;
  slug_web: string;
  visible_web: boolean;
  activo: boolean;
}

interface MarcaAsociada extends Marca {
  relacion_id: string;
  orden: number;
}

interface Props {
  categoriaId: string;
  categoriaNombre: string;
  onClose: () => void;
}

/**
 * Modal "Gestionar marcas" de una categoría.
 *
 * Permite:
 *   - Listar marcas asociadas a la categoría.
 *   - Asociar una marca existente (select de marcas no asociadas).
 *   - Crear una marca nueva y asociarla en un solo paso.
 *   - Quitar la asociación (no borra la marca, solo desasocia).
 */
export function CategoriaMarcasModal({ categoriaId, categoriaNombre, onClose }: Props) {
  const [asociadas, setAsociadas] = useState<MarcaAsociada[]>([]);
  const [todas, setTodas] = useState<Marca[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Forms
  const [marcaIdSel, setMarcaIdSel] = useState("");
  const [nombreNueva, setNombreNueva] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rA, rT] = await Promise.all([
        fetchWithSupabaseSession(`/api/inventario/categorias/${categoriaId}/marcas`, {
          cache: "no-store",
        }),
        fetchWithSupabaseSession("/api/inventario/marcas?todas=1", { cache: "no-store" }),
      ]);
      const jA = await rA.json();
      const jT = await rT.json();
      if (rA.ok && jA?.success) setAsociadas((jA.data.marcas ?? []) as MarcaAsociada[]);
      else setError(jA?.error ?? "No se pudo cargar marcas asociadas.");
      if (rT.ok && jT?.success) setTodas((jT.data.marcas ?? []) as Marca[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [categoriaId]);

  useEffect(() => {
    load();
  }, [load]);

  // Cierra con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const idsAsociadas = new Set(asociadas.map((m) => m.id));
  const noAsociadas = todas.filter((m) => !idsAsociadas.has(m.id) && m.activo);

  async function handleAsociarExistente() {
    if (!marcaIdSel || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/inventario/categorias/${categoriaId}/marcas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marca_id: marcaIdSel }),
        }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo asociar.");
      } else {
        setMarcaIdSel("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCrearYAsociar() {
    const nombre = nombreNueva.trim();
    if (!nombre || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/inventario/categorias/${categoriaId}/marcas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre }),
        }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo crear la marca.");
      } else {
        setNombreNueva("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleQuitar(marcaId: string, marcaNombre: string) {
    if (!(await confirm({ title: `¿Quitar "${marcaNombre}"?`, message: "Se quitará de esta categoría. La marca seguirá existiendo.", variant: "warning", confirmText: "Quitar" }))) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/inventario/categorias/${categoriaId}/marcas/${marcaId}`,
        { method: "DELETE" }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo quitar.");
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80]"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Marcas de la categoría ${categoriaNombre}`}
        className="fixed inset-x-0 top-[10vh] mx-auto max-w-2xl bg-white rounded-xl shadow-2xl z-[90] max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase text-slate-400">
              Marcas asociadas
            </p>
            <h3 className="text-xl font-semibold text-slate-800">{categoriaNombre}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 text-slate-500 hover:text-slate-900"
          >
            <X />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Lista de asociadas */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Asociadas ({asociadas.length})
            </h4>
            {loading ? (
              <p className="text-sm text-slate-400">Cargando…</p>
            ) : asociadas.length === 0 ? (
              <p className="text-sm text-slate-400 italic">
                Aún no hay marcas asociadas a esta categoría.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {asociadas.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800">{m.nombre}</div>
                      <div className="text-xs text-slate-400 font-mono">{m.slug_web}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuitar(m.id, m.nombre)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      <Trash2 size={12} /> Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Asociar marca existente */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Asociar marca existente
            </h4>
            <div className="flex gap-2">
              <select
                value={marcaIdSel}
                onChange={(e) => setMarcaIdSel(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                disabled={busy || noAsociadas.length === 0}
              >
                <option value="">
                  {noAsociadas.length === 0
                    ? "— Todas las marcas ya están asociadas —"
                    : "— Seleccionar marca —"}
                </option>
                {noAsociadas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAsociarExistente}
                disabled={!marcaIdSel || busy}
                className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Asociar
              </button>
            </div>
          </section>

          {/* Crear marca nueva */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Crear marca nueva y asociar
            </h4>
            <div className="flex gap-2">
              <input
                value={nombreNueva}
                onChange={(e) => setNombreNueva(e.target.value)}
                placeholder="Nombre de la marca nueva"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                disabled={busy}
              />
              <button
                type="button"
                onClick={handleCrearYAsociar}
                disabled={!nombreNueva.trim() || busy}
                className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} /> Crear
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Crea la marca en{" "}
              <a href="/inventario/marcas" className="underline">/inventario/marcas</a>{" "}
              y la asocia automáticamente a esta categoría.
            </p>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="p-5 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2"
          >
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
