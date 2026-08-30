import type { ReactNode } from "react";
import { noIndexMetadata } from "@/lib/seo";

// Authenticated / private area: explicitly excluded from search indexes in
// addition to the robots.txt disallow and middleware auth redirect.
export const metadata = noIndexMetadata;

export default function PrivateSectionLayout({ children }: { children: ReactNode }) {
  return children;
}
