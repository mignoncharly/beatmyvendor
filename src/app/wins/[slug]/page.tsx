import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicWin, money } from "@/lib/public-marketplace";
import s from "../../public.module.css";

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 300;
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const win = await getPublicWin(slug); if (!win) return {}; const saving=win.current_annual_price-win.final_annual_price; return { title: `${money(saving,win.currency)} saved — ${win.current_software_name} beaten`, description: `${win.buyer_display_name} confirmed a lower software deal through BeatMyyVendor.`, alternates: { canonical: `/wins/${slug}` }, openGraph: { images: [`/wins/${slug}/opengraph-image`] } }; }

export default async function WinPage({ params }: Props) { const { slug } = await params; const win=await getPublicWin(slug); if (!win) notFound(); const saving=win.current_annual_price-win.final_annual_price; const percentage=Math.round(saving/win.current_annual_price*100); const schema={"@context":"https://schema.org","@type":"Article",headline:`${win.current_software_name} got beat`,datePublished:win.confirmed_at,author:{"@type":"Organization",name:"BeatMyyVendor"}}; return <div className={s.page}><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}}/><section className={`${s.hero} ${s.win}`}><span className="eyebrow">Verified deal ✓</span><h1>{win.current_software_name.toUpperCase()} GOT BEAT</h1><p>{money(win.current_annual_price,win.currency)}/year ↓ {money(win.final_annual_price,win.currency)}/year</p><strong>{money(saving,win.currency)} saved</strong><p>{percentage}% lower · {win.seats} seats · {win.country_code}<br/>{win.buyer_display_name}{win.vendor_display_name ? ` · Challenger: ${win.vendor_display_name}` : ""}</p></section><section className={s.section}><Link className="button button-primary" href="/start">Challenge your software deal →</Link></section></div>; }
