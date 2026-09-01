"use client";

import { useId } from "react";

/**
 * Instagram glyph. Plain (currentColor) by default; pass `gradient` for the
 * brand-colored version. Shared by the footer and the homepage feed.
 */
export default function InstagramIcon({
  className,
  gradient = false,
}: {
  className?: string;
  gradient?: boolean;
}) {
  const reactId = useId();
  const gradientId = `instagram-gradient-${reactId}`;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={gradient ? `url(#${gradientId})` : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {gradient && (
        <defs>
          <radialGradient id={gradientId} cx="12%" cy="100%" r="150%">
            <stop offset="0%" stopColor="#FEDA75" />
            <stop offset="25%" stopColor="#FA7E1E" />
            <stop offset="50%" stopColor="#D62976" />
            <stop offset="75%" stopColor="#962FBF" />
            <stop offset="100%" stopColor="#4F5BD5" />
          </radialGradient>
        </defs>
      )}
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}
