import { categoryAccent, plateEngraving } from "@/lib/categories";
import { cn } from "@/lib/utils";

type ProductPlateProps = {
  /** Whose initial is struck in the middle. */
  name: string;
  /** Decides the colour. Also printed small, at the top of the plate. */
  category: string;
  /** Decides which of the three engravings this one gets. */
  seed: string;
  /** `sm` drops the micro-typography — under ~180px it is only noise. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * What a product looks like when there is no photograph of it.
 *
 * Twenty of the twenty-four things in the catalogue have no picture, so this is
 * not an edge case — it is the majority of the shop, and it used to be a beige
 * square with a grey letter in it. Here it is a printed label instead: the
 * category's own colour, an engraved ground, a struck initial, and the house
 * name set small at the foot the way it would be on a paper etichetta.
 *
 * Deliberately not a photograph substitute. It does not pretend to show the
 * product; it shows the *shop's* label for it, which is honest and gives the
 * grid a rhythm of colour a wall of stock photography never would.
 */
export default function ProductPlate({
  name,
  category,
  seed,
  size = "md",
  className,
}: ProductPlateProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "T";

  return (
    <span
      aria-hidden
      className={cn("plate absolute inset-0 block", plateEngraving(seed), className)}
      style={{ "--acc": categoryAccent(category) } as React.CSSProperties}
    >
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center">
        {size === "md" && (
          <span className="text-[0.625rem] sm:text-[0.5625rem] font-semibold tracking-[0.3em] text-[color-mix(in_oklab,var(--acc)_78%,transparent)] uppercase">
            {category}
          </span>
        )}

        <span
          className="plate-initial font-display leading-[0.8] font-semibold tracking-[-0.04em] text-[color-mix(in_oklab,var(--acc)_82%,transparent)]"
          style={{ fontVariationSettings: '"SOFT" 30, "WONK" 1, "opsz" 96' }}
        >
          {initial}
        </span>

        {size === "md" && (
          <span className="flex items-center gap-2.5">
            <span className="h-px w-5 bg-[color-mix(in_oklab,var(--acc)_45%,transparent)]" />
            <span className="text-[0.625rem] font-semibold tracking-[0.26em] sm:text-[0.5rem] text-[color-mix(in_oklab,var(--acc)_60%,transparent)] uppercase">
              Dal 1946
            </span>
            <span className="h-px w-5 bg-[color-mix(in_oklab,var(--acc)_45%,transparent)]" />
          </span>
        )}
      </span>
    </span>
  );
}
