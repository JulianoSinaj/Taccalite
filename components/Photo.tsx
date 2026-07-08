import Image from "next/image";
import ImagePlaceholder from "./ImagePlaceholder";

type PhotoProps = {
  src?: string;
  alt: string;
  label: string;
  className?: string;
  ratio?: "square" | "portrait" | "wide" | "banner";
  priority?: boolean;
};

const ratioClasses: Record<NonNullable<PhotoProps["ratio"]>, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[4/3]",
  banner: "aspect-[16/7]",
};

export default function Photo({ src, alt, label, className = "", ratio = "wide", priority = false }: PhotoProps) {
  if (!src) {
    return <ImagePlaceholder label={label} ratio={ratio} className={className} />;
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-brown-700/15 ${ratioClasses[ratio]} ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover"
      />
    </div>
  );
}
