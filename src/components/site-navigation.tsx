"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [["How it works", "/how-it-works"], ["Live Duels", "/duels"], ["For vendors", "/vendors"]] as const;
const mobileLinks = [...links, ["Verified Wins", "/wins"], ["Pricing", "/pricing"]] as const;

function current(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "page" as const : undefined;
}

export function SiteNavigation() {
  const pathname = usePathname();
  const details = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => { if (details.current) details.current.open = false; setOpen(false); };

  return <>
    <nav className="desktop-nav" aria-label="Main navigation">
      {links.map(([label, href]) => <Link href={href} key={href} aria-current={current(pathname, href)}>{label}</Link>)}
      <Link href="/login" className="nav-cta" aria-current={current(pathname, "/login")}>Sign in</Link>
    </nav>
    <details ref={details} className="mobile-nav" onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => { if (event.key === "Escape") { close(); details.current?.querySelector("summary")?.focus(); } }}>
      <summary aria-label={open ? "Close navigation" : "Open navigation"} aria-controls="mobile-navigation" aria-expanded={open}>
        <span>{open ? "Close" : "Menu"}</span><i aria-hidden="true" />
      </summary>
      <nav id="mobile-navigation" aria-label="Mobile navigation">
        {mobileLinks.map(([label, href]) => <Link href={href} key={href} aria-current={current(pathname, href)} onClick={close}>{label}</Link>)}
        <Link href="/login" className="nav-cta" aria-current={current(pathname, "/login")} onClick={close}>Sign in</Link>
      </nav>
    </details>
  </>;
}
