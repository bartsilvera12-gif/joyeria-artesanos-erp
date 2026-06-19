"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart, effectivePrice, effectiveImage, effectiveLabel } from "@/components/elevate-public/CartContext";
import { formatPrice, WHATSAPP_NUMBER } from "@/lib/elevate-public/products-mock";

interface Form {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
  notes: string;
  payment: "transferencia" | "tarjeta";
}

export default function CheckoutPage() {
  const { items, setQty, remove, total, clear } = useCart();
  const router = useRouter();
  const [form, setForm] = useState<Form>({
    name: "", email: "", phone: "", address: "", city: "", zip: "", notes: "", payment: "transferencia",
  });
  // Número de WhatsApp para el botón "Consultar por WhatsApp". Se prioriza
  // el env var; fallback al número oficial del cliente para que el CTA
  // funcione aun sin configuración.
  const waNumber = WHATSAPP_NUMBER || "595994570003";
  const waConsultaUrl = `https://wa.me/${waNumber}`;

  const update = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    // 1. Crear pedido en ERP (RPC server-side recalcula precios reales).
    let createdNumero: string | null = null;
    let createdToken: string | null = null;
    let createdTotal: number = total;
    try {
      const r = await fetch("/api/public/elevate/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: {
            nombre: form.name,
            email: form.email,
            telefono: form.phone,
            direccion: form.address,
            ciudad: form.city,
            zip: form.zip,
          },
          // Fase Presentaciones: el server recalcula precio desde la fila
          // correcta (productos o producto_presentaciones). Solo mandamos ids.
          items: items.map((i) => ({
            producto_id: i.product.id,
            presentacion_id: i.presentacion?.id ?? null,
            cantidad: i.qty,
          })),
          payment_method: form.payment,
          notas: form.notes,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        numero?: string;
        public_token?: string;
        total?: number;
        error?: string;
      };
      if (!r.ok || !j.numero) {
        setSubmitError(j.error || "No se pudo registrar el pedido. Intentá nuevamente.");
        setSubmitting(false);
        return;
      }
      createdNumero = j.numero;
      createdToken = j.public_token ?? null;
      createdTotal = typeof j.total === "number" ? j.total : total;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error de red al registrar el pedido.");
      setSubmitting(false);
      return;
    }

    // 2. Snapshot visual local como respaldo (no es la fuente de verdad).
    const order = {
      id: createdNumero,
      createdAt: new Date().toISOString(),
      items: items.map((i) => ({
        name: effectiveLabel(i),
        brand: i.product.brand,
        qty: i.qty,
        price: effectivePrice(i),
        presentacion_id: i.presentacion?.id ?? null,
        volumen_ml: i.presentacion?.volumen_ml ?? null,
      })),
      total: createdTotal,
      customer: form,
    };
    try {
      sessionStorage.setItem("elevate-last-order", JSON.stringify(order));
    } catch {
      /* private mode / quota — continúa */
    }

    // 3. WhatsApp con número REAL del pedido (ya creado en ERP).
    const lines = [
      `🌹 *NUEVA ORDEN ELEVATE* — ${createdNumero}`,
      ``,
      `*Cliente:* ${form.name}`,
      `*Tel:* ${form.phone}`,
      `*Email:* ${form.email}`,
      `*Dirección:* ${form.address}, ${form.city} (${form.zip})`,
      ``,
      `*Productos:*`,
      ...items.map(
        (i) => `• ${effectiveLabel(i)} — ${i.product.brand} × ${i.qty} — ${formatPrice(effectivePrice(i) * i.qty)}`
      ),
      ``,
      `*Total:* ${formatPrice(createdTotal)}`,
      `*Pago:* ${form.payment}`,
      form.notes ? `*Notas:* ${form.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines)}`;
    window.open(wa, "_blank", "noopener,noreferrer");

    clear();
    const tokenParam = createdToken ? `&token=${encodeURIComponent(createdToken)}` : "";
    router.push(`/confirmacion?pedido=${encodeURIComponent(createdNumero!)}${tokenParam}`);
  };

  if (items.length === 0) {
    return (
      <section className="pt-24 pb-12 sm:pt-32 sm:pb-24 min-h-[60vh] flex items-center">
        <div className="container mx-auto px-6 lg:px-10 text-center max-w-md">
          <h1 className="font-display text-3xl sm:text-4xl text-primary">Tu carrito está vacío</h1>
          <div className="gold-divider w-20 sm:w-24 mx-auto my-4 sm:my-6" />
          <p className="font-editorial italic text-muted-foreground text-base sm:text-lg">
            Descubrí nuestras fragancias seleccionadas y comenzá tu experiencia.
          </p>
          <Link
            href="/catalogo"
            className="inline-flex items-center mt-6 sm:mt-8 px-8 py-4 bg-primary text-primary-foreground text-xs tracking-[0.3em] uppercase hover:bg-primary-glow transition-elegant"
          >
            Explorar catálogo
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-24 pb-12 sm:pt-32 sm:pb-24 bg-gradient-to-b from-cream/40 to-background">
      <div className="container mx-auto px-6 lg:px-10 max-w-6xl">
        <div className="text-center mb-8 sm:mb-12">
          <span className="text-xs tracking-[0.4em] uppercase text-gold">Checkout</span>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl text-primary mt-3">Finalizá tu compra</h1>
          <div className="gold-divider w-20 sm:w-24 mx-auto my-4 sm:my-6" />
        </div>

        <div className="grid lg:grid-cols-[1fr_420px] gap-6 sm:gap-10">
          <form
            onSubmit={submit}
            className="bg-background border border-border p-5 sm:p-8 lg:p-10 shadow-soft space-y-6 sm:space-y-8"
          >
            <fieldset>
              <legend className="font-display text-2xl text-primary mb-1">Datos personales</legend>
              <div className="gold-divider w-12 mb-6" />
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Nombre completo" required value={form.name} onChange={(v) => update("name", v)} />
                <Field label="Email" type="email" required value={form.email} onChange={(v) => update("email", v)} />
                <Field label="Teléfono / WhatsApp" required value={form.phone} onChange={(v) => update("phone", v)} />
                <Field label="Código postal" required value={form.zip} onChange={(v) => update("zip", v)} />
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-display text-2xl text-primary mb-1">Envío</legend>
              <div className="gold-divider w-12 mb-6" />
              <div className="space-y-5">
                <Field label="Dirección" required value={form.address} onChange={(v) => update("address", v)} />
                <Field label="Ciudad / Provincia" required value={form.city} onChange={(v) => update("city", v)} />
                <div>
                  <label className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
                    Notas (opcional)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-background border border-border focus:border-gold outline-none transition-smooth"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-display text-2xl text-primary mb-1">Método de pago</legend>
              <div className="gold-divider w-12 mb-6" />
              <div className="grid sm:grid-cols-2 gap-3">
                {(
                  [
                    { v: "transferencia", l: "Transferencia bancaria" },
                    { v: "tarjeta", l: "Tarjeta de crédito/débito" },
                  ] as const
                ).map((p) => (
                  <label
                    key={p.v}
                    className={`cursor-pointer border p-5 text-center transition-elegant ${
                      form.payment === p.v ? "border-primary bg-primary/5" : "border-border hover:border-gold"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={p.v}
                      checked={form.payment === p.v}
                      onChange={() => update("payment", p.v)}
                      className="sr-only"
                    />
                    <div className="font-display text-base text-primary">{p.l}</div>
                  </label>
                ))}
              </div>
              <a
                href={waConsultaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-gold hover:text-primary transition-smooth"
              >
                ¿Dudas? Consultar por WhatsApp →
              </a>
            </fieldset>

            {submitError && (
              <div className="border border-red-300 bg-red-50 text-red-700 text-sm p-3 rounded">
                {submitError}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-primary-foreground py-5 text-xs tracking-[0.4em] uppercase hover:bg-primary-glow transition-elegant shadow-elegant disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Procesando…" : `Confirmar orden — ${formatPrice(total)}`}
            </button>
          </form>

          <aside className="bg-cream/40 border border-border p-5 sm:p-8 lg:p-10 h-fit lg:sticky lg:top-28">
            <h2 className="font-display text-xl sm:text-2xl text-primary">Tu orden</h2>
            <div className="gold-divider w-10 sm:w-12 my-3 sm:my-4" />

            <ul className="space-y-5 max-h-[400px] overflow-y-auto pr-2">
              {items.map((i) => {
                const label = effectiveLabel(i);
                const unitPrice = effectivePrice(i);
                return (
                  <li key={i.key} className="flex gap-4">
                    <div className="relative w-16 h-20 shrink-0 bg-background">
                      <Image src={effectiveImage(i)} alt={label} fill sizes="64px" className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] tracking-[0.25em] uppercase text-gold">{i.product.brand}</div>
                      <div className="font-display text-sm text-primary">{label}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center border border-border bg-background">
                          <button
                            type="button"
                            onClick={() => setQty(i.key, i.qty - 1)}
                            className="p-1.5 text-foreground/70"
                            aria-label="Restar"
                          >
                            <Minus size={10} />
                          </button>
                          <span className="px-2 text-xs">{i.qty}</span>
                          <button
                            type="button"
                            onClick={() => setQty(i.key, i.qty + 1)}
                            className="p-1.5 text-foreground/70"
                            aria-label="Sumar"
                          >
                            <Plus size={10} />
                          </button>
                        </div>
                        <span className="text-sm text-primary">{formatPrice(unitPrice * i.qty)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(i.key)}
                      aria-label="Quitar"
                      className="text-muted-foreground hover:text-primary self-start"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-border mt-6 pt-5 space-y-2">
              <Row label="Subtotal" value={formatPrice(total)} />
              <Row label="Envío" value="A coordinar" muted />
              <div className="flex justify-between items-baseline pt-3 border-t border-border">
                <span className="text-xs tracking-[0.3em] uppercase">Total</span>
                <span className="font-display text-2xl text-primary">{formatPrice(total)}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function Field({
  label, value, onChange, type = "text", required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
        {label}{required && " *"}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-background border border-border focus:border-gold outline-none transition-smooth"
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground italic" : "text-foreground"}>{value}</span>
    </div>
  );
}
