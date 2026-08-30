import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { comparisonFromPair, comparisonPairs } from "@/lib/public-catalog";
import { publicMetadata } from "@/lib/seo";
import s from "../../public.module.css";

type Props = { params: Promise<{ pair: string }> };
export function generateStaticParams() { return comparisonPairs.map(({ pair }) => ({ pair })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { pair } = await params; const match = comparisonFromPair(pair); if (!match) return { robots: { index: false, follow: false } }; return publicMetadata({ title: `${match.first.name} vs ${match.second.name}`, description: `Compare ${match.first.name} and ${match.second.name} for customer support workflows, then invite vendors to compete on fit and software pricing.`, path: `/compare/${match.canonicalPair}`, index: match.isCanonical }); }

export default async function ComparePage({ params }: Props) {
  const { pair } = await params; const match = comparisonFromPair(pair); if (!match) notFound(); if (!match.isCanonical) permanentRedirect(`/compare/${match.canonicalPair}`); const { first: a, second: b } = match;
  return <div className={s.page}><section className={s.hero}><span className="eyebrow">Software comparison</span><h1>{a.name} vs {b.name}</h1><p>A useful comparison starts with your workflow and ends with a real commercial offer—not a generic feature-count score.</p></section><section className={s.section}><div className={s.comparison}>{[a,b].map((item) => <article key={item.slug}><span className={s.number}>Contender</span><h2>{item.name}</h2><p>{item.summary}</p><ul className={s.facts}><li><span>Best for</span><strong>{item.bestFor}</strong></li><li><span>Category</span><strong>Customer support</strong></li><li><span>Deployment</span><strong>Cloud</strong></li></ul><Link className="text-link" href={`/software/${item.slug}`}>Explore {item.name} →</Link></article>)}</div><div className={s.actions}><Link className="button button-primary" href="/start">Get competing offers →</Link></div></section></div>;
}
