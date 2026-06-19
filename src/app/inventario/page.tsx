"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { CotizacionDolarCard } from "@/components/inventario/CotizacionDolarCard";

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function calcularMargenVenta(costo: number, precio: number): number {
  if (precio <= 0) return 0;
  return ((precio - costo) / precio) * 100;
}

function margenColor(margen: number): string {
  if (margen >= 40) return "text-green-600";
  if (margen >= 20) return "text-yellow-600";
  return "text-red-600";
}

export default function InventarioPage() {
  const { isAdmin } = useIsAdmin();
  const [todos, setTodos] = useState<Producto[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Único filtro visible: buscar por nombre (también matchea SKU/código internamente).
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let cancelled = false;
    getProductos().then((data) => {
      if (!cancelled) setTodos(data);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const q = busqueda.trim().toLowerCase();
  const productos = q
    ? todos.filter((p) => {
        const hay = [p.nombre, p.sku, p.codigo_barras ?? "", p.marca ?? ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : todos;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Inventario</h1>
        <p className="text-gray-600">Gestión de productos y control de stock</p>
      </div>

      <CotizacionDolarCard />

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        {/* Encabezado: título + buscador + acciones */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h2 className="text-xl font-semibold">Productos</h2>

          <div className="relative flex-1 min-w-[220px] max-w-md">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none"
              aria-label="Buscar producto"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/inventario/nuevo"
              className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Nuevo producto
            </Link>
            <ExportExcelButton url="/api/inventario/productos/export" />
            <ImportExcelButton
              entidad="Productos"
              previewUrl="/api/inventario/productos/import/preview"
              commitUrl="/api/inventario/productos/import/commit"
              templateUrl="/api/inventario/productos/import/template"
              permiteCrearFaltantes
              visible={isAdmin}
              onCompleted={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-3 text-xs text-gray-400">
          <span>
            Los productos ingresan desde{" "}
            <span className="font-medium text-gray-500">Compras</span>
          </span>
          <span>
            {productos.length} de {todos.length} productos
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="py-3 pr-4 font-medium">SKU</th>
                <th className="py-3 pr-4 font-medium">Costo Prom.</th>
                <th className="py-3 pr-4 font-medium">Precio Venta</th>
                <th className="py-3 pr-4 font-medium text-center">Stock</th>
                <th className="py-3 pr-4 font-medium text-center">Stock Mín.</th>
                <th className="py-3 pr-4 font-medium">Unidad</th>
                <th className="py-3 pr-4 font-medium text-right">
                  <span title="(precio - costo) / precio × 100">Margen s/venta</span>
                </th>
                <th className="py-3 pl-4 font-medium text-right w-28">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {productos.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-4 pr-4 font-medium text-gray-800">{p.nombre}</td>
                    <td className="py-4 pr-4 text-gray-500 font-mono">{p.sku}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.costo_promedio)}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.precio_venta)}</td>
                    <td className="py-4 pr-4 text-center">
                      <span
                        className={`font-semibold ${stockBajo ? "text-red-600" : "text-gray-800"}`}
                      >
                        {p.stock_actual}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-center text-gray-500">{p.stock_minimo}</td>
                    <td className="py-4 pr-4 text-gray-600">{p.unidad_medida}</td>
                    <td
                      className={`py-4 pr-4 text-right tabular-nums font-semibold ${margenColor(margen)}`}
                    >
                      {p.precio_venta > 0 ? `${margen.toFixed(2)}%` : "—"}
                    </td>
                    <td className="py-4 pl-4 text-right">
                      <Link
                        href={`/inventario/${p.id}/editar`}
                        className="inline-block px-3 py-1.5 text-xs font-medium text-[#0EA5E9] hover:text-white hover:bg-[#0EA5E9] border border-[#0EA5E9] rounded-md transition-colors"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {productos.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-gray-400">
                    No hay productos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
