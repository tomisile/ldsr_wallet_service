import { createHash, randomBytes } from 'node:crypto';
export function generateReference(prefix: 'TRF' | 'CRD'): string {
  return `${prefix}_${Date.now().toString(36).toUpperCase()}_${randomBytes(5).toString('hex').toUpperCase()}`;
}
export function fingerprintRequest(parts: Record<string, string | number>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((key) => `${key}=${parts[key]}`)
    .join('&');

  return createHash('sha256').update(canonical).digest('hex');
}
