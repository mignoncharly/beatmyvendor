import type { Metadata } from "next";
import Link from "next/link";
import { MagicLinkForm } from "@/components/magic-link-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <section className="auth-shell">
      <div className="auth-copy"><div className="eyebrow">Secure access</div><h1>One link.<br />No password.</h1><p>Your verified work email keeps duels credible and vendor access accountable.</p><Link href="/">← Back to BeatMyVendor</Link></div>
      <div className="auth-card"><span className="card-kicker">WELCOME</span><h2>Sign in or create your account</h2><p>Buyer and vendor workspaces stay separate. You can create both with the same account.</p><MagicLinkForm /></div>
    </section>
  );
}
