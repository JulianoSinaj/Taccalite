"use client";

/**
 * Last-resort error boundary — catches errors thrown in the root layout itself.
 * It must render its own <html>/<body> because the failing layout can't. Segment
 * error boundaries ((site)/admin) handle the common case with full chrome.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, fontFamily: "Georgia, serif", background: "#f8f2e8", color: "#2a1a10" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "28rem" }}>
            <h1 style={{ fontSize: "2rem", margin: "0 0 0.75rem" }}>Qualcosa è andato storto</h1>
            <p style={{ color: "rgba(58,35,20,0.7)", margin: "0 0 1.5rem" }}>
              Si è verificato un errore imprevisto. Riprova tra poco.
            </p>
            <button
              onClick={reset}
              style={{
                border: "none",
                borderRadius: "9999px",
                background: "#e1be64",
                color: "#2a1a10",
                padding: "0.75rem 1.5rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontSize: "0.7rem",
                cursor: "pointer",
              }}
            >
              Riprova
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
