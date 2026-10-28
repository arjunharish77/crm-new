// Keep the number as entered: the active phone connector supplies the workspace's default
// country code when it dials a national number. A leading + or 00 already carries one.
export const USER_PHONE_ERROR = "Enter a dialable phone number (for example +919876543210 or 9876543210).";

export function isValidUserPhone(value: string) {
  const phone = value.trim();
  if (!phone) return true;
  if (phone.length > 32 || !/^\+?[\d\s().-]+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+") && digits.startsWith("0")) return false;
  const dialDigits = !phone.startsWith("+") && digits.startsWith("00") ? digits.slice(2) : digits;
  return dialDigits.length >= 8 && dialDigits.length <= 15;
}

export function userPhoneForStorage(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !isValidUserPhone(value)) throw new Error("USER_PHONE_INVALID");
  return value.trim() || null;
}
