"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface ClienteSnap {
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  zip?: string | null;
}

interface ProductoSnap {
  nombre?: string | null;
  marca?: string | null;
  slug?: string | null;
  imagen_url?: string | null;
}

interface PedidoItemRow {
  id: string;
  producto_id: string;
  producto_snapshot: ProductoSnap | null;
  cantidad: number;
  precio_unitario: number | string;
  subtotal: number | string;
  created_at: string;
}

interface PedidoDetailRow {
  id: string;
  numero: string;
  estado: string;
  subtotal: number | string;
  total: number | string;
  payment_method: string | null;
  notas: string | null;
  cliente_snapshot: ClienteSnap | null;
  created_at: string;
  updated_at: string;
  items: PedidoItemRow[];
}

const ESTADOS = [
  "pendiente_pago",
  "en_revision",
  "confirmado_manual",
  "preparando",
  "enviado",
  "entregado",
  "cancelado",
] as const;

const LABEL: Record<string, string> = {
  pendiente_pago: "Pendiente de pago",
  en_revision: "En revisión",
  confirmado_manual: "Confirmado",
  preparando: "Preparando",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

function formatGs(n: number | string): string {
  const v = typeof n === "number" ? n : Number(n);
  return `Gs. ${(Number.isFinite(v) ? v : 0).toLocaleString("es-PY")}`;
}

function buildWa(p: PedidoDetailRow): string | null {
  const tel = (p.cliente_snapshot?.telefono ?? "").replace(/\D/g, "");
  if (!tel) return null;
  const msg = `Hola ${p.cliente_snapshot?.nombre ?? ""}! Te escribimos por tu pedido ${p.numero} en Elevate.`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}

export default function PedidoWebDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const [pedido, setPedido] = useState<PedidoDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingEstado, setSavingEstado] = useState(false);
  const [savingNotas, setSavingNotas] = useState(false);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    setLoading(true);
    fetchWithSupabaseSession(`/api/pedidos-web/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j?.success && j.data?.pedido) {
          const p = j.data.pedido as PedidoDetailRow;
          setPedido(p);
          setNotas(p.notas ?? "");
        } else {
          setError(j?.error || "No se pudo cargar el pedido.");
        }
      })
      .catch((e: unknown) => {
        if (!cancel) setError(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const r = await fetchWithSupabaseSession(`/api/pedidos-web/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>));
    if (!r.ok || !(j as { success?: boolean }).success) {
      setError((j as { error?: string }).error ?? "No se pudo actualizar.");
      return false;
    }
    const updated = (j as { data?: { pedido?: PedidoDetailRow } }).data?.pedido;
    if (updated) setPedido(updated);
    return true;
  }

  async function onEstadoChange(nuevo: string) {
    if (!pedido || nuevo === pedido.estado) return;
    setSavingEstado(true);
    setError(null);
    await patch({ estado: nuevo });
    setSavingEstado(false);
  }

  async function onGuardarNotas() {
    setSavingNotas(true);
    setError(null);
    await patch({ notas });
    setSavingNotas(false);
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Cargando…</div>;
  if (!pedido) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{error || "Pedido no encontrado."}</p>
        <Link href="/pedidos-web" className="text-sm text-[#4FAEB2] hover:underline mt-3 inline-block">
          ← Volver al listado
        </Link>
      </div>
    );
  }

  const c = pedido.cliente_snapshot ?? {};
  const wa = buildWa(pedido);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/pedidos-web" className="text-xs text-slate-500 hover:text-slate-700">
            ← Pedidos Web
          </Link>
          <h1 className="text-2xl font-semibold text-slate-800 mt-1">Pedido {pedido.numero}</h1>
        </div>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            WhatsApp al cliente
          </a>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Items</h2>
            <ul className="divide-y divide-slate-100">
              {pedido.items.map((it) => (
                <li key={it.id} className="py-3 flex justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500">{it.producto_snapshot?.marca ?? ""}</div>
                    <div className="font-medium">{it.producto_snapshot?.nombre ?? "—"}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {it.cantidad} × {formatGs(it.precio_unitario)}
                    </div>
                  </div>
                  <div className="text-right font-medium">{formatGs(it.subtotal)}</div>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 mt-4 pt-3 flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span>{formatGs(pedido.subtotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold mt-2">
              <span>Total</span>
              <span>{formatGs(pedido.total)}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Notas internas</h2>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Anotaciones internas — solo visibles para el equipo."
            />
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={onGuardarNotas}
                disabled={savingNotas}
                className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
              >
                {savingNotas ? "Guardando…" : "Guardar notas"}
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Cliente</h2>
            <dl className="text-sm space-y-2">
              <div>
                <dt className="text-xs text-slate-500">Nombre</dt>
                <dd className="text-slate-800">{c.nombre ?? "—"}</dd>
              </div>
              {c.telefono && (
                <div>
                  <dt className="text-xs text-slate-500">Teléfono</dt>
                  <dd className="text-slate-800">{c.telefono}</dd>
                </div>
              )}
              {c.email && (
                <div>
                  <dt className="text-xs text-slate-500">Email</dt>
                  <dd className="text-slate-800">{c.email}</dd>
                </div>
              )}
              {c.direccion && (
                <div>
                  <dt className="text-xs text-slate-500">Dirección</dt>
                  <dd className="text-slate-800">
                    {c.direccion}
                    {c.ciudad ? `, ${c.ciudad}` : ""}
                    {c.zip ? ` (${c.zip})` : ""}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Estado</h2>
            <select
              value={pedido.estado}
              onChange={(e) => onEstadoChange(e.target.value)}
              disabled={savingEstado}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {LABEL[s]}
                </option>
              ))}
            </select>
            {savingEstado && <p className="text-xs text-slate-500 mt-2">Guardando estado…</p>}
            <p className="text-xs text-slate-500 mt-3">
              Pedido recibido el {new Date(pedido.created_at).toLocaleString("es-PY")}.
            </p>
            <p className="text-xs text-slate-500">
              Última actualización: {new Date(pedido.updated_at).toLocaleString("es-PY")}.
            </p>
            <p className="text-xs text-slate-400 mt-3 italic">
              Confirmar venta y descontar stock se hace en una fase posterior.
            </p>
          </div>

          {pedido.payment_method && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-semibold text-slate-700 mb-2">Pago</h2>
              <p className="text-sm capitalize">{pedido.payment_method}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
