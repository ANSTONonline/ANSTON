// Rules shared by the sign-up forms (in the browser) and the server.

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
export const MIN_AGE = 18;

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function passwordChecks(password: string) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
  };
}

export function passwordOk(password: string) {
  const c = passwordChecks(password);
  return c.length && c.upper && c.lower;
}

// Age in whole years on today's date, from a YYYY-MM-DD birth date.
export function ageFrom(birthDate: string, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1;
  return age;
}

// Turns "713 555 0123", "(713) 555-0123" or "+44 7700 900123" into +E.164.
// Ten digits without a country code are treated as US/Canada (+1).
export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
