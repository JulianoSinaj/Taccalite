import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { addresses, type AddressRow } from "@/lib/db/schema";

/**
 * A customer's address book.
 *
 * Kept separate from `orders.shippingAddress`, which is and stays a frozen
 * per-order snapshot: an order has to record where it actually went even after
 * the customer edits or deletes the address it was copied from. This module owns
 * the editable source; checkout reads the default and copies it.
 */

export type AddressInput = {
  label?: string;
  name?: string;
  phone?: string | null;
  street?: string;
  city?: string;
  postcode?: string;
  province?: string;
  country?: string;
  notes?: string | null;
  isDefault?: boolean;
};

export async function listAddresses(userId: string): Promise<AddressRow[]> {
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

export async function getDefaultAddress(userId: string): Promise<AddressRow | null> {
  const [row] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Make one address the default, clearing the flag on the others.
 *
 * "Exactly one default per user" is held here rather than by a constraint:
 * SQLite's partial unique index would express it, but it does not survive
 * drizzle's snapshot round-trip cleanly, and a rebuild of this table to add one
 * is not worth the risk described in `lib/db/schema.ts`. One function owns the
 * invariant, and every write path goes through it.
 */
async function makeDefault(userId: string, addressId: string): Promise<void> {
  await db
    .update(addresses)
    .set({ isDefault: false })
    .where(and(eq(addresses.userId, userId), ne(addresses.id, addressId)));
  await db
    .update(addresses)
    .set({ isDefault: true })
    .where(and(eq(addresses.userId, userId), eq(addresses.id, addressId)));
}

export async function createAddress(userId: string, input: AddressInput): Promise<AddressRow> {
  const existing = await listAddresses(userId);
  // The first address a customer saves is their default whether they said so or
  // not — an address book with no default would leave checkout with nothing to
  // prefill, which is the entire point of having one.
  const shouldDefault = input.isDefault || existing.length === 0;

  const [created] = await db
    .insert(addresses)
    .values({
      userId,
      label: input.label ?? "",
      name: input.name ?? "",
      phone: input.phone ?? null,
      street: input.street ?? "",
      city: input.city ?? "",
      postcode: input.postcode ?? "",
      province: input.province ?? "",
      country: input.country ?? "IT",
      notes: input.notes ?? null,
      isDefault: false,
    })
    .returning();

  if (shouldDefault) await makeDefault(userId, created.id);
  return { ...created, isDefault: shouldDefault };
}

/** Update an address, scoped to its owner so an id alone is never enough. */
export async function updateAddress(
  userId: string,
  addressId: string,
  input: AddressInput,
): Promise<boolean> {
  const [updated] = await db
    .update(addresses)
    .set({
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.street !== undefined ? { street: input.street } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.postcode !== undefined ? { postcode: input.postcode } : {}),
      ...(input.province !== undefined ? { province: input.province } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
    .returning({ id: addresses.id });
  if (!updated) return false;

  if (input.isDefault) await makeDefault(userId, addressId);
  return true;
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
    .limit(1);
  if (!row) return false;
  await makeDefault(userId, addressId);
  return true;
}

/**
 * Delete an address. If it was the default, promote the most recent survivor —
 * otherwise the customer is left with a book full of addresses and no default,
 * and checkout silently stops prefilling.
 */
export async function deleteAddress(userId: string, addressId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
    .returning({ id: addresses.id, wasDefault: addresses.isDefault });
  if (!deleted) return false;

  if (deleted.wasDefault) {
    const remaining = await listAddresses(userId);
    if (remaining[0]) await makeDefault(userId, remaining[0].id);
  }
  return true;
}
