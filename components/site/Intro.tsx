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
 * Both are measured in time the visitor was actually here for. A page opened in
 * a background tab gets no rAF, so nothing draws and no animation advances — but
 * timers keep firing, and the veil used to spend its entire budget covering an
 * empty room, lift while still hidden, and hand the visitor a page whose seal
 * then cross-faded to gold in front of them on arrival. Which is precisely the
 * thing it exists to prevent. So the paper goes up immediately and unconditionally
 * — a visitor switching in must never catch a frame of the raw page — and the
 * clock does not start until somebody is looking.
 *
 * It plays on every hard load of the homepage. It used to play once per session
 * and stamp a sessionStorage key to remember, which meant the thing was invisible
 * to anyone who reloaded — including whoever was building the page. If the cost
 * of showing it is ever judged too high, the lever is `CAP`, not a flag that
 * hides it from the second visit onwards.
 *
 * On a soft navigation this never runs at all: React does not execute scripts it
 * inserts through a DOM update, so arriving at the homepage from anywhere inside
 * the site simply shows the homepage. That is the intended behaviour, not a
 * limitation worked around.
 */
const INTRO_SCRIPT = `(function () {
  if (location.pathname !== "/") return;

  var root = document.documentElement;

  // Reduced motion takes the *motion* away, not the veil — globals.css drops the
  // stamp, the rise and the sweep and leaves a still card. Removing the veil
  // instead would hand exactly the visitor who asked for calm the one thing it
  // exists to hide: the hero assembling itself in front of them.
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Nothing has to animate before a still card can leave, so the floor that
  // stops the veil flickering past is shorter when there is no stamp to read.
  var MIN = reduced ? 320 : 700;
  var CAP = 1800;
  var lifted = false;
  // Stamped when the visitor is first actually looking at this, which on a page
  // opened in a background tab is not the same moment the script ran.
  var start = 0;

  // The seal gate. components/site/SealMark.tsx resolves this the moment its
  // canvas has drawn something worth revealing — and, on its own short timer,
  // also when it hasn't, so a machine that cannot draw the coin at all never
  // pays the cap for it.
  var releaseSeal;
  var seal = new Promise(function (resolve) { releaseSeal = resolve; });
  window.__taccaliteSealReady = function () { releaseSeal(); };

  // The page is scrollable the whole time the veil is over it, and a fixed
  // element does not stop a wheel — so without this the visitor can scroll
  // blind behind the paper and have it lift onto the middle of the page.
  // Lenis (components/SmoothScroll.tsx) reads the same events, so capturing
  // here is what holds it too.
  //
  // Events rather than \`overflow: hidden\` on <html>: that would take the
  // scrollbar away for the length of the veil and shift the whole layout
  // sideways by its width at the exact moment the page is revealed.
  function hold(event) { event.preventDefault(); }
  var HOLD = { passive: false, capture: true };
  addEventListener("wheel", hold, HOLD);
  addEventListener("touchmove", hold, HOLD);

  // Run something the next time this tab is actually on screen — now, if it
  // already is.
  function whenSeen(run) {
    if (document.visibilityState !== "hidden") return run();
    document.addEventListener("visibilitychange", function onVisible() {
      if (document.visibilityState === "hidden") return;
      document.removeEventListener("visibilitychange", onVisible);
      run();
    });
  }

  function reveal() {
    root.setAttribute("data-intro", "done");
    removeEventListener("wheel", hold, HOLD);
    removeEventListener("touchmove", hold, HOLD);
  }

  // Lifting a veil nobody is in front of is not lifting it — the fade is on the
  // document timeline, which is frozen while the tab is hidden, so the paper
  // would simply still be there when the visitor arrived and the page underneath
  // would finish assembling in plain sight. So the reveal waits for them, and
  // then owes them the floor from *their* first frame.
  function settle(immediate) {
    if (document.visibilityState === "hidden") {
      whenSeen(function () {
        start = Date.now();
        settle(false);
      });
      return;
    }
    setTimeout(function () {
      if (document.visibilityState === "hidden") return settle(false);
      reveal();
    }, immediate ? 0 : Math.max(0, MIN - (Date.now() - start)));
  }

  function lift(immediate) {
    if (lifted) return;
    lifted = true;
    settle(immediate);
  }

  function skip() { lift(true); }

  // The paper, straight away and whether or not anyone is here to see it. This
  // is the one part that cannot wait for visibility: it is what a visitor
  // switching into the tab has to find already in place.
  root.setAttribute("data-intro", "play");

  whenSeen(function () {
    start = Date.now();
    setTimeout(function () { lift(false); }, CAP);

    // The escape hatch, armed only once the stamp has had its floor. Live from
    // the first frame it is not an escape hatch but a hazard: a page that has
    // just loaded collects stray clicks and keystrokes, and any one of them used
    // to tear the veil off mid-animation — which reads as the intro breaking
    // rather than as the visitor skipping it.
    setTimeout(function () {
      addEventListener("pointerdown", skip, { once: true });
      addEventListener("keydown", skip, { once: true });
    }, MIN);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", whenSettled, { once: true });
    } else {
      whenSettled();
    }
  });

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
