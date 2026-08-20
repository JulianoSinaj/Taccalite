import SealSvg from "@/components/site/SealSvg";

/**
 * The intro, as a script rather than a component.
 *
 * It has to run before the browser's first paint, and it has to promise that the
 * veil lifts inside a fixed budget. React can give it neither: a component only
 * starts existing at hydration, which is exactly the moment the main thread is
 * busiest and the least predictable. So the veil is inert markup and a CSS state
 * machine, and this script — parsed synchronously, ahead of everything below it
 * in the body — is the only thing that drives it.
 *
 * What it waits on is the page actually looking finished: the webfonts swapping
 * in (the loudest reflow of the visit), the eager images decoding, and the
 * hero's WebGL seal having a frame on the glass. Lazy images are excluded by
 * their own attribute — they never load above the fold, so waiting on them
 * would mean waiting for the cap, every time.
 *
 * The seal is the reason this veil earns its keep. Without it the hero's mark
 * has to arrive in front of the visitor: flat foil first, three.js downloading
 * and compiling behind it, then a cross-fade to gold at whatever moment the
 * canvas happens to be ready. Held here instead, all of that happens under the
 * paper and the visitor is only ever shown the finished corner.
 *
 * `CAP` is a promise, not a target: whatever is still in flight at that point,
 * the visitor gets their page. `MIN` is the other half of the same promise — a
 * veil that flickers past in 200ms is worse than no veil, so the stamp always
 * gets long enough to read.
 *
 * On a soft navigation this never runs at all: React does not execute scripts it
 * inserts through a DOM update, so arriving at the homepage from anywhere inside
 * the site simply shows the homepage. That is the intended behaviour, not a
 * limitation worked around.
 */
const INTRO_SCRIPT = `(function () {
  if (location.pathname !== "/") return;

  var KEY = "taccalite:intro";
  try {
    if (sessionStorage.getItem(KEY)) return;
  } catch (e) {}

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  try { sessionStorage.setItem(KEY, "1"); } catch (e) {}

  var root = document.documentElement;
  var MIN = 700;
  var CAP = 1800;
  var start = Date.now();
  var lifted = false;

  // The seal gate. components/site/SealMark.tsx resolves this the moment its
  // canvas has drawn something worth revealing — and, on its own short timer,
  // also when it hasn't, so a machine that cannot draw the coin at all never
  // pays the cap for it.
  var releaseSeal;
  var seal = new Promise(function (resolve) { releaseSeal = resolve; });
  window.__taccaliteSealReady = function () { releaseSeal(); };

  function lift(immediate) {
    if (lifted) return;
    lifted = true;
    var hold = immediate ? 0 : Math.max(0, MIN - (Date.now() - start));
    setTimeout(function () { root.setAttribute("data-intro", "done"); }, hold);
  }

  function skip() { lift(true); }

  root.setAttribute("data-intro", "play");
  setTimeout(function () { lift(false); }, CAP);
  addEventListener("pointerdown", skip, { once: true });
  addEventListener("keydown", skip, { once: true });

  function whenSettled() {
    var waits = [seal];
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);

    var eager = document.querySelectorAll('main img:not([loading="lazy"])');
    Array.prototype.forEach.call(eager, function (img) {
      if (img.complete) return;
      waits.push(new Promise(function (done) {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }));
    });

    Promise.all(waits).then(function () { lift(false); }, function () { lift(false); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", whenSettled, { once: true });
  } else {
    whenSettled();
  }
})();`;

/**
 * The shop stamping its seal on the paper before handing the page over.
 *
 * Rendered at the very top of the storefront shell, ahead of the header, so the
 * script above is parsed before the browser has any of the page to paint — a
 * veil that arrives after a flash of the thing it is meant to be covering is
 * worse than no veil at all.
 *
 * Styling and the whole shown/lifting/gone state machine live in globals.css,
 * under `.intro-veil`.
 */
export default function Intro() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <div className="intro-veil" aria-hidden="true">
        <div className="intro-stack">
          {/* `uid` because the hero carries this same mark: the two would
              otherwise share `<defs>` ids on the one page. */}
          <SealSvg uid="intro-seal" className="intro-seal" />
          <p className="intro-name">Norcineria Taccalite</p>
          <span className="intro-rule" />
        </div>
      </div>
    </>
  );
}
