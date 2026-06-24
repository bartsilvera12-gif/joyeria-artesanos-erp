"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PedidoWebItem = {
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

type PedidoWeb = {
  id: string;
  numero: string;
  cliente_nombre: string;
  cliente_telefono: string;
  notas: string | null;
  subtotal: number;
  total: number;
  created_at: string;
  items: PedidoWebItem[];
};

function fmtGs(n: number) {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}
function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PedidosPendientesCaja() {
  const [pedidos, setPedidos] = useState<PedidoWeb[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetch("/api/caja/pedidos-web-pendientes", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j?.success && Array.isArray(j.data?.pedidos)) {
          setPedidos(j.data.pedidos as PedidoWeb[]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (loading || pedidos.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-amber-900">
          Pedidos web pendientes de cobro
          <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {pedidos.length}
          </span>
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-amber-700/80">
            <tr>
              <th className="py-2 pr-4 font-medium">N° pedido</th>
              <th className="py-2 pr-4 font-medium">Cliente</th>
              <th className="py-2 pr-4 font-medium">Items</th>
              <th className="py-2 pr-4 font-medium text-right">Total</th>
              <th className="py-2 pr-4 font-medium">Fecha</th>
              <th className="py-2 pr-2 font-medium text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {pedidos.map((p) => (
              <tr key={p.id} className="align-middle">
                <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-slate-800">{p.numero}</td>
                <td className="py-2.5 pr-4 text-slate-600">
                  <div className="leading-tight">{p.cliente_nombre}</div>
                  {p.cliente_telefono && p.cliente_telefono !== "-" && (
                    <div className="text-xs text-slate-400">{p.cliente_telefono}</div>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-slate-600">
                  {p.items.length === 0
                    ? "—"
                    : p.items
                        .slice(0, 2)
                        .map((it) => `${it.cantidad}× ${it.nombre}`)
                        .join(", ") + (p.items.length > 2 ? ` +${p.items.length - 2}` : "")}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums font-semibold text-slate-800">
                  {fmtGs(p.total)}
                </td>
                <td className="py-2.5 pr-4 text-slate-500">{fmtFecha(p.created_at)}</td>
                <td className="py-2.5 pr-2 text-right">
                  <Link
                    href={`/ventas/nueva?pedido_web_id=${p.id}`}
                    className="inline-flex items-center rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]"
                  >
                    Cobrar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
