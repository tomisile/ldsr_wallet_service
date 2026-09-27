/**
 * Amounts are integer minor units (kobo) everywhere: in the database, in the
 * service layer, and on the wire. Nothing converts to a decimal, because a
 * binary float cannot represent a decimal fraction exactly and any arithmetic on
 * one drifts.
 *
 * The ceiling is well inside the exact integer range of a JavaScript number, so
 * a total can never silently lose precision.
 */
export const MAX_AMOUNT_MINOR_UNITS = 1_000_000_000_000; // 10 billion naira

/** Presentation only. Never used for arithmetic or storage. */
export function formatMinorUnits(minorUnits: number): string {
  const naira = Math.trunc(minorUnits / 100);
  const kobo = Math.abs(minorUnits % 100);
  return `${naira.toLocaleString('en-NG')}.${String(kobo).padStart(2, '0')}`;
}
