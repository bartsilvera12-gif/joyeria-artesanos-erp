import { Brands } from "@/components/elevate-public/Brands";
import { fetchMarcasPublic } from "@/lib/elevate-public/catalog-fetch";

export const metadata = {
  title: "Marcas · Elevate",
  description:
    "Marcas reales del catálogo Elevate. Elegí una marca para ver sus fragancias disponibles.",
};

// Marcas vienen de DB (Fase Marcas). Sin hardcode.
export const dynamic = "force-dynamic";

export default async function MarcasPage() {
  const marcas = await fetchMarcasPublic();
  return (
    <>
      <div className="pt-10 sm:pt-20" />
      <Brands marcas={marcas} />
    </>
  );
}
