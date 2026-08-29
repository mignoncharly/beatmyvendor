import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/", "/software/", "/alternatives/", "/compare/", "/duels/", "/wins/"], disallow: ["/admin/", "/buyer/", "/vendor/", "/auth/", "/account/", "/report"] }, sitemap: absoluteUrl("/sitemap.xml") };
}
