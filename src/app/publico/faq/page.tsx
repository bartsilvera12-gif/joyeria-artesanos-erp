import { FAQ } from "@/components/elevate-public/FAQ";
import { Policies } from "@/components/elevate-public/Policies";

export const metadata = {
  title: "FAQ y Políticas · Elevate",
  description: "Preguntas frecuentes, políticas de envío y devolución de Elevate.",
};

export default function FAQPage() {
  return (
    <>
      <div className="pt-10 sm:pt-20" />
      <FAQ />
      <Policies />
    </>
  );
}
