"use client";

import { useEffect, useState } from "react";
import LoyaltyCard from "./LoyaltyCard";

const STORAGE_KEY = "taccalite-demo-account";

export default function AccountArea() {
  const [name, setName] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [formName, setFormName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setName(window.localStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = formName.trim() || "Cliente Taccalite";
    window.localStorage.setItem(STORAGE_KEY, value);
    setName(value);
  }

  function handleLogout() {
    window.localStorage.removeItem(STORAGE_KEY);
    setName(null);
    setFormName("");
  }

  if (!ready) return null;

  return (
    <div>
      <div className="mb-8 rounded-xl border border-gold-dark/30 bg-gold/10 px-4 py-3 text-sm text-brown-900">
        Anteprima funzionale: login e punti sono simulati in questo browser. Per l&apos;area
        personale reale serve un sistema di autenticazione e un database collegati al sito.
      </div>

      {name ? (
        <div className="space-y-6">
          <LoyaltyCard name={name} />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-brown-800 px-5 py-2 text-sm font-semibold text-brown-900 hover:bg-brown-900 hover:text-cream"
          >
            Esci
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-brown-700/15 bg-white/60 p-6 sm:p-8">
          <div className="mb-6 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                mode === "login" ? "bg-brown-900 text-cream" : "text-brown-800/60"
              }`}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                mode === "register" ? "bg-brown-900 text-cream" : "text-brown-800/60"
              }`}
            >
              Registrati
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor="account-name">
                Nome e cognome
              </label>
              <input
                id="account-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
                placeholder="Mario Rossi"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor="account-email">
                Email
              </label>
              <input
                id="account-email"
                type="email"
                className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
                placeholder="mario.rossi@email.it"
              />
            </div>
            <button
              type="submit"
              className="mt-2 rounded-full bg-brown-900 px-6 py-3 text-sm font-semibold text-cream hover:bg-brown-800"
            >
              {mode === "login" ? "Accedi" : "Crea account"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
