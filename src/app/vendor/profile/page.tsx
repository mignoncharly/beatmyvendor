import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { VendorProfileForm } from "@/components/vendor-profile-form";

export const metadata: Metadata = { title: "Vendor company profile" }; export const dynamic = "force-dynamic";
export default async function VendorProfilePage() {
  const { organization } = await requireOrganization("vendor"); const supabase = await createClient();
  const [{ data: profile }, { data: company }, { data: products }] = await Promise.all([
    supabase.from("vendor_profiles").select("description,minimum_customer_size,maximum_customer_size,countries_served,currencies,migration_support,contact_name").eq("organization_id", organization.organizationId).single(),
    supabase.from("organizations").select("website_url,country_code,company_size").eq("id", organization.organizationId).single(),
    supabase.from("software_products").select("id,name,category_id").eq("is_active", true).order("name")
  ]);
  return <DashboardShell area="Vendor" organization={organization.name}><div className="page-back"><Link href="/vendor">← Vendor dashboard</Link></div><div className="dashboard-heading"><div><span className="eyebrow">Company profile</span><h1>Define where you can win.</h1><p className="heading-copy">Your replacement claims power opportunity matching. Add another catalog product by saving this form again with a different product.</p></div><span className={`badge ${organization.vendorApproval === "approved" ? "badge-success" : "badge-warning"}`}>{organization.vendorApproval}</span></div><VendorProfileForm products={products ?? []} initial={{ websiteUrl: company?.website_url, countryCode: company?.country_code, companySize: company?.company_size, description: profile?.description, minimumCustomerSize: profile?.minimum_customer_size, maximumCustomerSize: profile?.maximum_customer_size, countriesServed: profile?.countries_served, currencies: profile?.currencies, migrationSupport: profile?.migration_support, contactName: profile?.contact_name }} /></DashboardShell>;
}
