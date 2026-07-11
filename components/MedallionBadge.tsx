import type { ReactNode } from "react";
import { Award } from "lucide-react";

type MedallionBadgeProps = {
  className?: string;
  icon?: ReactNode;
};

/**
 * Rotating circular-text brand seal used across heroes, replacing the WebGL coin.
 */
export default function MedallionBadge({ className = "", icon }: MedallionBadgeProps) {
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden>
      <div className="medallion-rotation relative flex h-full w-full items-center justify-center">
        <svg className="h-full w-full text-gold" viewBox="0 0 100 100">
          <path
            id="medallion-circle-path"
            d="M 50, 50 m -37, 0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0"
            fill="transparent"
          />
          <text className="fill-current text-[8px] font-bold uppercase tracking-[0.2em]">
            <textPath href="#medallion-circle-path">
              • DAL 1946 • TRADIZIONE MARCHIGIANA • ECCELLENZA •
            </textPath>
          </text>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="cinematic-shadow flex h-1/3 w-1/3 items-center justify-center rounded-full bg-gold text-brown-950">
            {icon ?? <Award className="h-1/2 w-1/2" />}
          </div>
        </div>
      </div>
    </div>
  );
}
