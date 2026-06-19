import { Suspense } from "react";
import { ConfirmacionClient } from "./ConfirmacionClient";

export const metadata = {
  title: "¡Gracias por tu compra! · Elevate",
  description: "Tu orden ha sido recibida.",
};

export const dynamic = "force-dynamic";

export default function ConfirmacionPage() {
  return (
    <Suspense
      fallback={
        <section className="pt-24 pb-12 sm:pt-32 sm:pb-24 min-h-[60vh] flex items-center justify-center">
          <p className="font-editorial italic text-muted-foreground">Cargando confirmación…</p>
        </section>
      }
    >
      <ConfirmacionClient />
    </Suspense>
  );
}
