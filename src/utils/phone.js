/**
 * Normalize phone numbers to a compact E.164-ish form:
 * keeps leading +, strips spaces/dashes/parens, digits only otherwise.
 */
export function normalizePhone(phone) {
  if (phone == null || phone === '') {
    return null;
  }

  const raw = String(phone).trim();
  if (!raw) {
    return null;
  }

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  return hasPlus ? `+${digits}` : digits;
}
