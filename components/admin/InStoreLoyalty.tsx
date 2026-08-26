"use client";

import { useRef, useState } from "react";
import { ScanForm } from "./ScanForm";
import { NewCardForm } from "./NewCardForm";

/**
 * The counter screen's two halves share one thing: the card number. A card
 * created on the right is carried straight into the accrual form on the left,
 * so the first purchase doesn't mean retyping a number off a toast.
 */
export function InStoreLoyalty({ pointsPerEuro, enabled }: { pointsPerEuro: number; enabled: boolean }) {
  const [card, setCard] = useState("");
  const cardInput = useRef<HTMLInputElement>(null);

  function pickCard(cardNumber: string) {
    setCard(cardNumber);
    // After the state lands, so the focus goes to the box that shows it.
    requestAnimationFrame(() => {
      cardInput.current?.focus();
      cardInput.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <ScanForm
        pointsPerEuro={pointsPerEuro}
        enabled={enabled}
        card={card}
        onCardChange={setCard}
        inputRef={cardInput}
      />
      <NewCardForm onUseCard={pickCard} />
    </div>
  );
}
