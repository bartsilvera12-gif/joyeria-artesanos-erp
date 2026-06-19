import Image from "next/image";

export function About() {
  return (
    <section id="quienes-somos" className="py-12 sm:py-24 lg:py-32 bg-background overflow-hidden">
      <div className="container mx-auto px-6 lg:px-10">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-start">
          <div className="relative lg:sticky lg:top-32">
            <div className="aspect-[4/5] overflow-hidden shadow-elegant relative">
              <Image
                src="/brand/elevate/lifestyle-1.jpg"
                alt="Elevate - La esencia de tu próximo negocio"
                fill
                sizes="(min-width:1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -right-6 hidden md:block bg-gold text-gold-foreground p-6 shadow-gold">
              <div className="font-display text-4xl">2023</div>
              <div className="text-[10px] tracking-[0.3em] uppercase mt-1">Desde</div>
            </div>
          </div>

          <div className="space-y-8 sm:space-y-12">
            <div>
              <span className="text-xs tracking-[0.4em] uppercase text-gold">Elevate</span>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-primary mt-3 sm:mt-4 text-balance">
                La esencia de tu próximo negocio.
              </h2>
              <div className="gold-divider w-20 sm:w-24 my-4 sm:my-6" />
            </div>

            <div>
              <h3 className="font-display text-xl sm:text-2xl md:text-3xl text-primary">¿Quiénes somos?</h3>
              <div className="gold-divider w-12 sm:w-16 my-3 sm:my-4" />
              <div className="space-y-3 sm:space-y-4 text-foreground/80 leading-relaxed text-sm sm:text-base">
                <p>
                  <strong className="text-primary font-medium">Elevate</strong> es una empresa que nació en 2023 con el
                  objetivo de ayudar a pequeños emprendedores del sector de la perfumería a acceder a perfumes importados,
                  testers y de nicho a precios competitivos.
                </p>
                <p>
                  Nuestro modelo de negocio se enfoca en ser un socio estratégico para estos emprendedores, ofreciéndoles
                  productos de alta calidad a precios competitivos. La filosofía de Elevate se centra en elevar y empoderar
                  a sus clientes, proporcionándoles productos de prestigio y siendo una fuente de inspiración para que se
                  diferencien en el mercado.
                </p>
                <p>
                  Desde su fundación, hemos logrado consolidarnos como un puente confiable para que cientos de personas
                  puedan empezar su emprendimiento o expandir su colección de perfumes importados al mejor precio del
                  mercado.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5 sm:gap-8">
              <div className="bg-cream p-5 sm:p-8 shadow-soft border-t-2 border-gold">
                <h3 className="font-display text-xl sm:text-2xl text-primary">Misión</h3>
                <div className="gold-divider w-10 sm:w-12 my-3 sm:my-4" />
                <p className="text-foreground/80 leading-relaxed text-sm">
                  Empoderar a los emprendedores, microempresas y revendedores de perfumería ofreciendo precios competitivos
                  en el mercado.
                </p>
              </div>
              <div className="bg-cream p-5 sm:p-8 shadow-soft border-t-2 border-gold">
                <h3 className="font-display text-xl sm:text-2xl text-primary">Visión</h3>
                <div className="gold-divider w-10 sm:w-12 my-3 sm:my-4" />
                <p className="text-foreground/80 leading-relaxed text-sm">
                  Ser reconocida como socio-estratégico líder y abastecimiento de perfumería importada, impulsando el
                  crecimiento económico de los socios-emprendedores.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:gap-6 border-t border-border pt-6 sm:pt-8">
              {[
                { n: "2023", l: "Fundación" },
                { n: "100%", l: "Originales" },
                { n: "+50", l: "Marcas" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-display text-2xl sm:text-3xl text-primary">{s.n}</div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mt-1">
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
