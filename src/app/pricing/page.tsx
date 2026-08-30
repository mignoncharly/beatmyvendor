import type { Metadata } from "next";
import Link from "next/link";
import s from "../public.module.css";

export const metadata: Metadata = { title: "Pricing", description: "BeatMyyVendor is free for buyers. Vendors pay €99.99 only when selected for an introduction.", alternates: { canonical: "/pricing" } };

export default function PricingPage() {
  return <div className={s.page}><section className={s.hero}><span className="eyebrow">Simple pricing</span><h1>Free to compete. Pay when chosen.</h1><p>No subscriptions, listing fees, success commissions, or buyer charges.</p></section><section className={s.section}><div className={s.comparison}><article><span className={s.number}>Buyers</span><h2>€0</h2><p>Create Duels, receive offers, compare, select, and get introduced at no charge.</p><Link className="button button-primary" href="/start">Start a Duel →</Link></article><article className={s.acid}><span className={s.number}>Vendors</span><h2>€99.99</h2><p>One fixed fee, including VAT where applicable, after the buyer selects your offer. No selection means no charge.</p><Link className="button button-primary" href="/login?role=vendor">Join as vendor →</Link></article></div></section></div>;
}
