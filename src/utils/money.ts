export const MAX_AMOUNT_MINOR_UNITS = 1_000_000_000_000; // 10 billion naira
export function formatMinorUnits(minorUnits: number): string {
  const naira = Math.trunc(minorUnits / 100);
  const kobo = Math.abs(minorUnits % 100);
  return `${naira.toLocaleString('en-NG')}.${String(kobo).padStart(2, '0')}`;
}
