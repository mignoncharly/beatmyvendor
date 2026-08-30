import type { Metadata } from "next";
import { requireIdentity } from "@/lib/auth";
import { OnboardingForm } from "@/components/onboarding-form";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Create your workspace" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const [identity, params] = await Promise.all([requireIdentity(), searchParams]);
  const initialKind = params.role === "vendor" ? "vendor" : "buyer";
  return (
    <section className="onboarding-shell">
      <div className="onboarding-heading"><div className="eyebrow">Account verified</div><h1>Build your side<br />of the table.</h1><p>Signed in as <strong>{identity.email}</strong></p><form action={signOut}><button className="text-button">Sign out</button></form></div>
      <div className="auth-card wide"><span className="card-kicker">WORKSPACE SETUP</span><h2>How will you use BeatMyyVendor?</h2><OnboardingForm initialKind={initialKind} /></div>
    </section>
  );
}
