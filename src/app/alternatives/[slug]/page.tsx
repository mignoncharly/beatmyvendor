import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { alternativesTo, getSoftware, softwareCatalog } from "@/lib/public-catalog";
import s from "../../public.module.css";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return softwareCatalog.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const product = getSoftware(slug); if (!product) return {}; return { title: `Best ${product.name} alternatives`, description: `Compare credible ${product.name} alternatives and invite them to compete for your software budget.`, alternates: { canonical: `/alternatives/${slug}` } }; }

export default async function AlternativesPage({ params }: Props) {
  const { slug } = await params; const current = getSoftware(slug); if (!current) notFound(); const alternatives = alternativesTo(slug);
  return <div className={s.page}><section className={s.hero}><nav className={s.breadcrumbs}><Link href="/">Home</Link> / Alternatives / {current.name}</nav><span className="eyebrow">Buyer guide</span><h1>{current.name} alternatives worth testing.</h1><p>The best alternative depends on workflow, channels, integrations, team size, and commercial terms. BeatMyVendor lets the vendors prove both product fit and price against your actual requirements.</p><Link className="button button-primary" href="/start">Make them compete →</Link></section><section className={s.section}><div className={s.grid}>{alternatives.map((item, index) => <article className={s.card} key={item.slug}><span className={s.number}>{String(index + 1).padStart(2,"0")}</span><h3>{item.name}</h3><p>{item.summary}</p><p><strong>Best for:</strong> {item.bestFor}.</p><Link href={`/compare/${slug}-vs-${item.slug}`}>Compare with {current.name} →</Link></article>)}</div></section></div>;
}
