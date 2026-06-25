"use client";

/**
 * Pedidos armados por el vendedor en /buscador y enviados a caja.
 * Lista solo los `pedidos_caja` con estado='pendiente' de la empresa.
 *
 * Distinto de PedidosPendientesCaja (que muestra pedidos web — pedidos_web).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { Send, RefreshCw, Loader2 } from "lucide-react";

type Item = { producto_id: string; producto_nombre: string; cantidad: number; precio_venta: number };

type Pedido = {
  id: string;
  titulo: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  observacion: string | null;
  items: Item[];
  total_estimado: number;
  armado_por_email: string | null;
  created_at: string;
};

function fmtGs(v: number) {
  return `Gs. ${Math.round(v || 0).toLocaleString("es-PY")}`;
}

function fmtFecha(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function PedidosCajaPendientes() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetchWithSupabaseSession("/api/pedidos-caja?estado=pendiente", { cache: "no-store" });
      const j = await r.json();
      if (!j?.success) { setPedidos([]); return; }
      setPedidos((j.data?.pedidos ?? []) as Pedido[]);
    } catch {
      setPedidos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
        Cargando pedidos del salón…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Pedidos del salón
            {pedidos.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                {pedidos.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500">Enviados por vendedores desde Consulta, esperando cobro.</p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Actualizar
        </button>
      </div>

      {pedidos.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">No hay pedidos del salón esperando cobro.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {pedidos.map((p) => {
            const cantItems = Array.isArray(p.items) ? p.items.length : 0;
            const cantTotal = Array.isArray(p.items)
              ? p.items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0)
              : 0;
            return (
              <li key={p.id} className="px-4 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-800 truncate">{p.titulo}</p>
                      <span className="text-[11px] text-slate-400">{fmtFecha(p.created_at)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {p.cliente_nombre ?? "Sin cliente"}
                      {p.cliente_telefono && <span className="ml-1 text-slate-400">· {p.cliente_telefono}</span>}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {cantItems} producto{cantItems === 1 ? "" : "s"} · {cantTotal} unidad{cantTotal === 1 ? "" : "es"}
                      {p.armado_por_email && <span className="ml-1 text-slate-400">· vendedor: {p.armado_por_email}</span>}
                    </div>
                    {p.observacion && (
                      <p className="mt-1 text-xs italic text-slate-500">&quot;{p.observacion}&quot;</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums text-slate-900">{fmtGs(p.total_estimado)}</div>
                    <Link
                      href={`/ventas/nueva?pedido_caja_id=${p.id}`}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Send className="h-3 w-3" />
                      Cobrar
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
