/**
 * Whether this tab has already been shown the intro.
 *
 * The curtain used to play on every hard load, which put the browser in an
 * impossible position on a reload: Chrome holds the *last painted frame* of the
 * outgoing document while the server answers, so for the length of that
 * round-trip the thing on screen is the page you just left. The old fix set a
 * brown overlay from `beforeunload` and hoped the compositor would present one
 * more frame before tearing the document down. It is not obliged to, and when it
 * did not you got page → brown → page: the glimpse.
 *
 * That race cannot be won from inside the outgoing document, so the intro simply
 * does not replay. It is a first-arrival flourish now — once per tab, which is
 * what `sessionStorage` scopes for us — and a reload is just the page again, with
 * nothing to glimpse and 3.5s off the wait.
 */
export const INTRO_SEEN_KEY = "taccalite:intro-seen";

/**
 * The gate. Runs inline in `app/(site)/layout.tsx`, immediately before the
 * curtain's own markup, so the decision is made while the parser is still short
 * of the element it hides — `html[data-intro="skip"] .intro-curtain` in
 * globals.css then keeps it from ever painting.
 *
 * Deliberately not a React effect: the curtain is in the server HTML precisely so
 * it is on screen from the first frame, and an effect runs a whole paint too late
 * to stop it. Taking the flag here rather than when the sequence finishes also
 * means reloading *during* the intro counts as having seen it, and that a load
 * that never hydrates still marks the tab.
 */
export const INTRO_GATE_SCRIPT = `try{var k=${JSON.stringify(INTRO_SEEN_KEY)},s=sessionStorage;if(s.getItem(k))document.documentElement.dataset.intro="skip";else s.setItem(k,"1")}catch(e){}`;
