"use client";

import { useEffect } from "react";
import { useCart } from "./cart";

/** Clears the cart on mount (used on the order-success page). */
export default function ClearCart() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
