const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const urlPattern = /(?:^|[^a-z0-9])(?:https?:\/\/|www\.)/i;
const domainPattern = /(?:^|[^a-z0-9])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.(?:com|net|org|io|co|ai|app|dev|de|fr|uk|eu)(?:[^a-z0-9]|$)/i;
const socialPattern = /(?:^|[^a-z0-9_-])@[a-z0-9_][a-z0-9_.-]+|linkedin\.com/i;
const phonePattern = /(?:^|[^0-9])\+?[0-9][0-9 ()/.-]{6,}[0-9](?:[^0-9]|$)/;

function normalizedWords(value: string) {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
}

export type DisclosureKind = "email address" | "web address" | "domain name" | "social profile" | "phone number" | "buyer identity";

export function duelTextDisclosureKind(value: string, buyerIdentities: string[] = []): DisclosureKind | null {
  const candidate = value.trim();
  if (!candidate) return null;
  if (emailPattern.test(candidate)) return "email address";
  if (urlPattern.test(candidate)) return "web address";
  if (domainPattern.test(candidate)) return "domain name";
  if (socialPattern.test(candidate)) return "social profile";
  if (phonePattern.test(candidate)) return "phone number";

  const normalizedCandidate = ` ${normalizedWords(candidate)} `;
  if (buyerIdentities.some((identity) => {
    const normalizedIdentity = normalizedWords(identity);
    return normalizedIdentity.length >= 3 && normalizedCandidate.includes(` ${normalizedIdentity} `);
  })) return "buyer identity";

  return null;
}

export function duelRequirementsDisclosureError(labels: string[], buyerIdentities: string[] = []) {
  for (const label of labels) {
    const kind = duelTextDisclosureKind(label, buyerIdentities);
    if (kind) return `Remove the ${kind} from vendor-visible requirements. Contact and company details stay private until a paid introduction.`;
  }
  return null;
}
