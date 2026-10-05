/** Extracts the token from a scanned QR payload (our /qr/<token> URL, or the bare token). */
export function tokenFromScan(raw: string): string | null {
  const text = raw.trim();
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const fromUrl = text.match(new RegExp(`/qr/(${uuid.source})`, "i"));
  if (fromUrl) return fromUrl[1].toLowerCase();
  return new RegExp(`^${uuid.source}$`, "i").test(text) ? text.toLowerCase() : null;
}
