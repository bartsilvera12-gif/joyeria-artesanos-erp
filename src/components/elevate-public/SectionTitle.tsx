interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  light?: boolean;
}

export function SectionTitle({ eyebrow, title, subtitle, align = "center", light }: Props) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && (
        <span className={`text-xs tracking-[0.4em] uppercase ${light ? "text-gold-light" : "text-gold"}`}>
          {eyebrow}
        </span>
      )}
      <h2
        className={`font-display text-4xl md:text-5xl mt-4 text-balance ${
          light ? "text-cream" : "text-primary"
        }`}
      >
        {title}
      </h2>
      <div className={`gold-divider w-24 ${align === "center" ? "mx-auto" : ""} my-6`} />
      {subtitle && (
        <p
          className={`text-base md:text-lg font-editorial italic ${
            light ? "text-cream/80" : "text-muted-foreground"
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
