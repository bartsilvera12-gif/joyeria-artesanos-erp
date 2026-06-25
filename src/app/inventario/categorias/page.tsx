"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Upload, ImageOff, Power, PowerOff, Trash2, AlertTriangle } from "lucide-react";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

type Confirmacion =
  | null
  | {
      tipo: "quitar-imagen" | "borrar";
      cat: { id: string; nombre: string };
    };

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
  const [creating, setCreating] = useState(false);
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  // Modal de confirmación integrado (reemplaza window.confirm).
  const [confirmacion, setConfirmacion] = useState<Confirmacion>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirm, setErrorConfirm] = useState<string | null>(null);

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
      setNombre(""); setCodigo("");
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

  function pedirQuitarImagen(cat: Categoria) {
    setErrorConfirm(null);
    setConfirmacion({ tipo: "quitar-imagen", cat: { id: cat.id, nombre: cat.nombre } });
  }
  function pedirBorrar(cat: Categoria) {
    setErrorConfirm(null);
    setConfirmacion({ tipo: "borrar", cat: { id: cat.id, nombre: cat.nombre } });
  }

  async function ejecutarConfirmacion() {
    if (!confirmacion || confirmando) return;
    setConfirmando(true);
    setErrorConfirm(null);
    try {
      const url =
        confirmacion.tipo === "quitar-imagen"
          ? `/api/inventario/categorias/${confirmacion.cat.id}/imagen`
          : `/api/inventario/categorias/${confirmacion.cat.id}`;
      const r = await fetch(url, { method: "DELETE", credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      setConfirmacion(null);
      await load();
    } catch (e) {
      setErrorConfirm(e instanceof Error ? e.message : "No se pudo completar la operación.");
    } finally {
      setConfirmando(false);
    }
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
        <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
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
          <div className="md:col-span-2">
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
          <div className="md:col-span-2">
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
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Web</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                return (
                  <CategoriaRow
                    key={c.id}
                    cat={c}
                    onToggleActivo={() => toggleActivo(c)}
                    onToggleVisibleWeb={() => toggleVisibleWeb(c)}
                    onSubirImagen={(f) => subirImagen(c, f)}
                    onQuitarImagen={() => pedirQuitarImagen(c)}
                    onBorrar={() => pedirBorrar(c)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de confirmación integrado (borrar / quitar imagen). */}
      {confirmacion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !confirmando) {
              setConfirmacion(null);
              setErrorConfirm(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start gap-4 p-6">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                confirmacion.tipo === "borrar" ? "bg-red-50" : "bg-amber-50"
              }`}>
                {confirmacion.tipo === "borrar" ? (
                  <Trash2 className="h-5 w-5 text-red-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">
                  {confirmacion.tipo === "borrar" ? "¿Borrar categoría?" : "¿Quitar imagen?"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {confirmacion.tipo === "borrar" ? (
                    <>
                      Se va a eliminar definitivamente <span className="font-medium text-slate-800">&quot;{confirmacion.cat.nombre}&quot;</span>. Si hay productos asociados, la operación va a fallar — desactivala en su lugar.
                    </>
                  ) : (
                    <>
                      Se va a quitar la imagen de <span className="font-medium text-slate-800">&quot;{confirmacion.cat.nombre}&quot;</span>. Podés volver a subir otra en cualquier momento.
                    </>
                  )}
                </p>
                {errorConfirm && (
                  <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {errorConfirm}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => { setConfirmacion(null); setErrorConfirm(null); }}
                disabled={confirmando}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarConfirmacion}
                disabled={confirmando}
                className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  confirmacion.tipo === "borrar"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {confirmando
                  ? "Procesando…"
                  : confirmacion.tipo === "borrar"
                    ? "Sí, borrar"
                    : "Sí, quitar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriaRow({
  cat,
  onToggleActivo,
  onToggleVisibleWeb,
  onSubirImagen,
  onQuitarImagen,
  onBorrar,
}: {
  cat: Categoria;
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
        <div className="inline-flex items-center gap-1.5 justify-end">
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
            type="button"
            onClick={() => fileRef.current?.click()}
            title={cat.imagen_url ? "Cambiar imagen" : "Subir imagen"}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          {cat.imagen_url && (
            <button
              type="button"
              onClick={onQuitarImagen}
              title="Quitar imagen"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <ImageOff className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleActivo}
            title={cat.activo ? "Desactivar" : "Activar"}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors ${
              cat.activo
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100"
            }`}
            aria-pressed={cat.activo}
          >
            {cat.activo ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onBorrar}
            title="Borrar categoría"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            aria-label="Borrar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
