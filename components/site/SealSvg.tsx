type SealSvgProps = {
  className?: string;
  /**
   * Namespace for this instance's `<defs>`.
   *
   * The homepage carries two of these marks — the hero's and the intro veil's —
   * and `id` is document-global: shared ids would have the second seal resolve
   * the ring `href` against the first one's path, so the ring text would
   * either double up or vanish depending on which mounted first.
   */
  uid?: string;
};

/**
 * The seal, flat.
 *
 * Stands on its own as the brand mark: it is the placeholder under the 3D coin,
 * the answer for anyone who asked for less motion, the safety net when WebGL
 * never arrives, and the thing the intro veil stamps onto the paper.
 */
export default function SealSvg({ className, uid = "seal" }: SealSvgProps) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden role="presentation">
      <defs>
        <path
          id={`${uid}-ring`}
          d="M 100,100 m -74,0 a 74,74 0 1,1 148,0 a 74,74 0 1,1 -148,0"
          fill="none"
        />
        <linearGradient id={`${uid}-foil`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eccb7a" />
          <stop offset="45%" stopColor="#d8b25c" />
          <stop offset="100%" stopColor="#b8913f" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="88" fill={`url(#${uid}-foil)`} />
      <circle cx="100" cy="100" r="82" fill="none" stroke="#2a1a10" strokeOpacity=".55" strokeWidth="1" />
      <circle cx="100" cy="100" r="64" fill="none" stroke="#2a1a10" strokeOpacity=".55" strokeWidth="1" />
      <text
        fill="#2a1a10"
        fontSize="10.5"
        fontWeight="600"
        letterSpacing="1.6"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        <textPath href={`#${uid}-ring`} startOffset="50%" textAnchor="middle">
          NORCINERIA TACCALITE · ANCONA · DAL 1946
        </textPath>
      </text>
      <text
        x="100"
        y="100"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#2a1a10"
        fontSize="62"
        fontWeight="600"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        T
      </text>
    </svg>
  );
}
