import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSoftware, softwareCatalog } from "@/lib/public-catalog";
import s from "../../public.module.css";

type Props = { params: Promise<{ pair: string }> };
function products(pair: string) { for (const first of softwareCatalog) { const marker = `${first.slug}-vs-`; if (pair.startsWith(marker)) { const second = getSoftware(pair.slice(marker.length)); if (second && second.slug !== first.slug) return [first, second] as const; } } }
export function generateStaticParams() { return softwareCatalog.flatMap((a) => softwareCatalog.filter((b) => b.slug !== a.slug).map((b) => ({ pair: `${a.slug}-vs-${b.slug}` }))); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { pair } = await params; const match = products(pair); if (!match) return {}; return { title: `${match[0].name} vs ${match[1].name}`, description: `Compare ${match[0].name} and ${match[1].name}, then ask vendors to compete on your requirements and spend.`, alternates: { canonical: `/compare/${pair}` } }; }

export default async function ComparePage({ params }: Props) {
  const { pair } = await params; const match = products(pair); if (!match) notFound(); const [a,b] = match;
  return <div className={s.page}><section className={s.hero}><span className="eyebrow">Software comparison</span><h1>{a.name} vs {b.name}</h1><p>A useful comparison starts with your workflow and ends with a real commercial offer—not a generic feature-count score.</p></section><section className={s.section}><div className={s.comparison}>{[a,b].map((item) => <article key={item.slug}><span className={s.number}>Contender</span><h2>{item.name}</h2><p>{item.summary}</p><ul className={s.facts}><li><span>Best for</span><strong>{item.bestFor}</strong></li><li><span>Category</span><strong>Customer support</strong></li><li><span>Deployment</span><strong>Cloud</strong></li></ul><Link className="text-link" href={`/software/${item.slug}`}>Explore {item.name} →</Link></article>)}</div><div className={s.actions}><Link className="button button-primary" href="/start">Get competing offers →</Link></div></section></div>;
}
