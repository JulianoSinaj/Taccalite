type ImagePlaceholderProps = {
  label: string;
  className?: string;
  ratio?: "square" | "portrait" | "wide" | "banner";
};

const ratioClasses: Record<NonNullable<ImagePlaceholderProps["ratio"]>, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[4/3]",
  banner: "aspect-[16/7]",
};

/**
 * Real photography from the shop's Instagram/Facebook should replace these.
 * Drop files into /public/images using the same name as the `label` slug
 * and swap this component for a <Image> tag.
 */
export default function ImagePlaceholder({
  label,
  className = "",
  ratio = "wide",
}: ImagePlaceholderProps) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-2xlbg-gradient-to-br from-cream-dark via-tan/40 to-brown-700/30 ${ratioClasses[ratio]} ${className}`}
    >
      <div className="bg-noise absolute inset-0 opacity-40" />
      <span className="relative px-6 text-center text-xs font-medium tracking-wide text-brown-800/70 uppercase">
        {label}
      </span>
    </div>
  );
}
