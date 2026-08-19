type ImagePlaceholderProps = {
  label: string;
  className?: string;
  ratio?: "square" | "portrait" | "wide" | "banner";
};

const ratioClasses: Record<NonNullable<ImagePlaceholderProps["ratio"]>, string> = {
  square: "aspect-square",
  portrait: "aspect-3/4",
  wide: "aspect-4/3",
  banner: "aspect-[16/7]",
};

/**
 * What stands in for a photograph that doesn't exist yet.
 *
 * Most of the catalogue and most posts have no image on file, so this is on
 * screen a lot — it has to read as a deliberate printed device rather than a
 * missing asset. Same treatment as the product tiles and the diary cards: warm
 * paper, the label set in the display face, a gold rule top and bottom.
 */
export default function ImagePlaceholder({
  label,
  className = "",
  ratio = "wide",
}: ImagePlaceholderProps) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-4 overflow-hidden bg-paper-warm px-8 ${ratioClasses[ratio]} ${className}`}
    >
      <span aria-hidden className="h-px w-12 bg-gold" />
      <span className="font-display text-center text-[1.375rem] leading-tight font-semibold tracking-[-0.02em] text-gold-deep/60">
        {label}
      </span>
      <span aria-hidden className="h-px w-12 bg-gold" />
    </div>
  );
}
