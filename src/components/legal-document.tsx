import s from "@/app/legal.module.css";
import { legal } from "@/lib/legal";

export function LegalDocument({ eyebrow,title,intro,children }: { eyebrow:string; title:string; intro:string; children:React.ReactNode }) {
  return <article className={s.page}><header className={s.header}><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p><small>Version {legal.version}</small></header><div className={s.body}>{children}</div></article>;
}
export function LegalSection({ title,children }: { title:string; children:React.ReactNode }) { return <section className={s.section}><h2>{title}</h2>{children}</section>; }
