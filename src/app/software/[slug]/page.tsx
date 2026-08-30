import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { alternativesTo, getSoftware, softwareCatalog } from "@/lib/public-catalog";
import s from "../../public.module.css";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return softwareCatalog.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const product = getSoftware(slug); if (!product) return {}; return { title: `${product.name} pricing alternatives`, description: `Already paying for ${product.name}? Invite qualified alternatives to compete for your business.`, alternates: { canonical: `/software/${slug}` } }; }

export default async function SoftwarePage({ params }: Props) {
  const { slug } = await params; const product = getSoftware(slug); if (!product) notFound(); const alternatives = alternativesTo(slug).slice(0, 6);
  const schema = { "@type": "SoftwareApplication", name: product.name, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: product.website, description: product.summary };
  return <div className={s.page}><JsonLd data={schema} /><section className={s.hero}><nav className={s.breadcrumbs}><Link href="/">Home</Link> / Software / {product.name}</nav><span className="eyebrow">Customer support software</span><h1>Get a better {product.name} deal.</h1><p>{product.summary} If you already use it, your verified spend can invite credible competitors to submit private replacement offers.</p><div className={s.actions}><Link className="button button-primary" href="/start">Challenge your deal →</Link><Link className="button button-secondary" href={`/alternatives/${slug}`}>See alternatives</Link></div></section><section className={s.section}><span className="eyebrow">Common alternatives</span><h2>Who could beat {product.name}?</h2><div className={s.grid}>{alternatives.map((item) => <article className={s.card} key={item.slug}><span className={s.number}>Alternative</span><h3>{item.name}</h3><p>{item.summary}</p><Link href={`/compare/${slug}-vs-${item.slug}`}>Compare →</Link></article>)}</div></section></div>;
}
