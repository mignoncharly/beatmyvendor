import Link from "next/link";

const sections = [
  ["Overview", "/admin/overview"], ["Vendors", "/admin"], ["Verifications", "/admin/verifications"],
  ["Duels", "/admin/duels"], ["Reports", "/admin/reports"], ["Users", "/admin/users"],
  ["Payments", "/admin/payments"], ["Privacy", "/admin/privacy"], ["Outcomes", "/admin/outcomes"], ["Audit", "/admin/audit"]
] as const;

export function AdminNav() {
  return <nav aria-label="Admin sections" style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:18,marginBottom:30,borderBottom:"1px solid var(--ink)"}}>{sections.map(([label,href])=><Link href={href} key={href} style={{padding:"9px 11px",border:"1px solid var(--line)",background:"var(--white)",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>{label}</Link>)}</nav>;
}
