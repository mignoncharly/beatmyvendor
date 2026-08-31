import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/observability";
import { getStripe } from "@/lib/stripe";
import { decideCheckoutEvent, decideRefundEvent } from "@/lib/stripe-webhook";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature"); const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  const body = await request.text(); let event: Stripe.Event;
  try { event = getStripe().webhooks.constructEvent(body, signature, secret); } catch { return NextResponse.json({ error: "Invalid signature." }, { status: 400 }); }
  const decision = decideCheckoutEvent(event);
  if (decision.kind === "ignore") {
    const refund = decideRefundEvent(event);
    if (refund.kind === "reject") return NextResponse.json({ error: refund.message }, { status: 400 });
    if (refund.kind === "refund") {
      const { error } = await createAdminClient().rpc("process_stripe_refund_event", { p_event_id: event.id, p_event_type: refund.eventType, p_livemode: event.livemode, p_payment_intent_id: refund.paymentIntentId, p_refund_id: refund.refundId });
      if (error) { const ref = reportError("stripe.webhook.refund", error, { event_id: event.id, event_type: refund.eventType }); return NextResponse.json({ error: "Event processing failed.", reference: ref }, { status: 500 }); }
    }
    return NextResponse.json({ received: true });
  }
  if (decision.kind === "reject") return NextResponse.json({ error: decision.message }, { status: 400 });
  const { session, paymentId, paymentIntentId } = decision; let receiptUrl: string | null = null;
  if (decision.shouldRetrieveReceipt) { const intent = await getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] }); const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null; receiptUrl = charge?.receipt_url ?? null; }
  const { error } = await createAdminClient().rpc("process_stripe_checkout_event", { p_event_id: event.id, p_event_type: decision.eventType, p_livemode: event.livemode, p_payment_id: paymentId, p_checkout_session_id: session.id, p_payment_intent_id: paymentIntentId, p_amount: session.amount_total ?? 0, p_currency: session.currency ?? "", p_receipt_url: receiptUrl });
  if (error) { const ref = reportError("stripe.webhook.checkout", error, { event_id: event.id, event_type: decision.eventType, payment_id: paymentId }); return NextResponse.json({ error: "Event processing failed.", reference: ref }, { status: 500 }); }
  return NextResponse.json({ received: true });
}
