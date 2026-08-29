import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <section className="center-page"><div className="status-card"><span className="status-icon">↗</span><div className="eyebrow">Link sent</div><h1>Check your inbox.</h1><p>We sent a secure sign-in link{email ? <> to <strong>{email}</strong></> : ""}. It expires shortly and can only be used once.</p><Link className="button button-secondary" href="/login">Use another email</Link></div></section>
  );
}
