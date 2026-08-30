import Link from "next/link";

export function Breadcrumbs({ items, className }: { items: Array<{ name: string; path?: string }>; className?: string }) {
  return <nav className={className} aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={`${item.name}-${index}`}>{item.path ? <Link href={item.path}>{item.name}</Link> : <span aria-current="page">{item.name}</span>}</li>)}</ol></nav>;
}
