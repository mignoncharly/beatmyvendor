import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "./polish.css";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { ConsentManager, CookieSettingsButton } from "@/components/consent-manager";
import { JsonLd } from "@/components/json-ld";
import { PwaRegistration } from "@/components/pwa-registration";
import { SiteNavigation } from "@/components/site-navigation";
import { organizationSchema, websiteSchema } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "BeatMyVendor — Make software vendors compete", template: "%s | BeatMyVendor" },
  applicationName: "BeatMyVendor",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BeatMyVendor", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <JsonLd data={[organizationSchema, websiteSchema]} />
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="BeatMyVendor home"><span>V</span>BeatMyVendor</Link>
          <SiteNavigation />
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="site-footer"><span>© 2026 BeatMyVendor</span><nav aria-label="Footer"><Link href="/wins">Wins</Link><Link href="/pricing">Pricing</Link><Link href="/software/zendesk">Software</Link><Link href="/trust">Trust</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/imprint">Imprint</Link><Link href="/cookies">Cookies</Link><CookieSettingsButton /><Link href="/account/privacy">Data controls</Link></nav><span>Make vendors compete for you.</span></footer>
        <ConsentManager />
        <AnalyticsProvider />
        <PwaRegistration />
      </body>
    </html>
  );
}
