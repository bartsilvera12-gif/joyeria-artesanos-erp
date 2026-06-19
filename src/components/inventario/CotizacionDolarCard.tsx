"use client";

import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface CotizacionPayload {
  id: string;
  cotizacion: number;
  vigente_desde: string;
}

interface ApiResponse {
  success: boolean;
  data?: { cotizacion: CotizacionPayload | null };
  error?: string;
}

function formatGs(n: number): string {
  return n.toLocaleString("es-PY", { maximumFractionDigits: 4 });
}

function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Card "Cotización del dólar" del módulo Inventario.
 *
 * GET /api/inventario/cotizacion-dolar para leer la vigente.
 * POST con `{ cotizacion }` para guardar una nueva (append-only en DB).
 *
 * La web pública lee desde GET /api/public/elevate/cotizacion y muestra el
 * equivalente USD debajo del precio en Gs.
 */
export function CotizacionDolarCard() {
  const [actual, setActual] = useState<CotizacionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cargar = () => {
    setLoading(true);
    fetchWithSupabaseSession("/api/inventario/cotizacion-dolar", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as ApiResponse;
        if (r.ok && j?.success) {
          setActual(j.data?.cotizacion ?? null);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargar();
  }, []);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    const valor = Number(input.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      setMensaje({ tipo: "error", texto: "Ingresá un número mayor a 0." });
      return;
    }
    setSaving(true);
    try {
      const r = await fetchWithSupabaseSession("/api/inventario/cotizacion-dolar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotizacion: valor }),
      });
      const j = (await r.json().catch(() => ({}))) as ApiResponse;
      if (!r.ok || !j?.success) {
        setMensaje({ tipo: "error", texto: j?.error ?? `Error ${r.status}` });
        return;
      }
      setActual(j.data?.cotizacion ?? null);
      setInput("");
      setMensaje({ tipo: "ok", texto: "Cotización actualizada." });
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error de red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="cotizacion-dolar-card"
      className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl shadow-sm p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <DollarSign size={20} className="text-emerald-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-emerald-800">Cotización del dólar</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Cotización vigente
          </p>
          {loading ? (
            <p className="text-sm text-slate-400">Cargando…</p>
          ) : actual ? (
            <>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">
                Gs. {formatGs(actual.cotizacion)}{" "}
                <span className="text-sm font-normal text-slate-500">/ USD</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Última actualización: {formatFechaHora(actual.vigente_desde)}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500 italic">
              Sin cotización cargada. La web solo mostrará precios en guaraníes.
            </p>
          )}
        </div>

        <form onSubmit={handleGuardar} className="space-y-2">
          <label
            htmlFor="cotizacion-dolar-input"
            className="block text-xs uppercase tracking-wide text-slate-500"
          >
            Nueva cotización (Gs. por 1 USD)
          </label>
          <div className="flex gap-2">
            <input
              id="cotizacion-dolar-input"
              type="number"
              min="0"
              step="0.0001"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ej. 7500"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving || !input}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {mensaje && (
            <p
              className={`text-xs ${
                mensaje.tipo === "ok" ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {mensaje.texto}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
