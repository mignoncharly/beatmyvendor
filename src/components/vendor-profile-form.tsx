"use client";
import { useActionState, useState } from "react";
import { saveVendorProfile } from "@/app/actions/vendor-marketplace";
import { SubmitButton } from "@/components/submit-button";

type Product = { id: string; name: string; category_id: string };
type Initial = { websiteUrl?: string | null; countryCode?: string | null; companySize?: string | null; description?: string | null; minimumCustomerSize?: number | null; maximumCustomerSize?: number | null; countriesServed?: string[]; currencies?: string[]; migrationSupport?: boolean; contactName?: string | null };

export function VendorProfileForm({ products, initial }: { products: Product[]; initial: Initial }) {
  const [state, action] = useActionState(saveVendorProfile, {}); const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((item) => item.id === productId); const replacements = products.filter((item) => item.category_id === product?.category_id && item.id !== productId);
  return <form action={action} className="duel-form">
    <fieldset><legend><span>01</span> Company profile</legend><div className="field-grid">
      <label className="field field-wide"><span>Description</span><textarea name="description" rows={5} defaultValue={initial.description ?? ""} required /></label>
      <label className="field"><span>Website</span><input name="websiteUrl" type="url" defaultValue={initial.websiteUrl ?? ""} required /></label>
      <label className="field"><span>Contact name</span><input name="contactName" defaultValue={initial.contactName ?? ""} required /></label>
      <label className="field"><span>HQ country</span><input name="countryCode" defaultValue={initial.countryCode ?? "US"} minLength={2} maxLength={2} required /></label>
      <label className="field"><span>Company size</span><select name="companySize" defaultValue={initial.companySize ?? "11-50"}><option>1-10</option><option>11-50</option><option>51-200</option><option>201-500</option><option>501-1000</option><option>1000+</option></select></label>
      <label className="field"><span>Minimum customer seats</span><input name="minimumCustomerSize" type="number" min="1" defaultValue={initial.minimumCustomerSize ?? ""} /></label>
      <label className="field"><span>Maximum customer seats</span><input name="maximumCustomerSize" type="number" min="1" defaultValue={initial.maximumCustomerSize ?? ""} /></label>
      <label className="field"><span>Countries served</span><input name="countriesServed" defaultValue={initial.countriesServed?.join(", ") ?? ""} placeholder="US, GB, DE" /></label>
      <label className="field"><span>Currencies</span><input name="currencies" defaultValue={initial.currencies?.join(", ") ?? ""} placeholder="USD, EUR, GBP" /></label>
      <label className="check-field field-wide"><input name="migrationSupport" type="checkbox" defaultChecked={initial.migrationSupport} /><span>We provide migration support</span></label>
    </div></fieldset>
    <fieldset><legend><span>02</span> Product & matching</legend><div className="field-grid">
      <label className="field"><span>Catalog product</span><select name="softwareProductId" value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Product display name</span><input key={product?.name} name="productName" defaultValue={product?.name} required /></label>
      <label className="field field-wide"><span>Product URL</span><input name="productUrl" type="url" required /></label>
      <div className="field field-wide"><span>Products you can replace</span><div className="checkbox-grid">{replacements.map((item) => <label className="check-field" key={item.id}><input type="checkbox" name="replacementIds" value={item.id} /><span>{item.name}</span></label>)}</div></div>
    </div></fieldset>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}{state.message && <p className="notice-success" role="status">{state.message}</p>}<SubmitButton pendingText="Saving profile…">Save marketplace profile</SubmitButton>
  </form>;
}
