/**
 * SMTP preflight — answers "will this shop's email actually leave the building?"
 * from the command line, before a customer finds out that it doesn't.
 *
 *   npm run mail:check                     # inspect + connect + authenticate
 *   npm run mail:check -- --send you@x.it  # …and deliver a real message
 *
 * Why this exists as a script rather than only the panel in Impostazioni:
 *
 * The settings page can only report on the environment the *running server*
 * booted with. The moment you are actually setting SMTP up, that is the thing
 * you are changing — so the loop is edit, redeploy, reload, squint at a badge.
 * This reads the same variables through the same `lib/env.ts` and gives the
 * answer in about a second, which is short enough to iterate against.
 *
 * It also draws the distinction that cost this project a launch-blocking bug:
 * `verify()` succeeding is NOT proof that mail works. Nodemailer only issues
 * AUTH when the transport carries credentials, so against a relay with
 * `SMTP_USER` blank it connects, greets, resolves — and then every real message
 * is rejected with `502 5.7.0 Please authenticate first`. See `smtpAuthConfigured`
 * in lib/env.ts. `--send` is the only step that proves delivery outright, which
 * is why it is offered here and not merely described in the docs.
 *
 * Prints no secret. The password is reported as a length, never a value, so the
 * output is safe to paste into an issue.
 */
import "./_bootstrap-env";

import nodemailer from "nodemailer";
import { env, smtpAuthConfigured, smtpConfigured } from "@/lib/env";

const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const OFF = "\x1b[0m";

/** Same budget the app gives a send; a healthy relay answers far inside it. */
const TIMEOUT_MS = 10_000;

function row(label: string, value: string, note = "") {
  console.log(`  ${label.padEnd(13)} ${value}${note ? ` ${DIM}${note}${OFF}` : ""}`);
}

/**
 * Turn a nodemailer/SMTP failure into the thing to go and change.
 *
 * Every one of these was hit while getting this shop's relay working, and the
 * raw text of each is unhelpful in the same way: it names the protocol event,
 * not the field that is wrong.
 */
function diagnose(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const message = e?.message ?? String(err);
  const code = e?.code ?? "";
  const status = e?.responseCode;

  // Nodemailer does not pass the OS error code through: a DNS failure arrives as
  // `code: "EDNS"` and a refused connection as `code: "ESOCKET"`, with the real
  // `ENOTFOUND` / `ECONNREFUSED` only in the message text. Both were verified
  // against this version. So the specific cases are matched on the message and
  // must be tested BEFORE the generic `ESOCKET` branch, or a refused port gets
  // reported as a firewall timeout.
  if (status === 502 || /please authenticate/i.test(message))
    return "The relay wants credentials it did not get. SMTP_USER/SMTP_PASS are empty or were not loaded.";
  if (status === 535 || code === "EAUTH")
    return "The relay rejected the credentials. On Brevo, SMTP_USER is the SMTP login (e.g. 9a1b2c001@smtp-brevo.com, not your account email) and SMTP_PASS is a generated SMTP key, not your account password.";
  if (code === "EDNS" || /ENOTFOUND|EAI_AGAIN/.test(message))
    return `SMTP_HOST does not resolve (${env.smtp.host}). Check the hostname for a typo.`;
  if (/ECONNREFUSED/.test(message))
    return `Nothing is listening on ${env.smtp.host}:${env.smtp.port}. Check SMTP_PORT — 587 for STARTTLS, 465 for implicit TLS.`;
  if (/wrong version number|SSL routines|self.signed|certificate/i.test(message))
    return "TLS mismatch: SMTP_SECURE=true on a STARTTLS port, or the reverse. 587 → false, 465 → true.";
  if (code === "ETIMEDOUT" || code === "ESOCKET" || /timeout/i.test(message))
    return `No answer from ${env.smtp.host}:${env.smtp.port} within ${TIMEOUT_MS / 1000}s — typically an outbound firewall on that port. 587 with SMTP_SECURE=false is STARTTLS; try 465 with SMTP_SECURE=true.`;
  if (code === "EENVELOPE")
    return `The relay took the login but refused the envelope. MAIL_FROM (${env.smtp.from}) is probably not a sender it has verified.`;
  return "";
}

async function main() {
  const argv = process.argv.slice(2);
  const sendAt = argv.indexOf("--send");
  const sendTo = sendAt === -1 ? null : argv[sendAt + 1];

  if (sendAt !== -1 && !sendTo) {
    console.error(`${RED}--send needs an address: npm run mail:check -- --send you@example.it${OFF}`);
    process.exit(2);
  }

  console.log(`\n${BOLD}SMTP configuration${OFF}  ${DIM}(from lib/env.ts — .env, then real env vars)${OFF}\n`);
  row("SMTP_HOST", env.smtp.host || `${YELLOW}(empty)${OFF}`);
  row("SMTP_PORT", String(env.smtp.port));
  row("SMTP_SECURE", String(env.smtp.secure), env.smtp.secure ? "implicit TLS" : "STARTTLS");
  row("SMTP_USER", env.smtp.user || `${YELLOW}(empty)${OFF}`);
  // Never the value. A length is enough to tell "unset" from "pasted with a
  // trailing newline", which is the only thing anyone needs from it here.
  row("SMTP_PASS", env.smtp.pass ? `${DIM}set, ${env.smtp.pass.length} chars${OFF}` : `${YELLOW}(empty)${OFF}`);
  row("MAIL_FROM", env.smtp.from);
  console.log();

  // ── The two states that need no network call ──────────────────────────────
  if (!smtpConfigured) {
    console.log(`${YELLOW}◆ Outbox mode.${OFF} SMTP_HOST is empty, so nothing is sent: every message is`);
    console.log(`  recorded in Impostazioni → Outbox and stays there. Correct for local work.`);
    console.log(`  ${BOLD}Not correct in production${OFF} — password-reset and verification links go this way.\n`);
    process.exit(1);
  }

  if (!smtpAuthConfigured) {
    console.log(`${RED}✗ Half-configured — the state to deploy in least of all.${OFF}`);
    console.log(`  SMTP_HOST is set, so the app builds a real transport and sends for real,`);
    console.log(`  but with no credentials the relay answers ${BOLD}502 5.7.0 Please authenticate first${OFF}.`);
    console.log(`  Mail is then retried ${BOLD}5 times and abandoned${OFF} — worse than outbox mode, where it waits.`);
    console.log(`\n  Fix it one of two ways:`);
    console.log(`    • set SMTP_USER and SMTP_PASS, or`);
    console.log(`    • clear SMTP_HOST, to go back to the outbox until you have them.\n`);
    process.exit(1);
  }

  // ── Connect and authenticate ──────────────────────────────────────────────
  const transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS * 2,
  });

  process.stdout.write(`  connecting to ${env.smtp.host}:${env.smtp.port} … `);
  try {
    await transport.verify();
    // Credentials are on the transport, so verify() really did issue AUTH.
    console.log(`${GREEN}authenticated${OFF}\n`);
  } catch (err) {
    console.log(`${RED}failed${OFF}\n`);
    console.log(`  ${RED}${err instanceof Error ? err.message : String(err)}${OFF}`);
    const hint = diagnose(err);
    if (hint) console.log(`\n  ${BOLD}→${OFF} ${hint}`);
    console.log();
    process.exit(1);
  }

  if (!sendTo) {
    console.log(`${GREEN}✓ The relay accepts these credentials.${OFF}`);
    console.log(`  ${DIM}That is connect + AUTH. It does not prove MAIL_FROM is an approved sender —${OFF}`);
    console.log(`  ${DIM}relays accept the login and then reject the envelope. To prove delivery:${OFF}`);
    console.log(`\n    npm run mail:check -- --send you@example.it\n`);
    return;
  }

  // ── Actually deliver something ────────────────────────────────────────────
  process.stdout.write(`  sending to ${sendTo} … `);
  try {
    const info = await transport.sendMail({
      from: env.smtp.from,
      to: sendTo,
      subject: "Taccalite — prova di configurazione SMTP",
      text:
        "Se leggi questo messaggio, l'invio email della norcineria funziona.\n\n" +
        "Da qui passano le conferme d'ordine, i link di reimpostazione password e " +
        "le verifiche dell'indirizzo email.\n",
      html:
        "<p>Se leggi questo messaggio, l'invio email della norcineria funziona.</p>" +
        "<p>Da qui passano le conferme d'ordine, i link di reimpostazione password e " +
        "le verifiche dell'indirizzo email.</p>",
    });
    console.log(`${GREEN}accepted${OFF}\n`);
    if (info.accepted?.length) row("accepted", String(info.accepted.join(", ")));
    if (info.rejected?.length) row("rejected", `${RED}${info.rejected.join(", ")}${OFF}`);
    row("server said", info.response ?? "—");
    console.log(`\n${GREEN}✓ SMTP is working.${OFF} Check the inbox — ${BOLD}and the spam folder${OFF}: if it landed`);
    console.log(`  in spam, the relay is fine and it is DNS. Add SPF and DKIM for the MAIL_FROM`);
    console.log(`  domain at your provider.\n`);
  } catch (err) {
    console.log(`${RED}failed${OFF}\n`);
    console.log(`  ${RED}${err instanceof Error ? err.message : String(err)}${OFF}`);
    const hint = diagnose(err);
    if (hint) console.log(`\n  ${BOLD}→${OFF} ${hint}`);
    console.log(
      `\n  ${DIM}AUTH succeeded but the message did not. Usually MAIL_FROM is not a sender the${OFF}`,
    );
    console.log(`  ${DIM}relay has verified. Currently: ${env.smtp.from}${OFF}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
