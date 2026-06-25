"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface ClienteSnap {
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  ciudad?: string | null;
}

interface PedidoListRow {
  id: string;
  numero: string;
  estado: string;
  total: number | string;
  payment_method: string | null;
  created_at: string;
  cliente_snapshot: ClienteSnap | null;
}

const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "pendiente_pago", label: "Pendiente de pago" },
  { value: "en_revision", label: "En revisión" },
  { value: "confirmado_manual", label: "Confirmado" },
  { value: "preparando", label: "Preparando" },
  { value: "enviado", label: "Enviado" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
];

const ESTADO_BADGE: Record<string, string> = {
  pendiente_pago: "bg-yellow-100 text-yellow-800",
  en_revision: "bg-blue-100 text-blue-800",
  confirmado_manual: "bg-emerald-100 text-emerald-800",
  preparando: "bg-indigo-100 text-indigo-800",
  enviado: "bg-purple-100 text-purple-800",
  entregado: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
};

function formatGs(n: number | string): string {
  const v = typeof n === "number" ? n : Number(n);
  return `Gs. ${(Number.isFinite(v) ? v : 0).toLocaleString("es-PY")}`;
}

function formatFecha(s: string): string {
  return new Date(s).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

export default function PedidosWebPage() {
  const [estado, setEstado] = useState("");
  const [query, setQuery] = useState("");
  const [pedidos, setPedidos] = useState<PedidoListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (estado) qs.set("estado", estado);
    if (query.trim()) qs.set("q", query.trim());
    fetchWithSupabaseSession(`/api/pedidos-web?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j?.success && Array.isArray(j.data?.pedidos)) {
          setPedidos(j.data.pedidos as PedidoListRow[]);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [estado, query]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter((p) => {
      const c = p.cliente_snapshot ?? {};
      const hay = [
        p.numero,
        c.nombre ?? "",
        c.telefono ?? "",
        c.email ?? "",
        c.ciudad ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pedidos, query]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Pedidos Web</h1>
        <p className="text-sm text-slate-500">
          Pedidos generados desde la tienda pública. No descuentan stock ni crean ventas hasta que se confirmen.
        </p>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-slate-600 mb-1">Buscar</label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="N° pedido, cliente, teléfono…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Estado</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {ESTADOS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No hay pedidos para mostrar.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">N°</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Contacto</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((p) => {
                const c = p.cliente_snapshot ?? {};
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-700">{p.numero}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{c.nombre ?? "—"}</div>
                      {c.ciudad && <div className="text-xs text-slate-500">{c.ciudad}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.telefono && <div>{c.telefono}</div>}
                      {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatGs(p.total)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs ${
                          ESTADO_BADGE[p.estado] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {ESTADOS.find((s) => s.value === p.estado)?.label ?? p.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatFecha(p.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/pedidos-web/${p.id}`}
                        className="text-[#4FAEB2] hover:underline text-sm"
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
