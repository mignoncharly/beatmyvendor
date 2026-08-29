import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicDuel, money } from "@/lib/public-marketplace";
import s from "../../public.module.css";

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 300;
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const duel = await getPublicDuel(slug); if (!duel) return {}; return { title: `${duel.current_software_name} Duel VD-${duel.public_id}`, description: `A verified ${duel.country_code} buyer is inviting alternatives to challenge ${money(duel.annual_spend,duel.currency)} in annual ${duel.current_software_name} spend.`, alternates: { canonical: `/duels/${slug}` } }; }

export default async function PublicDuelPage({ params }: Props) {
  const { slug } = await params; const duel = await getPublicDuel(slug); if (!duel) notFound();
  return <div className={s.page}><section className={s.hero}><nav className={s.breadcrumbs}><Link href="/duels">Live Duels</Link> / VD-{duel.public_id}</nav><span className="eyebrow">{duel.verification_badge?.replaceAll("_"," ") || "Verified business"}</span><h1>Who can beat {duel.current_software_name}?</h1><p>An anonymized {duel.company_size} business in {duel.country_code} is open to qualified replacement offers.</p></section><section className={s.section}><div className={s.comparison}><article className={s.acid}><span className={s.number}>Current contract</span><h2>{money(duel.annual_spend,duel.currency)}</h2><ul className={s.facts}><li><span>Billing</span><strong>Annual spend</strong></li><li><span>Seats</span><strong>{duel.seats}</strong></li><li><span>Category</span><strong>{duel.category_name}</strong></li></ul></article><article><span className={s.number}>Buyer intent</span><h2>{duel.buyer_intent.replaceAll("_"," ")}</h2><p>Offers close {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(duel.submission_deadline))}.</p><Link className="button button-primary" href="/login?role=vendor">Challenge this deal →</Link></article></div></section></div>;
}
