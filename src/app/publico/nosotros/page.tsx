import { About } from "@/components/elevate-public/About";

export const metadata = {
  title: "Quiénes somos · Elevate",
  description: "La historia y filosofía detrás de Elevate Import Export.",
};

export default function NosotrosPage() {
  return (
    <>
      <div className="pt-10 sm:pt-20" />
      <About />
    </>
  );
}
