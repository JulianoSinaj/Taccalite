type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  light?: boolean;
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  light = false,
}: SectionHeadingProps) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && (
        <div
          className={`text-xs font-semibold tracking-[0.15em] uppercase ${
            light ? "text-gold" : "text-gold-dark"
          }`}
        >
          {eyebrow}
        </div>
      )}
      <h2
        className={`font-display mt-2 text-3xl font-semibold sm:text-4xl ${
          light ? "text-cream" : "text-brown-900"
        }`}
      >
        {title}
      </h2>
      {description && (
        <p className={`mt-3 text-base leading-relaxed ${light ? "text-cream/70" : "text-brown-800/70"}`}>
          {description}
        </p>
      )}
    </div>
  );
}
