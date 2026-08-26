"use client";

/**
 * A `<script dangerouslySetInnerHTML>` that runs once, synchronously, while the
 * browser's parser is still on it — same as a plain inline `<script>` — but
 * without React's dev-only "script tags are never executed on the client"
 * warning. That warning fires for any script whose `type` reads as
 * executable JS; it doesn't know this one already ran via the parser, before
 * hydration, and never needs to run again.
 *
 * Has to be a Client Component for the type to actually flip between the two
 * passes: SSR renders `text/javascript` (so the initial HTML executes the
 * script as intended), hydration re-runs this function in the browser and
 * renders `text/plain` (a type React doesn't treat as executable, so it stops
 * warning). `suppressHydrationWarning` covers the resulting mismatch on
 * `type` itself — see node_modules/next/dist/docs/01-app/02-guides/
 * preventing-flash-before-hydration.md.
 */
export default function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
