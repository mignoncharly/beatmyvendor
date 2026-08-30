import type { MetadataRoute } from "next";
import { comparisonPairs, softwareCatalog } from "@/lib/public-catalog";
import { getPublicDuels, getPublicWins } from "@/lib/public-marketplace";
import { absoluteUrl } from "@/lib/site";

const staticPages: Array<{ path: string; changeFrequency: "weekly" | "monthly"; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.9 },
  { path: "/vendors", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/trust", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.4 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.4 },
  { path: "/imprint", changeFrequency: "monthly", priority: 0.3 },
  { path: "/cookies", changeFrequency: "monthly", priority: 0.4 }
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [duels, wins] = await Promise.all([getPublicDuels(), getPublicWins()]);
  const listingPages = [
    { url: absoluteUrl("/duels"), changeFrequency: "daily" as const, priority: 0.8 },
    { url: absoluteUrl("/wins"), changeFrequency: "weekly" as const, priority: 0.7 }
  ];
  const catalogPages = softwareCatalog.flatMap((product) => [
    { url: absoluteUrl(`/software/${product.slug}`), changeFrequency: "monthly" as const, priority: 0.75 },
    { url: absoluteUrl(`/alternatives/${product.slug}`), changeFrequency: "monthly" as const, priority: 0.7 }
  ]);
  const comparisons = comparisonPairs.map(({ pair }) => ({ url: absoluteUrl(`/compare/${pair}`), changeFrequency: "monthly" as const, priority: 0.6 }));
  const publicDuels = duels.map((duel) => ({ url: absoluteUrl(`/duels/${duel.slug}`), changeFrequency: "daily" as const, priority: 0.7 }));
  const publicWins = wins.map((win) => ({ url: absoluteUrl(`/wins/${win.slug}`), lastModified: win.confirmed_at, changeFrequency: "monthly" as const, priority: 0.7 }));

  return [
    ...staticPages.map((page) => ({ ...page, url: absoluteUrl(page.path) })),
    ...listingPages,
    ...catalogPages,
    ...comparisons,
    ...publicDuels,
    ...publicWins
  ];
}
