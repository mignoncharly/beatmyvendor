export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}

// Only same-origin relative paths survive as a post-auth return target, so the
// `next` parameter can never become an open redirect.
export function safeRelativePath(value: string | null | undefined, fallback = ""): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
