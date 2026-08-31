import crypto from "node:crypto";

// Builds and signs Stripe webhook events so the journey can drive the real
// /api/stripe/webhook endpoint deterministically (no external delivery). The
// signature scheme matches stripe-node's constructEvent: t=<ts>,v1=<hmac>.

export function stripeSignature(payload: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

export async function postStripeEvent(
  baseURL: string,
  event: unknown,
  secret: string,
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(event);
  const res = await fetch(`${baseURL}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": stripeSignature(payload, secret) },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

export function checkoutCompletedEvent(args: { paymentId: string; sessionId: string; paymentIntentId: string }) {
  return {
    id: `evt_journey_${Date.now()}_completed`,
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: args.sessionId,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: args.paymentIntentId,
        amount_total: 9900,
        currency: "eur",
        metadata: { payment_id: args.paymentId },
      },
    },
  };
}

export function chargeRefundedEvent(args: { paymentIntentId: string; refundId: string }) {
  return {
    id: `evt_journey_${Date.now()}_refunded`,
    object: "event",
    type: "charge.refunded",
    livemode: false,
    data: {
      object: {
        id: `ch_journey_${Date.now()}`,
        object: "charge",
        refunded: true,
        payment_intent: args.paymentIntentId,
        refunds: { object: "list", data: [{ id: args.refundId, object: "refund" }] },
      },
    },
  };
}
