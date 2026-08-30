import "server-only";
import Stripe from "stripe";
let client: Stripe | null = null;
export function getStripe() { const key = process.env.STRIPE_SECRET_KEY; if (!key) throw new Error("STRIPE_SECRET_KEY is not configured."); client ??= new Stripe(key, { appInfo: { name: "BeatMyVendor", version: "1.0.0" } }); return client; }
export function stripePriceId() { const id = process.env.STRIPE_VENDOR_INTRODUCTION_PRICE_ID; if (!id) throw new Error("STRIPE_VENDOR_INTRODUCTION_PRICE_ID is not configured."); return id; }
