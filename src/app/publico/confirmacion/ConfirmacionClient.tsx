"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, MessageCircle } from "lucide-react";
import { formatPrice } from "@/lib/elevate-public/products-mock";

/**
 * Resultado del GET /api/public/elevate/pedidos/[numero]?token=… sanitizado.
 * Es la fuente de verdad. Si la API falla, caemos al snapshot local guardado
 * por el checkout (sessionStorage).
 */
interface PedidoApi {
  numero: string;
  estado: string;
  total: number;
  subtotal: number;
  created_at: string;
  cliente: { nombre: string | null; ciudad: string | null };
  items: Array<{
    nombre: string | null;
    marca: string | null;
    imagen_url: string | null;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }>;
}

interface OrderSnapshot {
  id: string;
  createdAt: string;
  items: { name: string; brand: string; qty: number; price: number }[];
  total: number;
  customer: { name: string; email: string; address: string; city: string };
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente_pago: "Pendiente de pago",
  en_revision: "En revisión",
  confirmado_manual: "Confirmado",
  preparando: "Preparando",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function ConfirmacionClient() {
  const params = useSearchParams();
  // soporte de URLs nuevas (`?pedido=…&token=…`) y legacy (`?order=…`)
  const numero = params.get("pedido") ?? params.get("order");
  const token = params.get("token");

  const [pedido, setPedido] = useState<PedidoApi | null>(null);
  const [snapshot, setSnapshot] = useState<OrderSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // 1) Snapshot local (siempre intentar como respaldo visual)
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem("elevate-last-order") : null;
      if (raw) setSnapshot(JSON.parse(raw) as OrderSnapshot);
    } catch {
      /* ignore */
    }
    // 2) Fetch real al ERP si tenemos numero+token
    if (numero && token) {
      fetch(
        `/api/public/elevate/pedidos/${encodeURIComponent(numero)}?token=${encodeURIComponent(token)}`,
        { cache: "no-store" }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { pedido?: PedidoApi } | null) => {
          if (j?.pedido) setPedido(j.pedido);
        })
        .catch(() => undefined)
        .finally(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [numero, token]);

  const estadoLabel = pedido ? ESTADO_LABEL[pedido.estado] ?? pedido.estado : null;

  return (
    <section className="pt-24 pb-12 sm:pt-32 sm:pb-24 min-h-[80vh] bg-gradient-to-b from-cream/40 to-background">
      <div className="container mx-auto px-6 lg:px-10 max-w-3xl">
        <div className="text-center mb-8 sm:mb-12 animate-fade-up">
          <div className="inline-flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-gold/15 border border-gold/40 mb-4 sm:mb-6">
            <Check size={32} className="text-gold" />
          </div>
          <span className="text-xs tracking-[0.4em] uppercase text-gold">Orden recibida</span>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl text-primary mt-3 text-balance">
            Gracias por elegir Elevate
          </h1>
          <div className="gold-divider w-20 sm:w-24 mx-auto my-4 sm:my-6" />
          <p className="font-editorial italic text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Tu orden{" "}
            <span className="text-primary not-italic font-medium">{numero ?? "—"}</span>{" "}
            fue registrada{estadoLabel ? ` (${estadoLabel})` : ""}. Te contactaremos por
            WhatsApp para coordinar el envío y confirmar el pago.
          </p>
        </div>

        {pedido && (
          <div className="bg-background border border-border p-5 sm:p-8 lg:p-10 shadow-soft">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl text-primary">Detalle de la orden</h2>
              <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                {new Date(pedido.created_at).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {pedido.items.map((it, i) => (
                <li key={i} className="py-4 flex justify-between gap-4">
                  <div>
                    {it.marca && (
                      <div className="text-[10px] tracking-[0.25em] uppercase text-gold">{it.marca}</div>
                    )}
                    <div className="font-display text-base text-primary">{it.nombre}</div>
                    <div className="text-xs text-muted-foreground mt-1">Cantidad: {it.cantidad}</div>
                  </div>
                  <div className="text-primary font-medium">{formatPrice(it.subtotal)}</div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between items-baseline border-t border-border pt-5 mt-2">
              <span className="text-xs tracking-[0.3em] uppercase">Total</span>
              <span className="font-display text-3xl text-primary">{formatPrice(pedido.total)}</span>
            </div>
            {pedido.cliente.nombre && (
              <div className="mt-8 pt-8 border-t border-border text-sm">
                <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Cliente</div>
                <div className="text-foreground">{pedido.cliente.nombre}</div>
                {pedido.cliente.ciudad && (
                  <div className="text-muted-foreground">{pedido.cliente.ciudad}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fallback al snapshot local cuando la API no devuelve nada */}
        {!pedido && loaded && snapshot && (
          <div className="bg-background border border-border p-5 sm:p-8 lg:p-10 shadow-soft">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl text-primary">Detalle de la orden</h2>
              <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                {new Date(snapshot.createdAt).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {snapshot.items.map((it, i) => (
                <li key={i} className="py-4 flex justify-between gap-4">
                  <div>
                    <div className="text-[10px] tracking-[0.25em] uppercase text-gold">{it.brand}</div>
                    <div className="font-display text-base text-primary">{it.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">Cantidad: {it.qty}</div>
                  </div>
                  <div className="text-primary font-medium">{formatPrice(it.price * it.qty)}</div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between items-baseline border-t border-border pt-5 mt-2">
              <span className="text-xs tracking-[0.3em] uppercase">Total</span>
              <span className="font-display text-3xl text-primary">{formatPrice(snapshot.total)}</span>
            </div>
          </div>
        )}

        <div className="mt-6 sm:mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/catalogo"
            className="inline-flex items-center justify-center px-8 py-4 border border-primary text-primary text-xs tracking-[0.3em] uppercase hover:bg-primary hover:text-primary-foreground transition-elegant"
          >
            Seguir explorando
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gold text-gold-foreground text-xs tracking-[0.3em] uppercase hover:bg-primary hover:text-primary-foreground transition-elegant shadow-soft"
          >
            <MessageCircle size={14} /> Volver al inicio
          </Link>
        </div>
      </div>
    </section>
  );
}
