"use client";
import { confirm } from "@/components/ui/dialog";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface Acorde {
  id: string;
  nombre: string;
  slug_web: string;
  imagen_path: string | null;
  imagen_url: string | null;
  visible_web: boolean;
  orden_web: number;
  activo: boolean;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function AcordesPage() {
  const [items, setItems] = useState<Acorde[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/inventario/acordes?todas=1");
      const j = await r.json();
      if (r.ok && j?.success) setItems(j.data.acordes as Acorde[]);
      else setError(j?.error ?? "No se pudo cargar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/inventario/acordes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), slug_web: slugify(nombre) }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) setError(j?.error ?? "No se pudo crear.");
      else {
        setNombre("");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCreating(false);
    }
  }

  async function patchAcorde(id: string, patch: Record<string, unknown>) {
    const r = await fetchWithSupabaseSession(`/api/inventario/acordes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (r.ok && j?.success) await load();
    else setError(j?.error ?? "No se pudo actualizar.");
  }

  async function uploadImagen(id: string, file: File) {
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetchWithSupabaseSession(`/api/inventario/acordes/${id}/imagen`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (!r.ok || !j?.success) setError(j?.error ?? "No se pudo subir la imagen.");
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }

  async function quitarImagen(id: string) {
    if (!(await confirm({ message: "¿Quitar la imagen de este acorde?", variant: "danger", confirmText: "Aceptar" }))) return;
    const r = await fetchWithSupabaseSession(`/api/inventario/acordes/${id}/imagen`, {
      method: "DELETE",
    });
    const j = await r.json();
    if (r.ok && j?.success) await load();
    else setError(j?.error ?? "No se pudo quitar la imagen.");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Acordes olfativos</h1>
          <p className="text-gray-600">
            Catálogo de acordes (cítrico, amaderado, fresco…) con imagen, para asignar a cada perfume.
          </p>
        </div>
        <Link href="/inventario" className="text-sm text-sky-700 hover:text-sky-900 underline">
          ← Volver a Inventario
        </Link>
      </div>

      {/* Alta */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl">
        <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">Nuevo acorde</p>
        <form onSubmit={handleCrear} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-gray-600 mb-1">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Cítrico"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={creating || !nombre.trim()}
            className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {creating ? "Creando..." : "Crear acorde"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-gray-400">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Todavía no cargaste acordes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 w-20">Imagen</th>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left px-4 py-2">Slug</th>
                <th className="text-left px-4 py-2 w-24">Orden</th>
                <th className="text-left px-4 py-2 w-28">Visible web</th>
                <th className="text-left px-4 py-2 w-24">Estado</th>
                <th className="px-4 py-2 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <AcordeRow
                  key={a.id}
                  acorde={a}
                  onPatch={(p) => patchAcorde(a.id, p)}
                  onUpload={(f) => uploadImagen(a.id, f)}
                  onQuitarImagen={() => quitarImagen(a.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AcordeRow({
  acorde,
  onPatch,
  onUpload,
  onQuitarImagen,
}: {
  acorde: Acorde;
  onPatch: (p: Record<string, unknown>) => void;
  onUpload: (f: File) => void;
  onQuitarImagen: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <tr className="border-t border-slate-100 align-middle">
      <td className="px-4 py-2">
        <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-[10px] text-slate-500">
          {acorde.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={acorde.imagen_url} alt={acorde.nombre} className="w-full h-full object-cover" />
          ) : (
            "Sin img"
          )}
        </div>
      </td>
      <td className="px-4 py-2 font-medium">
        <input
          defaultValue={acorde.nombre}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== acorde.nombre) onPatch({ nombre: v });
          }}
          className="w-40 border border-slate-200 rounded px-2 py-1 text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <input
          defaultValue={acorde.slug_web}
          onBlur={(e) => {
            const v = e.target.value.trim().toLowerCase();
            if (v && v !== acorde.slug_web) onPatch({ slug_web: v });
          }}
          className="w-40 border border-slate-200 rounded px-2 py-1 text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          defaultValue={acorde.orden_web}
          onBlur={(e) => {
            const next = e.target.value.trim() === "" ? 0 : Number(e.target.value);
            if (next !== acorde.orden_web) onPatch({ orden_web: next });
          }}
          className="w-20 border border-slate-200 rounded px-2 py-1 text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <button
          onClick={() => onPatch({ visible_web: !acorde.visible_web })}
          className={`text-xs px-2 py-0.5 rounded ${
            acorde.visible_web ? "bg-sky-100 text-sky-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {acorde.visible_web ? "Visible" : "Oculto"}
        </button>
      </td>
      <td className="px-4 py-2">
        {acorde.activo ? (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Activo</span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Inactivo</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-sky-700 hover:text-sky-900 underline"
          >
            {acorde.imagen_url ? "Cambiar imagen" : "Subir imagen"}
          </button>
          {acorde.imagen_url && (
            <button
              onClick={onQuitarImagen}
              className="text-xs text-red-600 hover:text-red-800 underline"
            >
              Quitar imagen
            </button>
          )}
          <button
            onClick={() => onPatch({ activo: !acorde.activo })}
            className="text-xs text-slate-600 hover:text-slate-800 underline"
          >
            {acorde.activo ? "Desactivar" : "Activar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
