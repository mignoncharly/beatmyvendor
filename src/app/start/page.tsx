import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/auth";
import { safeRelativePath } from "@/lib/site";

export const dynamic = "force-dynamic";

// Entry point for "Start a Duel". Preserves the intended destination through the
// passwordless flow: authenticated visitors go straight there, others sign in
// first and are returned afterwards.
export default async function StartPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeRelativePath(next, "/buyer/duels/new");
  const identity = await getIdentity();
  if (identity) redirect(target);
  redirect(`/login?next=${encodeURIComponent(target)}`);
}
