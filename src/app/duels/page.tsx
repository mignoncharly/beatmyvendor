import type { Metadata } from "next";
import Link from "next/link";
import { getPublicDuels, money } from "@/lib/public-marketplace";
import s from "../public.module.css";

export const revalidate = 300;
export const metadata: Metadata = { title: "Live software Duels", description: "Browse anonymized, verified software contracts currently open to challenger offers.", alternates: { canonical: "/duels" } };

export default async function DuelsPage() {
  const duels = await getPublicDuels();
  return <div className={s.page}><section className={s.hero}><span className="eyebrow">Public opportunities</span><h1>Live software Duels.</h1><p>Buyer identity and private requirements stay sealed. Approved vendors see the qualified detail after signing in.</p></section><section className={s.section}>{duels.length ? <div className={s.list}>{duels.map((duel) => <Link className={s.row} href={`/duels/${duel.slug}`} key={duel.slug}><span>VD-{duel.public_id}</span><strong>{duel.current_software_name}</strong><span>{money(duel.annual_spend,duel.currency)}/year</span><span>{duel.seats} seats · {duel.country_code}</span><b>View →</b></Link>)}</div> : <div className={s.empty}><span className="eyebrow">The board is clear</span><h2>No public Duels are open right now.</h2><p>New verified opportunities appear here after moderation.</p><Link className="button button-primary" href="/start">Create the next Duel →</Link></div>}</section></div>;
}
