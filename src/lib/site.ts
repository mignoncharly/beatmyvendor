export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}
