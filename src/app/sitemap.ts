import type { MetadataRoute } from "next";
import { softwareCatalog } from "@/lib/public-catalog";
import { getPublicDuels, getPublicWins } from "@/lib/public-marketplace";
import { absoluteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ["", "/start", "/how-it-works", "/vendors", "/duels", "/wins", "/pricing", "/privacy", "/terms", "/imprint", "/cookies", "/trust"];
  const catalogPaths = softwareCatalog.flatMap((product) => [`/software/${product.slug}`, `/alternatives/${product.slug}`]);
  const comparisonPaths = softwareCatalog.flatMap((a) => softwareCatalog.filter((b) => b.slug !== a.slug).map((b) => `/compare/${a.slug}-vs-${b.slug}`));
  const [duels, wins] = await Promise.all([getPublicDuels(), getPublicWins()]);
  return [...staticPaths, ...catalogPaths, ...comparisonPaths, ...duels.map((d) => `/duels/${d.slug}`), ...wins.map((w) => `/wins/${w.slug}`)].map((path) => ({ url: absoluteUrl(path || "/"), lastModified: new Date(), changeFrequency: path.startsWith("/duels") ? "daily" : "weekly", priority: path === "" ? 1 : path.startsWith("/compare") ? .5 : .7 }));
}
