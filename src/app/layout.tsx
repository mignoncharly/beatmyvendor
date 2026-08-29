import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "./polish.css";
import { SiteNavigation } from "@/components/site-navigation";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "VendorDuel — Make software vendors compete", template: "%s | VendorDuel" },
  description: "Tell us what you use and what you pay. Competitors send better offers. You choose the winner.",
  openGraph: { type: "website", siteName: "VendorDuel", title: "Make software vendors compete", description: "Verified buyers invite competing software vendors to beat their current deal.", url: "/" },
  twitter: { card: "summary_large_image", title: "VendorDuel", description: "Make software vendors compete for you." }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="VendorDuel home"><span>V</span>VendorDuel</Link>
          <SiteNavigation />
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="site-footer"><span>© 2026 VendorDuel</span><nav aria-label="Footer"><Link href="/wins">Wins</Link><Link href="/pricing">Pricing</Link><Link href="/software/zendesk">Software</Link><Link href="/trust">Trust</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/imprint">Imprint</Link><Link href="/cookies">Cookies</Link><Link href="/account/privacy">Data controls</Link></nav><span>Make vendors compete for you.</span></footer>
      </body>
    </html>
  );
}
