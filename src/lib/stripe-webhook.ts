import type Stripe from "stripe";

export const supportedCheckoutEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired"
] as const;

type SupportedCheckoutEvent = (typeof supportedCheckoutEvents)[number];

export type CheckoutEventDecision =
  | { kind: "ignore" }
  | { kind: "reject"; message: string }
  | {
      kind: "process";
      eventType: SupportedCheckoutEvent;
      session: Stripe.Checkout.Session;
      paymentId: string;
      paymentIntentId: string;
      shouldRetrieveReceipt: boolean;
    };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function decideCheckoutEvent(event: Stripe.Event): CheckoutEventDecision {
  if (!supportedCheckoutEvents.includes(event.type as SupportedCheckoutEvent)) return { kind: "ignore" };
  const eventType = event.type as SupportedCheckoutEvent;
  const session = event.data.object as Stripe.Checkout.Session;
  if (eventType === "checkout.session.completed" && session.payment_status !== "paid") return { kind: "ignore" };
  const paymentId = session.metadata?.payment_id;
  if (!paymentId || !uuidPattern.test(paymentId)) return { kind: "reject", message: "Missing or invalid payment metadata." };
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? "";
  return {
    kind: "process", eventType, session, paymentId, paymentIntentId,
    shouldRetrieveReceipt: Boolean(paymentIntentId) && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(eventType)
  };
}
