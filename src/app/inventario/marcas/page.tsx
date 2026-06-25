"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface Marca {
  id: string;
  nombre: string;
  slug_web: string;
  descripcion_web: string | null;
  logo_url: string | null;
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

export default function MarcasPage() {
  const [items, setItems] = useState<Marca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [slugWeb, setSlugWeb] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/inventario/marcas?todas=1");
      const j = await r.json();
      if (r.ok && j?.success) setItems(j.data.marcas as Marca[]);
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
      const r = await fetchWithSupabaseSession("/api/inventario/marcas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          slug_web: slugWeb.trim() || slugify(nombre),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo crear.");
      } else {
        setNombre("");
        setSlugWeb("");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCreating(false);
    }
  }

  async function patchMarca(id: string, patch: Record<string, unknown>) {
    const r = await fetchWithSupabaseSession(`/api/inventario/marcas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (r.ok && j?.success) await load();
    else setError(j?.error ?? "No se pudo actualizar.");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Marcas</h1>
          <p className="text-gray-600">
            Las marcas se muestran en la web dentro de cada categoría.
          </p>
          <div className="mt-3 max-w-2xl rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            Cuando creás o editás un producto, podés asignarle una marca formal de
            esta lista. El campo de marca como texto libre se mantiene por
            compatibilidad con productos antiguos.
          </div>
        </div>
        <Link href="/inventario" className="text-sm text-sky-700 hover:text-sky-900 underline">
          ← Volver a Inventario
        </Link>
      </div>

      {/* Alta */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-3xl">
        <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">
          Nueva marca
        </p>
        <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Giorgio Armani"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Slug web (opcional)</label>
            <input
              value={slugWeb}
              onChange={(e) => setSlugWeb(e.target.value)}
              placeholder={nombre ? slugify(nombre) : "giorgio-armani"}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Si lo dejás vacío, se genera desde el nombre.
            </p>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating || !nombre.trim()}
              className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {creating ? "Creando..." : "Crear marca"}
            </button>
          </div>
        </form>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-gray-400">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Todavía no cargaste marcas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left px-4 py-2">Slug web</th>
                <th className="text-left px-4 py-2">Orden web</th>
                <th className="text-left px-4 py-2">Visible web</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">
                    <input
                      defaultValue={m.nombre}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== m.nombre) patchMarca(m.id, { nombre: v });
                      }}
                      className="w-40 border border-slate-200 rounded px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      defaultValue={m.slug_web}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toLowerCase();
                        if (v && v !== m.slug_web) patchMarca(m.id, { slug_web: v });
                      }}
                      className="w-40 border border-slate-200 rounded px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      defaultValue={m.orden_web}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const next = v === "" ? 0 : Number(v);
                        if (next !== m.orden_web) patchMarca(m.id, { orden_web: next });
                      }}
                      className="w-20 border border-slate-200 rounded px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => patchMarca(m.id, { visible_web: !m.visible_web })}
                      className={`text-xs px-2 py-0.5 rounded ${
                        m.visible_web
                          ? "bg-sky-100 text-sky-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {m.visible_web ? "Visible" : "Oculta"}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    {m.activo ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        Activa
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        Inactiva
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => patchMarca(m.id, { activo: !m.activo })}
                      className="text-xs text-sky-700 hover:text-sky-900 underline"
                    >
                      {m.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
