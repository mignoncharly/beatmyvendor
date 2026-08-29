import type { Metadata } from "next";
import Link from "next/link";
import s from "../public.module.css";

export const metadata: Metadata = { title: "How it works", description: "How buyers create a verified Duel and software vendors compete with private offers.", alternates: { canonical: "/how-it-works" } };

export default function HowItWorksPage() {
  return <div className={s.page}><section className={s.hero}><span className="eyebrow">A better buying process</span><h1>One brief. Better offers. Your decision.</h1><p>VendorDuel turns existing software spend into leverage without publishing buyer identity or starting a noisy reverse auction.</p><div className={s.actions}><Link className="button button-primary" href="/start">Start a Duel →</Link><Link className="button button-secondary" href="/vendors">I am a vendor</Link></div></section><section className={s.section}><span className="eyebrow">For buyers</span><div className={s.grid}>{[
    ["01", "Describe the deal", "Share the product, annual spend, renewal window, and the requirements a replacement must cover."],
    ["02", "Verify privately", "A business email and spend evidence keep the marketplace credible. Documents are never shown to vendors."],
    ["03", "Compare sealed offers", "Qualified vendors submit structured offers. They cannot see one another's pricing."],
    ["04", "Choose the conversation", "Select only an offer worth discussing. Your details remain private until the introduction is paid."],
    ["05", "Meet the challenger", "The selected vendor pays the fixed introduction fee. Buyers never pay VendorDuel."],
    ["06", "Confirm the outcome", "Record the final deal and, only with consent, turn verified savings into a public win."]
  ].map(([n,title,copy]) => <article className={s.card} key={n}><span className={s.number}>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section></div>;
}
