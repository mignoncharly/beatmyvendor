import type { Metadata } from "next";
import Link from "next/link";
import { getPublicWins, money } from "@/lib/public-marketplace";
import s from "../public.module.css";

export const revalidate = 300;
export const metadata: Metadata = { title: "Verified software savings", description: "Confirmed software deals won through VendorDuel, published only with buyer consent.", alternates: { canonical: "/wins" } };

export default async function WinsPage() { const wins = await getPublicWins(); return <div className={s.page}><section className={`${s.hero} ${s.dark}`}><span className="eyebrow">Proof, not promises</span><h1>Verified wins.</h1><p>Confirmed deal outcomes published only with buyer consent. Vendor names appear only with vendor consent.</p></section><section className={s.section}>{wins.length ? <div className={s.grid}>{wins.map((win) => { const saving = win.current_annual_price-win.final_annual_price; return <article className={`${s.card} ${s.acid}`} key={win.slug}><span className={s.number}>Verified deal ✓</span><h3>{win.current_software_name} got beat</h3><p><strong>{money(saving,win.currency)} saved per year</strong></p><p>{win.buyer_display_name}</p><Link href={`/wins/${win.slug}`}>See the result →</Link></article>; })}</div> : <div className={s.empty}><span className="eyebrow">Results pending</span><h2>The first verified wins will appear here.</h2><p>We publish no fabricated case studies or unconfirmed savings.</p><Link className="button button-primary" href="/start">Start a Duel →</Link></div>}</section></div>; }
