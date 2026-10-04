// Round-2 plan S17: anyone holding the link sees this page, so the address is shown masked
// (enough for the person to recognise it, not enough to harvest it).
export function maskRecipient(recipient: string | null | undefined) {
  const value = String(recipient ?? "").trim();
  if (!value) return "";
  const at = value.indexOf("@");
  if (at > 0) {
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const dot = domain.lastIndexOf(".");
    const domainName = dot > 0 ? domain.slice(0, dot) : domain;
    const suffix = dot > 0 ? domain.slice(dot) : "";
    return `${local[0]}${"*".repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domainName[0] ?? ""}***${suffix}`;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) return `******${digits.slice(-4)}`;
  return "****";
}
