import Stripe from "stripe";
import { test, expect, login, adminClient } from "../fixtures/auth";
import { emails, ids, buyerContactEmail } from "./constants";
import { checkoutCompletedEvent, chargeRefundedEvent, postStripeEvent } from "./stripe-events";

// End-to-end authenticated journey against staging Supabase + Stripe test mode:
// buyer sees their selected duel; the vendor cannot see the buyer identity before
// paying; a signed checkout webhook reveals it; a signed refund webhook revokes it.
// Seeded to a selection by global-setup; the pay step drives the real billing
// action (prepare_introduction_payment + a real Stripe test Checkout Session).

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_TEST_WEBHOOK_SECRET ?? "";

async function introStatus(): Promise<string | undefined> {
  const { data } = await adminClient()
    .from("introductions")
    .select("status")
    .eq("selection_id", ids.selection)
    .single();
  return data?.status;
}

test("vendor identity stays hidden until paid, then reveals and revokes on refund", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://127.0.0.1:3100";
  const admin = adminClient();
  test.setTimeout(120_000);

  // 1. Buyer sees their own duel/selection through the real dashboard.
  await login(page, emails.buyer, { next: "/buyer" });
  await expect(page.locator("body")).toContainText(/duel|offer|introduction|selected/i);

  // 2. Vendor: before payment the buyer identity is locked (anonymity boundary).
  await login(page, emails.vendor, { next: "/vendor/introductions" });
  await expect(page.locator("body")).toContainText(/Buyer identity locked/i);
  await expect(page.locator("body")).not.toContainText(buyerContactEmail);
  expect(await introStatus()).toBe("awaiting_payment");

  // 3. Vendor initiates the real checkout (creates a real Stripe test session).
  await page.route("**/checkout.stripe.com/**", (route) => route.abort());
  await page.goto("/vendor/billing");
  await page.getByRole("button", { name: /Pay €99|Resume secure checkout/i }).click().catch(() => {});
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("payments")
        .select("provider_checkout_session_id")
        .eq("selection_id", ids.selection)
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0]?.provider_checkout_session_id ?? null;
    }, { timeout: 20_000 })
    .not.toBeNull();

  const { data: paymentRows } = await admin
    .from("payments")
    .select("id,provider_checkout_session_id")
    .eq("selection_id", ids.selection)
    .order("created_at", { ascending: false })
    .limit(1);
  const payment = paymentRows![0];

  // A real test PaymentIntent so the webhook's receipt lookup succeeds.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_TEST_SECRET_KEY!);
  const intent = await stripe.paymentIntents.create({ amount: 9900, currency: "eur", payment_method_types: ["card"] });

  // 4. Signed checkout.session.completed → payment paid + identity revealed.
  const completed = await postStripeEvent(
    base,
    checkoutCompletedEvent({ paymentId: payment.id, sessionId: payment.provider_checkout_session_id!, paymentIntentId: intent.id }),
    webhookSecret,
  );
  expect(completed.status, completed.body).toBe(200);
  expect(await introStatus()).toBe("introduced");

  await page.goto("/vendor/introductions");
  await expect(page.locator("body")).toContainText(buyerContactEmail);

  // 5. Signed charge.refunded → introduction refunded + identity revoked.
  const refunded = await postStripeEvent(
    base,
    chargeRefundedEvent({ paymentIntentId: intent.id, refundId: `re_journey_${Date.now()}` }),
    webhookSecret,
  );
  expect(refunded.status, refunded.body).toBe(200);
  expect(await introStatus()).toBe("refunded");

  await page.goto("/vendor/introductions");
  await expect(page.locator("body")).toContainText(/Buyer identity locked/i);
  await expect(page.locator("body")).not.toContainText(buyerContactEmail);
});
