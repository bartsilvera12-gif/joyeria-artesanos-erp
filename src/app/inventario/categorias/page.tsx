"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

interface Categoria {
  id: string;
  nombre: string;
  codigo: string | null;
  descripcion: string | null;
  parent_id: string | null;
  activo: boolean;
  visible_web?: boolean;
  imagen_path?: string | null;
  imagen_url?: string | null;
}

export default function CategoriasProductosPage() {
  const { isAdmin } = useIsAdmin();
  const [items, setItems] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form alta
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [parentId, setParentId] = useState("");
  const [creating, setCreating] = useState(false);
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/categorias?todas=1", { credentials: "include" });
      const j = await r.json();
      if (r.ok && j?.success) setItems(j.data.categorias as Categoria[]);
      else setError(j?.error ?? "No se pudo cargar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: nombre.trim(),
          codigo: codigo.trim() || null,
          parent_id: parentId || null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo crear.");
        return;
      }
      // Si el usuario eligió imagen, súbela contra la categoría recién creada.
      const nuevaId: string | undefined = j.data?.categoria?.id ?? j.data?.id;
      if (imagenFile && nuevaId) {
        const fd = new FormData();
        fd.append("file", imagenFile);
        const ru = await fetch(`/api/inventario/categorias/${nuevaId}/imagen`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const ju = await ru.json().catch(() => null);
        if (!ru.ok || !ju?.success) {
          setError(`Categoría creada, pero falló la imagen: ${ju?.error ?? ru.statusText}`);
        }
      }
      setNombre(""); setCodigo(""); setParentId("");
      setImagenFile(null); setImagenPreview(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCreating(false);
    }
  }

  function handleImagenChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (!f) { setImagenFile(null); setImagenPreview(null); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setError("Formato no permitido. Usá JPG, PNG o WebP.");
      e.target.value = "";
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Imagen demasiado grande (máx. 5 MB).");
      e.target.value = "";
      return;
    }
    setImagenFile(f);
    setImagenPreview(URL.createObjectURL(f));
  }

  async function toggleActivo(cat: Categoria) {
    const r = await fetch(`/api/inventario/categorias/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activo: !cat.activo }),
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo actualizar.");
  }

  async function toggleVisibleWeb(cat: Categoria) {
    const r = await fetch(`/api/inventario/categorias/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ visible_web: !cat.visible_web }),
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo actualizar.");
  }

  async function subirImagen(cat: Categoria, file: File) {
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/inventario/categorias/${cat.id}/imagen`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo subir la imagen.");
  }

  async function quitarImagen(cat: Categoria) {
    const ok = window.confirm(`¿Quitar la imagen de "${cat.nombre}"?`);
    if (!ok) return;
    setError(null);
    const r = await fetch(`/api/inventario/categorias/${cat.id}/imagen`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo quitar la imagen.");
  }

  async function borrar(cat: Categoria) {
    const ok = window.confirm(
      `¿Borrar la categoría "${cat.nombre}"?\n\n` +
      `Esta acción no se puede deshacer. Si hay productos usándola, no se va a poder borrar — desactivala en su lugar.`
    );
    if (!ok) return;
    setError(null);
    const r = await fetch(`/api/inventario/categorias/${cat.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo borrar.");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Categorías de productos</h1>
          <p className="text-gray-600">Clasificá tus productos para reportes y búsqueda.</p>
          <div className="mt-3 max-w-2xl rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            Estas categorías aparecen en el selector <strong>Categoría principal</strong> de Nuevo producto.
            Los <Link href="/proveedores/categorias" className="underline font-medium">rubros de proveedor</Link>{" "}
            también se importan automáticamente acá, así no tenés que cargarlos dos veces.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ExportExcelButton url="/api/inventario/categorias/export" />
          <ImportExcelButton
            entidad="Categorías"
            previewUrl="/api/inventario/categorias/import/preview"
            commitUrl="/api/inventario/categorias/import/commit"
            templateUrl="/api/inventario/categorias/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={load}
          />
          <Link href="/inventario" className="text-sm text-sky-700 hover:text-sky-900 underline">
            ← Volver a Inventario
          </Link>
        </div>
      </div>

      {/* Alta */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-3xl">
        <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">
          Nueva categoría
        </p>
        <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Anillos"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Código (opcional)</label>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej: ANI"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Categoría padre (opcional)</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— ninguna —</option>
              {items.filter((i) => i.activo).map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-gray-600 mb-1">Imagen (opcional)</label>
            <div className="flex items-start gap-3 flex-wrap">
              {imagenPreview ? (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagenPreview} alt="preview" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400">
                  Sin imagen
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImagenChange}
                  className="block text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 file:hover:bg-slate-200"
                />
                {imagenFile && (
                  <button
                    type="button"
                    onClick={() => { setImagenFile(null); setImagenPreview(null); }}
                    className="self-start text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Quitar imagen
                  </button>
                )}
                <p className="text-[11px] text-gray-400">JPG, PNG o WebP — máximo 5 MB.</p>
              </div>
            </div>
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={creating || !nombre.trim()}
              className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {creating ? "Creando..." : "Crear categoría"}
            </button>
          </div>
        </form>
        {error && (
          <p className="mt-2 text-xs text-red-700">{error}</p>
        )}
      </div>

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-gray-400">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Todavía no cargaste categorías.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 w-20">Imagen</th>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left px-4 py-2">Código</th>
                <th className="text-left px-4 py-2">Padre</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Web</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const parent = items.find((i) => i.id === c.parent_id);
                return (
                  <CategoriaRow
                    key={c.id}
                    cat={c}
                    parentNombre={parent?.nombre ?? null}
                    onToggleActivo={() => toggleActivo(c)}
                    onToggleVisibleWeb={() => toggleVisibleWeb(c)}
                    onSubirImagen={(f) => subirImagen(c, f)}
                    onQuitarImagen={() => quitarImagen(c)}
                    onBorrar={() => borrar(c)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CategoriaRow({
  cat,
  parentNombre,
  onToggleActivo,
  onToggleVisibleWeb,
  onSubirImagen,
  onQuitarImagen,
  onBorrar,
}: {
  cat: Categoria;
  parentNombre: string | null;
  onToggleActivo: () => void;
  onToggleVisibleWeb: () => void;
  onSubirImagen: (file: File) => void | Promise<void>;
  onQuitarImagen: () => void;
  onBorrar: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2">
        <div className="relative h-12 w-12 rounded-md overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
          {cat.imagen_url ? (
            <Image
              src={cat.imagen_url}
              alt={cat.nombre}
              fill
              sizes="48px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="text-[10px] text-slate-400">Sin img</span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 font-medium">{cat.nombre}</td>
      <td className="px-4 py-2 text-gray-500">{cat.codigo ?? "—"}</td>
      <td className="px-4 py-2 text-gray-500">{parentNombre ?? "—"}</td>
      <td className="px-4 py-2">
        {cat.activo ? (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Activo</span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Inactivo</span>
        )}
      </td>
      <td className="px-4 py-2">
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
          <input
            type="checkbox"
            checked={cat.visible_web !== false}
            onChange={onToggleVisibleWeb}
            className="rounded border-slate-300"
          />
          Visible
        </label>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="inline-flex items-center gap-3 flex-wrap justify-end">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onSubirImagen(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-slate-600 hover:text-slate-900 underline"
          >
            {cat.imagen_url ? "Cambiar imagen" : "Subir imagen"}
          </button>
          {cat.imagen_url && (
            <button
              onClick={onQuitarImagen}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Quitar
            </button>
          )}
          <button
            onClick={onToggleActivo}
            className="text-xs text-sky-700 hover:text-sky-900 underline"
          >
            {cat.activo ? "Desactivar" : "Activar"}
          </button>
          <button
            onClick={onBorrar}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            Borrar
          </button>
        </div>
      </td>
    </tr>
  );
}
