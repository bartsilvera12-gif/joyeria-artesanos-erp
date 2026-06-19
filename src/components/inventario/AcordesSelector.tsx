"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export interface AcordeOption {
  id: string;
  nombre: string;
  slug_web: string;
  imagen_path: string | null;
  imagen_url: string | null;
  activo: boolean;
}

interface Props {
  /** IDs seleccionados en orden. El orden representa el ranking en la pirámide. */
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Multi-selector de acordes olfativos para el form de producto.
 *
 * Carga el catálogo de /api/inventario/acordes y muestra chips con miniatura
 * de imagen. Los acordes seleccionados aparecen primero (en su orden) seguidos
 * de los disponibles. Cliquear un acorde lo agrega/quita.
 */
export function AcordesSelector({ value, onChange }: Props) {
  const [opciones, setOpciones] = useState<AcordeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetchWithSupabaseSession("/api/inventario/acordes", { cache: "no-store" });
        const j = await r.json();
        if (cancel) return;
        if (r.ok && j?.success) setOpciones((j.data?.acordes ?? []) as AcordeOption[]);
        else setError(j?.error ?? "No se pudieron cargar los acordes.");
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error de red");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  const seleccionados = value
    .map((id) => opciones.find((o) => o.id === id))
    .filter((x): x is AcordeOption => !!x);
  const disponibles = opciones.filter((o) => !value.includes(o.id) && o.activo);

  return (
    <div className="border border-violet-200 bg-violet-50/30 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-violet-900">Acordes principales</h3>
          <p className="text-xs text-violet-700/80">
            Cliqueá los acordes que describen este perfume. El orden importa: el primero es el principal.
          </p>
        </div>
        <Link
          href="/inventario/acordes"
          className="text-xs font-medium text-violet-700 hover:text-violet-900 border border-violet-200 hover:bg-violet-100 px-2.5 py-1 rounded-md"
        >
          + Gestionar
        </Link>
      </div>

      {error && <p className="text-xs text-red-700 mb-2">{error}</p>}
      {loading ? (
        <p className="text-xs text-slate-500">Cargando acordes…</p>
      ) : opciones.length === 0 ? (
        <p className="text-xs text-slate-500">
          Todavía no cargaste acordes en{" "}
          <Link href="/inventario/acordes" className="underline">
            /inventario/acordes
          </Link>
          .
        </p>
      ) : (
        <>
          {seleccionados.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-wide text-violet-700 mb-1">
                Seleccionados ({seleccionados.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {seleccionados.map((o, i) => (
                  <AcordeChip key={o.id} acorde={o} order={i + 1} selected onClick={() => toggle(o.id)} />
                ))}
              </div>
            </div>
          )}
          {disponibles.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                Disponibles
              </p>
              <div className="flex flex-wrap gap-2">
                {disponibles.map((o) => (
                  <AcordeChip key={o.id} acorde={o} onClick={() => toggle(o.id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AcordeChip({
  acorde,
  selected = false,
  order,
  onClick,
}: {
  acorde: AcordeOption;
  selected?: boolean;
  order?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full border text-xs transition-colors ${
        selected
          ? "bg-violet-600 text-white border-violet-600 hover:bg-violet-700"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
      title={selected ? "Quitar de la selección" : "Agregar a la selección"}
    >
      <span
        className={`w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-semibold ${
          selected ? "bg-white/20" : "bg-slate-100 text-slate-500"
        }`}
      >
        {acorde.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={acorde.imagen_url} alt="" className="w-full h-full object-cover" />
        ) : (
          acorde.nombre.slice(0, 2).toUpperCase()
        )}
      </span>
      <span className="truncate max-w-[120px]">{acorde.nombre}</span>
      {selected && order != null && (
        <span className="ml-1 text-[10px] font-bold tabular-nums opacity-80">#{order}</span>
      )}
    </button>
  );
}
