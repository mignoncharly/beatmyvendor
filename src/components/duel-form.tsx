"use client";

import { useActionState, useMemo, useState } from "react";
import { saveBuyerDuel } from "@/app/actions/duels";
import { DuelSubmitButtons } from "@/components/duel-submit-buttons";
import { FormRecovery } from "@/components/form-recovery";

export type DuelCatalogProduct = { id: string; category_id: string; name: string };
export type DuelCatalogCategory = { id: string; name: string };

export type DuelFormInitial = {
  id?: string;
  categoryId?: string;
  productId?: string;
  currentPlan?: string | null;
  currentPrice?: number;
  billingFrequency?: "monthly" | "annual";
  currency?: string;
  seats?: number;
  ticketVolume?: number | null;
  currentFees?: number;
  renewalDate?: string | null;
  contractMonths?: number | null;
  countryCode?: string;
  companySize?: string;
  switchingTimeline?: string | null;
  buyerIntent?: "checking_market" | "good_offer" | "actively_looking" | "must_switch_before_renewal";
  privateComment?: string | null;
  submissionDeadline?: string | null;
  featureRequirements?: string;
  integrationRequirements?: string;
};

function defaultDeadline() {
  const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function localDateTime(value?: string | null) {
  if (!value) return defaultDeadline();
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function DuelForm({ categories, products, initial = {} }: {
  categories: DuelCatalogCategory[];
  products: DuelCatalogProduct[];
  initial?: DuelFormInitial;
}) {
  const [state, action] = useActionState(saveBuyerDuel, {});
  const firstCategory = initial.categoryId ?? categories[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState(firstCategory);
  const visibleProducts = useMemo(() => products.filter((product) => product.category_id === categoryId), [categoryId, products]);
  const selectedProduct = visibleProducts.some((product) => product.id === initial.productId) ? initial.productId : visibleProducts[0]?.id;

  return (
    <form id="buyer-duel-form" action={action} className="duel-form" encType="multipart/form-data">
      {initial.id && <input type="hidden" name="duelId" value={initial.id} />}
      <FormRecovery formId="buyer-duel-form" storageKey={`buyer-duel-${initial.id ?? "new"}`} exclude="privateComment" />
      <fieldset>
        <legend><span>01</span> Current software</legend>
        <div className="field-grid">
          <label className="field"><span>Category</span><select name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>Current software</span><select key={`${categoryId}-${selectedProduct}`} name="productId" defaultValue={selectedProduct} required>{visibleProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label className="field"><span>Current plan</span><input name="currentPlan" defaultValue={initial.currentPlan ?? ""} maxLength={120} placeholder="Professional" /></label>
          <label className="field"><span>Seats</span><input name="seats" type="number" min="1" defaultValue={initial.seats ?? 10} required /></label>
          <label className="field"><span>Current price</span><input name="currentPrice" type="number" min="0.01" step="0.01" defaultValue={initial.currentPrice ?? ""} required /></label>
          <label className="field"><span>Billing</span><select name="billingFrequency" defaultValue={initial.billingFrequency ?? "annual"}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
          <label className="field"><span>Currency</span><input name="currency" defaultValue={initial.currency ?? "USD"} minLength={3} maxLength={3} required /></label>
          <label className="field"><span>Other annual fees</span><input name="currentFees" type="number" min="0" step="0.01" defaultValue={initial.currentFees ?? 0} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend><span>02</span> Business context</legend>
        <div className="field-grid">
          <label className="field"><span>Company size</span><select name="companySize" defaultValue={initial.companySize ?? "11-50"}><option>1-10</option><option>11-50</option><option>51-200</option><option>201-500</option><option>501-1000</option><option>1000+</option></select></label>
          <label className="field"><span>Country code</span><input name="countryCode" defaultValue={initial.countryCode ?? "US"} minLength={2} maxLength={2} required /></label>
          <label className="field"><span>Monthly support tickets</span><input name="ticketVolume" type="number" min="0" defaultValue={initial.ticketVolume ?? ""} /></label>
          <label className="field"><span>Renewal date</span><input name="renewalDate" type="date" defaultValue={initial.renewalDate ?? ""} /></label>
          <label className="field"><span>Contract length (months)</span><input name="contractMonths" type="number" min="1" defaultValue={initial.contractMonths ?? ""} /></label>
          <label className="field"><span>Switching timeline</span><input name="switchingTimeline" defaultValue={initial.switchingTimeline ?? ""} maxLength={120} placeholder="Within 3 months" /></label>
          <label className="field field-wide"><span>Buying intent</span><select name="buyerIntent" defaultValue={initial.buyerIntent ?? "good_offer"}><option value="checking_market">Checking the market</option><option value="good_offer">Open to a good offer</option><option value="actively_looking">Actively looking</option><option value="must_switch_before_renewal">Must switch before renewal</option></select></label>
        </div>
      </fieldset>

      <fieldset>
        <legend><span>03</span> Requirements & verification</legend>
        <div className="field-grid">
          <label className="field"><span>Required features — one per line</span><textarea name="featureRequirements" rows={6} defaultValue={initial.featureRequirements ?? ""} placeholder={"Knowledge base\nLive chat\nSLA reporting"} /><small>Do not include names, company details, email addresses, phone numbers, domains, URLs, or social profiles.</small></label>
          <label className="field"><span>Required integrations — one per line</span><textarea name="integrationRequirements" rows={6} defaultValue={initial.integrationRequirements ?? ""} placeholder={"Salesforce\nSlack\nSegment"} /><small>Vendor-visible before introduction. Keep every line anonymous.</small></label>
          <label className="field"><span>Offer deadline</span><input name="submissionDeadline" type="datetime-local" defaultValue={localDateTime(initial.submissionDeadline)} required /></label>
          <label className="field"><span>Spend proof (private, optional)</span><input name="spendDocument" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /><small>Invoice or contract, up to 10 MB. Visible only to your workspace and admins.</small></label>
          <label className="field field-wide"><span>Private context for BeatMyVendor</span><textarea name="privateComment" rows={4} maxLength={2000} defaultValue={initial.privateComment ?? ""} placeholder="What should our verification team know?" /></label>
        </div>
      </fieldset>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <DuelSubmitButtons editing={Boolean(initial.id)} />
    </form>
  );
}
