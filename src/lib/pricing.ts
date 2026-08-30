export type BillingFrequency = "monthly" | "annual";

// Canonical annual-spend baseline shared by the buyer form, comparison, and
// public metrics. Mirrors the duels.annual_spend generated column: the recurring
// price is annualised and recurring extra fees are added. One-time offer fees
// (implementation, migration) are always presented separately.
export function annualSpend(currentPrice: number, billingFrequency: BillingFrequency, currentFees = 0) {
  const recurring = billingFrequency === "monthly" ? currentPrice * 12 : currentPrice;
  return recurring + (Number.isFinite(currentFees) ? currentFees : 0);
}

export function annualSaving(annualSpendValue: number, offerAnnualPrice: number) {
  return annualSpendValue - offerAnnualPrice;
}
