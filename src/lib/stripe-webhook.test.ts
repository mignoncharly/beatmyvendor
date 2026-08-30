import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { decideCheckoutEvent, decideRefundEvent } from "./stripe-webhook";

const paymentId = "550e8400-e29b-41d4-a716-446655440000";
function checkoutEvent(type: string, session: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
  return { id: "evt_test", type, livemode: false, data: { object: { id: "cs_test", object: "checkout.session", metadata: { payment_id: paymentId }, payment_status: "paid", payment_intent: "pi_test", amount_total: 9900, currency: "eur", ...session } } } as Stripe.Event;
}
function chargeEvent(type: string, charge: Partial<Stripe.Charge> = {}): Stripe.Event {
  return { id: "evt_refund", type, livemode: false, data: { object: { id: "ch_test", object: "charge", payment_intent: "pi_test", refunded: true, refunds: { data: [{ id: "re_test" }] }, ...charge } } } as unknown as Stripe.Event;
}
describe("decideCheckoutEvent", () => {
  it("ignores unrelated Stripe events", () => { expect(decideCheckoutEvent(checkoutEvent("customer.created"))).toEqual({ kind: "ignore" }); });
  it("ignores completed sessions until Stripe marks them paid", () => { expect(decideCheckoutEvent(checkoutEvent("checkout.session.completed", { payment_status: "unpaid" }))).toEqual({ kind: "ignore" }); });
  it.each([undefined, "not-a-uuid"])("rejects invalid internal payment metadata (%s)", (invalidId) => {
    const event = checkoutEvent("checkout.session.completed", { metadata: invalidId ? { payment_id: invalidId } : {} });
    expect(decideCheckoutEvent(event)).toEqual({ kind: "reject", message: "Missing or invalid payment metadata." });
  });
  it("normalizes a paid checkout into the database command", () => { expect(decideCheckoutEvent(checkoutEvent("checkout.session.completed"))).toMatchObject({ kind: "process", eventType: "checkout.session.completed", paymentId, paymentIntentId: "pi_test", shouldRetrieveReceipt: true }); });
  it("does not retrieve receipts for failed or expired sessions", () => {
    for (const type of ["checkout.session.async_payment_failed", "checkout.session.expired"]) expect(decideCheckoutEvent(checkoutEvent(type))).toMatchObject({ kind: "process", shouldRetrieveReceipt: false });
  });
});

describe("decideRefundEvent", () => {
  it("ignores non-refund events", () => { expect(decideRefundEvent(checkoutEvent("checkout.session.completed"))).toEqual({ kind: "ignore" }); });
  it("ignores a charge that has not been refunded", () => { expect(decideRefundEvent(chargeEvent("charge.refunded", { refunded: false }))).toEqual({ kind: "ignore" }); });
  it("rejects a refund event missing its payment intent", () => {
    expect(decideRefundEvent(chargeEvent("charge.refunded", { payment_intent: null }))).toEqual({ kind: "reject", message: "Refund event is missing a payment intent." });
  });
  it("normalizes a full refund into the reconciliation command", () => {
    expect(decideRefundEvent(chargeEvent("charge.refunded"))).toEqual({ kind: "refund", eventType: "charge.refunded", paymentIntentId: "pi_test", refundId: "re_test" });
  });
});
