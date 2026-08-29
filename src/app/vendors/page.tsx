import type { Metadata } from "next";
import Link from "next/link";
import s from "../public.module.css";

export const metadata: Metadata = { title: "For software vendors", description: "Compete for verified software buyers with real spend and switching intent.", alternates: { canonical: "/vendors" } };

export default function VendorsPage() {
  return <div className={s.page}><section className={`${s.hero} ${s.acid}`}><span className="eyebrow">For software vendors</span><h1>Pipeline where the buyer is already qualified.</h1><p>Browse anonymized opportunities from verified businesses paying for products you replace. Submit offers free; pay only when a buyer selects you.</p><div className={s.actions}><Link className="button button-primary" href="/login?role=vendor">Register as a vendor →</Link><Link className="button button-secondary" href="/duels">Browse Duels</Link></div></section><section className={s.section}><div className={s.grid}><article className={s.card}><span className={s.number}>Qualified</span><h3>Real spend</h3><p>Business identity and spend can be verified before an opportunity opens.</p></article><article className={s.card}><span className={s.number}>Fair</span><h3>Sealed offers</h3><p>Competitors never see your offer. Win on fit and commercial value, not last-second undercutting.</p></article><article className={`${s.card} ${s.dark}`}><span className={s.number}>€99.99</span><h3>Pay on selection</h3><p>Registration and offer submission are free. The selected vendor pays once for the introduction.</p></article></div></section></div>;
}
