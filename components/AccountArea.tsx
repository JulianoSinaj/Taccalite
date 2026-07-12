"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { TrendingUp, User } from "lucide-react";
import LoyaltyCard from "./LoyaltyCard";
import Reveal, { RevealStagger, RevealStaggerItem } from "./Reveal";

const STORAGE_KEY = "taccalite-demo-account";

const rewards = [
  {
    name: "Tagliere della casa",
    points: 500,
    description: "Una selezione dei nostri migliori salumi e formaggi per 2 persone.",
    image:
      "https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&q=80&w=800",
  },
  {
    name: "Verdicchio in abbinamento",
    points: 850,
    description: "Una bottiglia di Verdicchio dei Castelli di Jesi selezionata dal nostro banco.",
    image:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&q=80&w=800",
  },
  {
    name: "Porchetta per la famiglia",
    points: 1200,
    description: "1kg della nostra porchetta calda artigianale, pronta per te il sabato mattina.",
    image:
      "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=80&w=800",
  },
];

const inputClasses =
  "w-full rounded-xl border border-brown-900/15 bg-cream-dark/40 px-4 py-3.5 text-sm text-brown-950 transition-colors placeholder:text-taupe/60 focus:border-gold-dark focus:outline-none";

function Disclaimer() {
  return (
    <div className="rounded-xl border border-gold-dark/30 bg-gold/10 px-5 py-4 text-sm text-brown-900">
      Anteprima funzionale: login e punti sono simulati in questo browser. Per l&apos;area
      personale reale serve un sistema di autenticazione e un database collegati al sito.
    </div>
  );
}

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

  if (!ready) return <div className="min-h-screen bg-brown-900" />;

  if (!name) {
    return (
      <div className="relative overflow-hidden bg-brown-900 px-5 pt-40 pb-32 sm:px-8 sm:pt-48">
        <div className="parallax-orb absolute -top-40 -left-40 h-[60rem] w-[60rem] opacity-10" />
        <Reveal className="relative z-10 mx-auto max-w-xl">
          <div className="mb-12 space-y-4 text-center">
            <span className="eyebrow block">Il tuo account</span>
            <h1 className="font-display text-4xl tracking-tighter text-white sm:text-6xl">
              Il Club Taccalite
            </h1>
            <p className="text-lg font-light text-cream/75">
              Accedi per consultare la tua scheda fedeltà, i punti raccolti e i premi riservati
              ai clienti della bottega.
            </p>
          </div>

          <div className="card-shadow-soft space-y-6 rounded-[28px] bg-white/95 p-8 backdrop-blur sm:p-12">
            <Disclaimer />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                  mode === "login" ? "bg-brown-950 text-cream" : "text-brown-800/75 hover:text-brown-950"
                }`}
              >
                Accedi
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                  mode === "register" ? "bg-brown-950 text-cream" : "text-brown-800/75 hover:text-brown-950"
                }`}
              >
                Registrati
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-5">
              <div className="space-y-2">
                <label className="eyebrow eyebrow-dark block" htmlFor="account-name">
                  Nome e cognome
                </label>
                <input
                  id="account-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Mario Rossi"
                  className={inputClasses}
                />
              </div>
              <div className="space-y-2">
                <label className="eyebrow eyebrow-dark block" htmlFor="account-email">
                  Email
                </label>
                <input
                  id="account-email"
                  type="email"
                  placeholder="mario.rossi@email.it"
                  className={inputClasses}
                />
              </div>
              <button
                type="submit"
                data-magnetic
                className="mt-2 rounded-full bg-gold px-8 py-4 text-xs font-bold tracking-widest text-brown-950 uppercase shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark"
              >
                {mode === "login" ? "Accedi" : "Crea account"}
              </button>
            </form>
          </div>
        </Reveal>
      </div>
    );
  }

  return (
    <div>
      {/* Hero + card */}
      <section className="relative overflow-hidden bg-brown-900 px-5 pt-40 pb-24 sm:px-10 sm:pt-48 sm:pb-32">
        <div className="parallax-orb absolute -top-40 -left-40 h-[60rem] w-[60rem] opacity-10" />
        <div
          className="parallax-orb absolute -right-40 -bottom-40 h-[50rem] w-[50rem] opacity-10"
          style={{ background: "radial-gradient(circle, var(--color-brown-600) 0%, transparent 70%)" }}
        />
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center">
          <Reveal className="mb-14 space-y-4 text-center">
            <span className="eyebrow block">Benvenuto, {name.split(" ")[0]}</span>
            <h1 className="font-display text-4xl tracking-tighter text-white sm:text-6xl">
              Il tuo Club Taccalite
            </h1>
          </Reveal>
          <Reveal delay={0.15} className="w-full">
            <LoyaltyCard name={name} />
          </Reveal>
          <Reveal delay={0.25} className="mt-10">
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-white/25 px-6 py-2.5 text-xs font-bold tracking-widest text-cream/80 uppercase transition-colors hover:border-white/50 hover:text-white"
            >
              Esci
            </button>
          </Reveal>
        </div>
      </section>

      {/* Profilo + statistiche */}
      <section className="bg-cream px-5 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="space-y-10 lg:col-span-7">
            <Reveal>
              <Disclaimer />
            </Reveal>
            <Reveal className="card-shadow-soft flex flex-col items-center gap-8 rounded-[28px] border border-brown-900/10 bg-white/50 p-8 md:flex-row sm:p-10">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-white bg-cream-dark shadow-xl">
                <User className="size-12 text-brown-900/40" />
              </div>
              <div className="flex-1 space-y-5 text-center md:text-left">
                <div className="space-y-1">
                  <h4 className="font-display text-3xl text-brown-950">{name}</h4>
                  <p className="font-medium text-brown-800/75">Cliente Taccalite</p>
                </div>
                <p className="text-sm leading-relaxed text-brown-900/75">
                  Presenta la tua scheda in negozio ad ogni acquisto per accumulare punti e
                  riscattare i premi del club.
                </p>
              </div>
            </Reveal>
            <Reveal className="card-shadow-soft rounded-[28px] border border-brown-900/10 bg-white/50 p-8 sm:p-10">
              <h3 className="font-display mb-6 text-3xl tracking-tight text-brown-950">
                Come funziona
              </h3>
              <ul className="space-y-4 text-brown-900/80">
                <li className="flex items-start gap-4">
                  <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-dark" />
                  Ogni acquisto nei nostri due negozi ti fa guadagnare punti fedeltà.
                </li>
                <li className="flex items-start gap-4">
                  <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-dark" />
                  Raggiunta la soglia, riscatti il premio direttamente al banco.
                </li>
                <li className="flex items-start gap-4">
                  <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-dark" />
                  I punti non scadono e valgono in entrambi i negozi Taccalite.
                </li>
              </ul>
            </Reveal>
          </div>

          <div className="space-y-6 lg:col-span-5">
            <Reveal delay={0.1} className="card-shadow-soft space-y-4 rounded-[28px] border border-brown-900/10 bg-white/60 p-8">
              <div className="mb-2 flex items-center gap-4">
                <TrendingUp className="size-6 text-gold-dark" />
                <h5 className="text-[11px] font-bold tracking-[0.3em] text-brown-950 uppercase">
                  Il tuo profilo punti
                </h5>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between rounded-2xl border border-brown-950/5 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium tracking-widest text-brown-800/75 uppercase">
                    Punti raccolti
                  </p>
                  <p className="font-display text-3xl text-brown-950">340</p>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-brown-950/5 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium tracking-widest text-brown-800/75 uppercase">
                    Prossimo premio
                  </p>
                  <p className="font-display text-3xl text-brown-950">500</p>
                </div>
              </div>
              <div className="pt-4">
                <div className="mb-2 flex justify-between text-[10px] font-bold tracking-widest uppercase">
                  <p>Tagliere della casa</p>
                  <p>160 pt mancanti</p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-brown-950/5">
                  <div className="h-full rounded-full bg-gold" style={{ width: "68%" }} />
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.2} className="cinematic-shadow space-y-6 rounded-[28px] bg-brown-950 p-8 text-white">
              <h5 className="text-[11px] font-bold tracking-[0.3em] text-gold uppercase">
                Vuoi accumulare più punti?
              </h5>
              <p className="font-light text-cream/75">
                Prenota un tavolo per una degustazione: ogni visita ti avvicina al prossimo premio.
              </p>
              <Link
                href="/prenotazioni"
                data-magnetic
                className="inline-flex w-full items-center justify-center rounded-full bg-gold px-6 py-3.5 text-xs font-bold tracking-widest text-brown-950 uppercase shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark"
              >
                Prenota un tavolo
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Catalogo premi */}
      <section className="relative overflow-hidden bg-brown-950 px-5 py-24 sm:px-10 sm:py-32">
        <div className="relative z-10 mx-auto max-w-7xl">
          <Reveal className="mb-16 flex flex-col justify-between gap-8 md:mb-24 md:flex-row md:items-end">
            <div className="space-y-6">
              <span className="eyebrow block">I premi disponibili</span>
              <h2 className="font-display text-4xl tracking-tighter text-white sm:text-5xl md:text-7xl">
                Catalogo fedeltà
              </h2>
            </div>
            <p className="max-w-md text-lg leading-relaxed text-cream/70">
              Accumula punti e riscatta le eccellenze del nostro territorio. Ogni visita ti
              avvicina al prossimo premio.
            </p>
          </Reveal>
          <RevealStagger className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
            {rewards.map((reward) => (
              <RevealStaggerItem key={reward.name} className="group">
                <div className="cinematic-shadow relative mb-8 aspect-[4/3] overflow-hidden rounded-[24px]">
                  <Image
                    src={reward.image}
                    alt={reward.name}
                    fill
                    className="object-cover transition-transform duration-[1.5s] group-hover:scale-110"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brown-950/80 via-transparent to-transparent" />
                  <div className="absolute bottom-6 left-6">
                    <p className="font-display text-2xl font-bold text-gold">
                      {reward.points}{" "}
                      <span className="font-sans text-xs tracking-widest uppercase">punti</span>
                    </p>
                  </div>
                </div>
                <h4 className="font-display mb-2 text-2xl text-white">{reward.name}</h4>
                <p className="mb-6 text-sm leading-relaxed text-cream/70">{reward.description}</p>
                <p className="text-[10px] font-bold tracking-widest text-gold uppercase">
                  Riscattabile in negozio
                </p>
              </RevealStaggerItem>
            ))}
          </RevealStagger>
        </div>
      </section>
    </div>
  );
}
