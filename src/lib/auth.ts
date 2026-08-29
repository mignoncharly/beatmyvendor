import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrganizationAccess = {
  organizationId: string;
  kind: "buyer" | "vendor";
  name: string;
  slug: string;
  membershipRole: "owner" | "admin" | "member";
  vendorApproval?: "pending" | "approved" | "rejected" | "suspended";
  businessEmailStatus?: "unverified" | "pending" | "verified" | "rejected";
};

export const getIdentity = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const [{ data: user }, { data: memberships }] = await Promise.all([
    supabase.from("users").select("id,email,display_name,system_role,locale,suspended_at").eq("id", userId).single(),
    supabase
      .from("organization_members")
      .select("role, organizations!inner(id,kind,name,slug,vendor_profiles(approval_status),buyer_profiles(business_email_status))")
      .eq("user_id", userId)
  ]);

  if (user?.suspended_at) redirect("/unauthorized?reason=suspended");

  const organizations = (memberships ?? []).map((membership) => {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;
    const vendorProfile = Array.isArray(organization.vendor_profiles)
      ? organization.vendor_profiles[0]
      : organization.vendor_profiles;
    const buyerProfile = Array.isArray(organization.buyer_profiles)
      ? organization.buyer_profiles[0]
      : organization.buyer_profiles;
    return {
      organizationId: organization.id,
      kind: organization.kind,
      name: organization.name,
      slug: organization.slug,
      membershipRole: membership.role,
      vendorApproval: vendorProfile?.approval_status,
      businessEmailStatus: buyerProfile?.business_email_status
    } as OrganizationAccess;
  });

  return {
    id: userId,
    email: String(user?.email ?? claimsData.claims.email ?? ""),
    displayName: user?.display_name as string | null | undefined,
    systemRole: (user?.system_role ?? "user") as "user" | "admin",
    organizations
  };
});

export async function requireIdentity() {
  const identity = await getIdentity();
  if (!identity) redirect("/login");
  return identity;
}

export async function requireOrganization(kind: "buyer" | "vendor") {
  const identity = await requireIdentity();
  const organization = identity.organizations.find((entry) => entry.kind === kind);
  if (!organization) redirect(`/onboarding?role=${kind}`);
  return { identity, organization };
}

export async function requireAdmin() {
  const identity = await requireIdentity();
  if (identity.systemRole !== "admin") redirect("/unauthorized");
  return identity;
}
