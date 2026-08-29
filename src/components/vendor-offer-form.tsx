"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveVendorOffer } from "@/app/actions/vendor-marketplace";
import { FormRecovery } from "@/components/form-recovery";

type Requirement = { id: string; kind: string; label: string };
type Product = { id: string; product_name: string };
type Initial = Record<string, unknown> & { id?: string; offer_features?: { duel_requirement_id: string; coverage: string; note: string | null }[] };

function Buttons() { const { pending } = useFormStatus(); return <div className="form-actions"><button className="button button-secondary" type="submit" name="intent" value="draft" disabled={pending}>{pending ? "Saving…" : "Save draft"}</button><button className="button button-primary" type="submit" name="intent" value="submit" disabled={pending}>{pending ? "Submitting…" : "Submit Challenge"}</button></div>; }
function dateTime(value?: unknown) { const date = value ? new Date(String(value)) : new Date(Date.now() + 30 * 86400000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); }

export function VendorOfferForm({ duelId, currency, currentSpend, seats, requirements, products, initial = {} }: { duelId: string; currency: string; currentSpend: number; seats: number; requirements: Requirement[]; products: Product[]; initial?: Initial }) {
  const [state, action] = useActionState(saveVendorOffer, {}); const feature = (id: string) => initial.offer_features?.find((item) => item.duel_requirement_id === id);
  return <form id="vendor-offer-form" action={action} className="duel-form">
    <FormRecovery formId="vendor-offer-form" storageKey={`vendor-offer-${duelId}`} />
    <input type="hidden" name="duelId" value={duelId} /><input type="hidden" name="currency" value={currency} />{initial.id && <input type="hidden" name="offerId" value={initial.id} />}
    <div className="saving-banner"><span>Current annual spend</span><strong>{new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(currentSpend)}</strong><span>Build your independent best offer—competitor prices stay hidden.</span></div>
    <fieldset><legend><span>01</span> Commercial offer</legend><div className="field-grid">
      <label className="field"><span>Product</span><select name="vendorProductId" defaultValue={String(initial.vendor_product_id ?? products[0]?.id)}>{products.map((product) => <option value={product.id} key={product.id}>{product.product_name}</option>)}</select></label>
      <label className="field"><span>Plan</span><input name="planName" defaultValue={String(initial.plan_name ?? "")} required /></label>
      <label className="field"><span>Annual price ({currency})</span><input name="annualPrice" type="number" min="0.01" step="0.01" defaultValue={String(initial.annual_price ?? "")} required /></label>
      <label className="field"><span>Seats included</span><input name="seatsIncluded" type="number" min="1" defaultValue={String(initial.seats_included ?? seats)} required /></label>
      <label className="field"><span>Implementation fee</span><input name="implementationFee" type="number" min="0" step="0.01" defaultValue={String(initial.implementation_fee ?? 0)} /></label>
      <label className="field"><span>Migration fee</span><input name="migrationFee" type="number" min="0" step="0.01" defaultValue={String(initial.migration_fee ?? 0)} /></label>
      <label className="field"><span>Contract months</span><input name="contractMonths" type="number" min="1" defaultValue={String(initial.contract_months ?? 12)} required /></label>
      <label className="field"><span>Price lock months</span><input name="priceLockMonths" type="number" min="0" defaultValue={String(initial.price_lock_months ?? 12)} required /></label>
      <label className="field"><span>Offer valid until</span><input name="validUntil" type="datetime-local" defaultValue={dateTime(initial.valid_until)} required /></label>
      <label className="field"><span>Support included</span><input name="supportIncluded" defaultValue={String(initial.support_included ?? "Standard support")} required /></label>
      <label className="check-field"><input name="migrationIncluded" type="checkbox" defaultChecked={Boolean(initial.migration_included)} /><span>Migration included</span></label>
      <label className="check-field"><input name="onboardingIncluded" type="checkbox" defaultChecked={Boolean(initial.onboarding_included)} /><span>Onboarding included</span></label>
    </div></fieldset>
    <fieldset><legend><span>02</span> Requirement coverage</legend><div className="coverage-list">{requirements.map((requirement) => <div className="coverage-row" key={requirement.id}><div><span>{requirement.kind}</span><strong>{requirement.label}</strong></div><label className="sr-only" htmlFor={`coverage-${requirement.id}`}>Coverage for {requirement.label}</label><select id={`coverage-${requirement.id}`} name={`coverage_${requirement.id}`} defaultValue={feature(requirement.id)?.coverage ?? "included"}><option value="included">Included</option><option value="partial">Partially covered</option><option value="not_included">Not included</option></select><label className="sr-only" htmlFor={`note-${requirement.id}`}>Optional note for {requirement.label}</label><input id={`note-${requirement.id}`} name={`note_${requirement.id}`} defaultValue={feature(requirement.id)?.note ?? ""} placeholder="Optional note" /></div>)}</div></fieldset>
    <fieldset><legend><span>03</span> Final context</legend><div className="field-grid"><label className="field"><span>Limitations</span><textarea name="limitations" rows={4} defaultValue={String(initial.limitations ?? "")} /></label><label className="field"><span>Commercial comment</span><textarea name="commercialComment" rows={4} maxLength={1000} defaultValue={String(initial.commercial_comment ?? "")} /></label><label className="check-field field-wide confirmation"><input name="accuracyConfirmed" type="checkbox" /><span>I confirm this offer accurately reflects the information provided in this Duel.</span></label></div></fieldset>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}<Buttons />
  </form>;
}
