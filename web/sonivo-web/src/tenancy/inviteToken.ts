/**
 * Accepts a full link (`https://…/join/TOKEN`) or a bare invite code and returns
 * the token, or null when the input is not a plausible token.
 */
export function parseInviteToken(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const fromUrl = value.match(/\/join\/([A-Za-z0-9._~-]+)/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9._~-]{8,}$/.test(value) ? value : null;
}
