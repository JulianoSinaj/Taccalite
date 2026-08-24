import { rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Start every run from an empty database.
 *
 * The DB-integration tests share one migrated SQLite file at
 * `./.vitest-tmp/test.db` (see `vitest.config.ts`), and nothing ever removed it
 * — so fixtures accumulated across runs. The suite passed on a fresh checkout
 * and then failed on the second `vitest run` with numbers that were exact
 * multiples of the expected ones (a day's porchetta total of 6 kg reading 12,
 * then 18) and a UNIQUE violation on a discount code inserted by the previous
 * run. Both look like product bugs and are neither.
 *
 * Deleting the file here rather than in a `beforeAll` keeps it to once per run,
 * before any worker opens a connection. The `-shm`/`-wal` siblings go too: WAL
 * mode leaves committed pages in them, so removing only the main file would
 * restore the very rows this is meant to drop.
 */
export default function setup(): void {
  const base = resolve(__dirname, "../.vitest-tmp/test.db");
  for (const suffix of ["", "-shm", "-wal"]) {
    rmSync(`${base}${suffix}`, { force: true });
  }
}
