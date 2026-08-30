import { softwareCatalog } from "@/lib/public-catalog";
import { absoluteUrl } from "@/lib/site";

export function GET() {
  const core = [
    ["Homepage", "/"],
    ["How BeatMyVendor works", "/how-it-works"],
    ["For software vendors", "/vendors"],
    ["Pricing", "/pricing"],
    ["Live public Duels", "/duels"],
    ["Verified public wins", "/wins"],
    ["Trust and marketplace integrity", "/trust"],
    ["Privacy policy", "/privacy"],
    ["Cookie policy", "/cookies"]
  ];
  const lines = [
    "# BeatMyVendor",
    "",
    "> BeatMyVendor is a B2B software marketplace. A business shares the software it uses, its annual spend, and replacement requirements. Approved vendors submit sealed offers. The buyer compares those offers and chooses which vendor to meet.",
    "",
    "## Canonical public resources",
    "",
    ...core.map(([label, path]) => `- [${label}](${absoluteUrl(path)})`),
    "",
    "## Customer support software guides",
    "",
    ...softwareCatalog.flatMap((product) => [`- [${product.name} software guide](${absoluteUrl(`/software/${product.slug}`)})`, `- [${product.name} alternatives](${absoluteUrl(`/alternatives/${product.slug}`)})`]),
    "",
    "Private workspaces, account routes, APIs, draft Duels, unpublished outcomes, and payment flows are intentionally omitted. The canonical HTML pages, structured data, robots.txt, and sitemap.xml remain the primary sources of truth.",
    ""
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
