import Link from "next/link";
import { signOut } from "@/app/actions/auth";

export function DashboardShell({ area, organization, children }: { area: "Buyer" | "Vendor" | "Admin"; organization: string; children: React.ReactNode }) {
  return (
    <div className="dashboard">
      <aside className="sidebar"><div><span className="workspace-label">{area} workspace</span><h2>{organization}</h2></div><nav><Link href={`/${area.toLowerCase()}`}>Overview</Link>{area === "Buyer" && <><Link href="/buyer/duels/new">Start a Duel</Link><Link href="/buyer/offers">Offers</Link></>}{area === "Vendor" && <><Link href="/vendor/opportunities">Opportunities</Link><Link href="/vendor/challenges">My Challenges</Link><Link href="/vendor/profile">Company Profile</Link></>}<Link href="/onboarding">Add workspace</Link></nav><form action={signOut}><button className="text-button">Sign out</button></form></aside>
      <section className="dashboard-content">{children}</section>
    </div>
  );
}
