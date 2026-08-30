import type { Metadata } from "next";
import Link from "next/link";
import { noIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = { title: "Offline", ...noIndexMetadata };

export default function OfflinePage() {
  return <section className="center-page" aria-labelledby="offline-title"><div className="status-card"><span className="status-icon" aria-hidden="true">OFF</span><div className="eyebrow">Connection unavailable</div><h1 id="offline-title">You are offline.</h1><p>Reconnect to load live Duels, workspaces, authentication, or payment information. BeatMyVendor does not keep private application pages in the offline cache.</p><div className="error-actions"><Link className="button button-primary" href="/">Return home</Link><Link className="button button-secondary" href="/how-it-works">How BeatMyVendor works</Link></div></div></section>;
}
