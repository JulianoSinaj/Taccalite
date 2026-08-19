"use client";

import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { inputCls } from "./ui";

/**
 * A password input for the admin, masked by default with a generator.
 *
 * The reset field used to be `type="text"`, so a new staff password was printed
 * in clear on a back-office screen that often faces the shop floor. Masking is
 * the default; revealing is a deliberate click. The generator exists because the
 * alternative to a good random password is whatever the operator invents twice
 * a year.
 */

// Ambiguous glyphs (0/O, 1/l/I) are left out: these get read aloud and written
// on paper before they get typed.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!?@#%*";

function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function PasswordField({
  id,
  label,
  name = "password",
  className = "w-52",
}: {
  id: string;
  label: string;
  name?: string;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex items-end gap-1">
      <div>
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          name={name}
          type={revealed ? "text" : "password"}
          minLength={8}
          autoComplete="new-password"
          placeholder="Nuova password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputCls} ${className}`}
        />
      </div>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-label={revealed ? "Nascondi la password" : "Mostra la password"}
        title={revealed ? "Nascondi" : "Mostra"}
        className="rounded-lg p-2.5 text-brown-800/60 hover:bg-brown-900/5 hover:text-brown-950"
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(generatePassword());
          // Generating is pointless if it can't be read down to the person.
          setRevealed(true);
        }}
        aria-label="Genera una password sicura"
        title="Genera"
        className="rounded-lg p-2.5 text-brown-800/60 hover:bg-brown-900/5 hover:text-brown-950"
      >
        <RefreshCw className="size-4" />
      </button>
    </div>
  );
}
