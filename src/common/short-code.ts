const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I

/// A short, human-typeable code (hotel codes, etc.) — not cryptographically
/// sensitive, just needs to be short and hard to mistype.
export function generateShortCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
