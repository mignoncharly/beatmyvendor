import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { uploadVendorLogo } from "@/app/actions/vendor-marketplace";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { VendorProfileForm } from "@/components/vendor-profile-form";

export const metadata: Metadata = { title: "Vendor company profile" }; export const dynamic = "force-dynamic";

export default async function VendorProfilePage({ searchParams }: { searchParams: Promise<{ logo?: string; error?: string }> }) {
  const { organization } = await requireOrganization("vendor"); const supabase = await createClient(); const notice = await searchParams;
  const [{ data: profile }, { data: company }, { data: products }, { data: inventory }] = await Promise.all([
    supabase.from("vendor_profiles").select("description,minimum_customer_size,maximum_customer_size,countries_served,currencies,migration_support,contact_name,contact_email,logo_path").eq("organization_id", organization.organizationId).single(),
    supabase.from("organizations").select("website_url,country_code,company_size").eq("id", organization.organizationId).single(),
    supabase.from("software_products").select("id,name,category_id").eq("is_active", true).order("name"),
    supabase.from("vendor_products").select("id,product_name,is_active,vendor_product_replacements(replaces_software_product_id)").eq("vendor_organization_id", organization.organizationId).order("product_name")
  ]);
  const logoUrl = profile?.logo_path ? supabase.storage.from("vendor-logos").getPublicUrl(profile.logo_path).data.publicUrl : null;
  const productList = (inventory ?? []) as { id: string; product_name: string; is_active: boolean; vendor_product_replacements: { replaces_software_product_id: string }[] }[];

  return <DashboardShell area="Vendor" organization={organization.name}><div className="page-back"><Link href="/vendor">← Vendor dashboard</Link></div><div className="dashboard-heading"><div><span className="eyebrow">Company profile</span><h1>Define where you can win.</h1><p className="heading-copy">Your replacement claims power opportunity matching. Add another catalog product by saving this form again with a different product.</p></div><span className={`badge ${organization.vendorApproval === "approved" ? "badge-success" : "badge-warning"}`}>{organization.vendorApproval}</span></div>
    {notice.logo === "updated" && <p className="notice-success" role="status">Company logo updated.</p>}
    {notice.error?.startsWith("logo") && <p className="form-error" role="alert">The logo must be a PNG, JPG, or WebP image under 2 MB.</p>}
    <section className="profile-identity">
      {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, no image optimization needed */}
      <div className="logo-preview">{logoUrl ? <img src={logoUrl} alt={`${organization.name} logo`} width={96} height={96} /> : <span className="logo-placeholder">No logo</span>}</div>
      <form action={uploadVendorLogo} className="logo-upload"><span>Company logo</span><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required /><button className="button button-secondary">Upload logo</button></form>
    </section>
    {productList.length > 0 && <section className="product-inventory"><h2>Your product inventory</h2><ul>{productList.map((product) => <li key={product.id}><strong>{product.product_name}</strong><span>{product.vendor_product_replacements.length} replacement{product.vendor_product_replacements.length === 1 ? "" : "s"}</span>{!product.is_active && <em>inactive</em>}</li>)}</ul></section>}
    <VendorProfileForm products={products ?? []} initial={{ websiteUrl: company?.website_url, countryCode: company?.country_code, companySize: company?.company_size, description: profile?.description, minimumCustomerSize: profile?.minimum_customer_size, maximumCustomerSize: profile?.maximum_customer_size, countriesServed: profile?.countries_served, currencies: profile?.currencies, migrationSupport: profile?.migration_support, contactName: profile?.contact_name, contactEmail: profile?.contact_email }} />
  </DashboardShell>;
}
