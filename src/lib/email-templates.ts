import "server-only";
import { absoluteUrl } from "@/lib/site";

type Payload = Record<string, unknown>;
type EmailContext = {
  recipientName?: string | null;
  organizationName?: string | null;
  actionUrl?: string;
};
type Copy = {
  subject: string;
  eyebrow: string;
  headline: string;
  summary: string;
  detail: string;
  cta: string;
  path: string | ((payload: Payload) => string);
  tone?: "success" | "warning" | "neutral";
};

export const emailTemplateKeys = [
  "email_verification", "duel_submitted", "duel_approved", "new_challenge_received",
  "duel_ending_soon", "offers_ready", "selection_confirmed", "introduction_completed",
  "deal_confirmation", "vendor_approved", "matching_duel", "challenge_submitted",
  "challenge_selected", "challenge_not_selected", "payment_receipt", "duel_closed",
  "verification_required", "vendor_awaiting_approval", "flagged_duel", "payment_failed",
  "reported_vendor", "data_request_received"
] as const;

const duelPath = (fallback: string) => (payload: Payload) =>
  typeof payload.duel_id === "string" ? "/buyer/duels/" + payload.duel_id : fallback;

const templates: Record<string, Copy> = {
  email_verification: {
    subject: "Your secure BeatMyVendor sign-in link",
    eyebrow: "Secure access",
    headline: "One click. You’re in.",
    summary: "Use the secure link below to sign in and continue building your BeatMyVendor workspace.",
    detail: "For your security, this link is intended only for you and expires automatically. BeatMyVendor will never ask you to send a password, payment detail, or verification document by email.",
    cta: "Sign in securely",
    path: "/login",
    tone: "success"
  },
  duel_submitted: {
    subject: "Your Duel has entered verification",
    eyebrow: "Buyer update",
    headline: "Your brief is with our trust team.",
    summary: "We received your Duel and are reviewing the opportunity before it reaches qualified vendors.",
    detail: "We check the business context, submission quality, and any evidence you provided. Your private comments and verification files remain confidential throughout the review.",
    cta: "Review your Duel",
    path: duelPath("/buyer")
  },
  duel_approved: {
    subject: "Your Duel is live",
    eyebrow: "Marketplace live",
    headline: "Qualified challengers can now compete.",
    summary: "Your approved Duel is visible to vendors whose products match the opportunity.",
    detail: "Offers are submitted independently and remain sealed. We will notify you as relevant Challenges arrive and when the comparison is ready.",
    cta: "View the live Duel",
    path: duelPath("/buyer"),
    tone: "success"
  },
  new_challenge_received: {
    subject: "A new sealed Challenge has arrived",
    eyebrow: "New offer",
    headline: "Another contender has entered your Duel.",
    summary: "A qualified vendor submitted a structured offer against your requirements.",
    detail: "Commercial terms remain sealed until the review stage so every vendor competes independently. No action is required right now.",
    cta: "Open buyer workspace",
    path: "/buyer/offers"
  },
  duel_ending_soon: {
    subject: "Your Duel closes soon",
    eyebrow: "Deadline approaching",
    headline: "The final offer window is closing.",
    summary: "Qualified vendors have limited time remaining to submit their sealed Challenges.",
    detail: "Check your Duel timeline and requirements now. Submitted offers stay locked until the deadline passes.",
    cta: "Check the deadline",
    path: duelPath("/buyer"),
    tone: "warning"
  },
  offers_ready: {
    subject: "Your BeatMyVendor comparison is ready",
    eyebrow: "Decision time",
    headline: "See who improved the deal.",
    summary: "The offer window is closed and your submitted Challenges are ready for a side-by-side review.",
    detail: "Compare recurring price, one-time fees, contract terms, requirement coverage, support, and limitations before choosing who earns the conversation.",
    cta: "Compare offers",
    path: "/buyer/offers",
    tone: "success"
  },
  selection_confirmed: {
    subject: "Your vendor selection is confirmed",
    eyebrow: "Selection recorded",
    headline: "You chose who earned the introduction.",
    summary: "Your selection is locked and the chosen vendor has been invited to complete the fixed introduction payment.",
    detail: "Your identity remains private until Stripe confirms payment. We will notify both sides as soon as direct contact is available.",
    cta: "Track the introduction",
    path: "/buyer/introductions",
    tone: "success"
  },
  introduction_completed: {
    subject: "Your BeatMyVendor introduction is ready",
    eyebrow: "Introduction unlocked",
    headline: "The conversation can begin.",
    summary: "Stripe confirmed the introduction payment and the selected buyer and vendor can now contact one another directly.",
    detail: "Open the introduction to see the verified contact details and continue the commercial conversation outside the sealed marketplace.",
    cta: "Open the introduction",
    path: "/buyer/introductions",
    tone: "success"
  },
  deal_confirmation: {
    subject: "How did your BeatMyVendor introduction progress?",
    eyebrow: "Outcome follow-up",
    headline: "Help us close the loop.",
    summary: "Tell us whether the introduction led to a contract, another decision, or an ongoing conversation.",
    detail: "Your commercial outcome stays private. BeatMyVendor publishes a verified Win only after separate, explicit consent.",
    cta: "Confirm the outcome",
    path: "/buyer/introductions"
  },
  vendor_approved: {
    subject: "Your BeatMyVendor vendor workspace is approved",
    eyebrow: "Approval complete",
    headline: "You’re cleared to compete.",
    summary: "Your vendor workspace can now browse qualified opportunities and submit sealed replacement offers.",
    detail: "Keep product coverage and contact details current so we can match your team with the most relevant Duels.",
    cta: "Browse opportunities",
    path: "/vendor/opportunities",
    tone: "success"
  },
  matching_duel: {
    subject: "A new Duel matches your product",
    eyebrow: "Qualified opportunity",
    headline: "A buyer is challenging your competitor.",
    summary: "A verified, anonymized opportunity matches the replacement coverage registered in your vendor profile.",
    detail: "Review the requirements and commercial context. Submit only if your team can provide an accurate, competitive offer.",
    cta: "Review the opportunity",
    path: "/vendor/opportunities"
  },
  challenge_submitted: {
    subject: "Your Challenge has been submitted",
    eyebrow: "Offer locked",
    headline: "Your offer is officially in.",
    summary: "BeatMyVendor recorded and versioned your commercial terms for this Duel.",
    detail: "The buyer cannot review offers until the comparison stage, and no competing vendor can see your terms. Submitted offers cannot be edited.",
    cta: "Track your Challenge",
    path: "/vendor/challenges",
    tone: "success"
  },
  challenge_selected: {
    subject: "The buyer selected your Challenge",
    eyebrow: "Challenge selected",
    headline: "You earned the conversation.",
    summary: "The buyer chose your offer and is waiting for the secure introduction to be completed.",
    detail: "Complete the one-time introduction payment. Buyer contact details remain protected until Stripe confirms the transaction.",
    cta: "Complete introduction payment",
    path: "/vendor/billing",
    tone: "success"
  },
  challenge_not_selected: {
    subject: "The buyer selected another Challenge",
    eyebrow: "Duel complete",
    headline: "Not this one. On to the next.",
    summary: "The buyer selected another offer after reviewing the sealed comparison.",
    detail: "Your pricing and commercial terms remain confidential. New opportunities matching your replacement coverage will continue to appear in your workspace.",
    cta: "Find another Duel",
    path: "/vendor/opportunities"
  },
  payment_receipt: {
    subject: "Receipt for your BeatMyVendor introduction",
    eyebrow: "Payment confirmed",
    headline: "Your introduction payment is complete.",
    summary: "Stripe confirmed the one-time BeatMyVendor introduction payment.",
    detail: "Keep this message with your transaction records. Your billing workspace contains the current payment status and provider receipt when available.",
    cta: "View billing details",
    path: "/vendor/billing",
    tone: "success"
  },
  duel_closed: {
    subject: "A Duel you challenged has closed",
    eyebrow: "Offer window closed",
    headline: "The buyer is reviewing the comparison.",
    summary: "The Duel is closed and every submitted Challenge is now locked.",
    detail: "No action is required. We will notify you if the buyer selects your offer for an introduction.",
    cta: "Track your Challenges",
    path: "/vendor/challenges"
  },
  verification_required: {
    subject: "A Duel requires verification review",
    eyebrow: "Trust operations",
    headline: "A buyer submission needs a decision.",
    summary: "New private verification evidence is waiting in the administrator queue.",
    detail: "Review only the evidence required for the decision, record the verified fields, and avoid copying sensitive document content into operator notes.",
    cta: "Review verification",
    path: "/admin/verifications",
    tone: "warning"
  },
  vendor_awaiting_approval: {
    subject: "A vendor workspace is awaiting approval",
    eyebrow: "Trust operations",
    headline: "A new vendor wants to compete.",
    summary: "An organization completed its marketplace profile and is waiting for review.",
    detail: "Confirm the business identity, product coverage, website, and responsible contact before granting marketplace access.",
    cta: "Review vendor",
    path: "/admin",
    tone: "warning"
  },
  flagged_duel: {
    subject: "A Duel has been flagged for review",
    eyebrow: "Marketplace alert",
    headline: "An active Duel needs operator attention.",
    summary: "A report or automated trust signal requires a marketplace review.",
    detail: "Check the public copy, verification state, report context, and operator history before taking action.",
    cta: "Open the report queue",
    path: "/admin/reports",
    tone: "warning"
  },
  payment_failed: {
    subject: "Your BeatMyVendor payment was not completed",
    eyebrow: "Payment action required",
    headline: "The introduction is still locked.",
    summary: "Stripe did not confirm the introduction payment.",
    detail: "Return to billing to retry securely or choose another payment method. No buyer contact details have been released.",
    cta: "Retry payment",
    path: "/vendor/billing",
    tone: "warning"
  },
  reported_vendor: {
    subject: "A vendor has been reported",
    eyebrow: "Marketplace alert",
    headline: "A conduct report needs investigation.",
    summary: "A BeatMyVendor user submitted a report concerning a vendor organization.",
    detail: "Review the report, relevant marketplace activity, and prior operator actions before recording an outcome.",
    cta: "Open the report queue",
    path: "/admin/reports",
    tone: "warning"
  },
  data_request_received: {
    subject: "We received your BeatMyVendor privacy request",
    eyebrow: "Data rights",
    headline: "Your request is recorded.",
    summary: "Your privacy request has entered our reviewed workflow.",
    detail: "You can monitor its status in your account. Identity verification and legal, payment, fraud, or security retention requirements may affect completion.",
    cta: "View privacy controls",
    path: "/account/privacy",
    tone: "success"
  }
};

const fallback: Copy = {
  subject: "BeatMyVendor update",
  eyebrow: "Marketplace update",
  headline: "There’s an update in your workspace.",
  summary: "A BeatMyVendor activity related to your account is ready to review.",
  detail: "Sign in securely to see the latest status and any action that may be required.",
  cta: "Open BeatMyVendor",
  path: "/onboarding"
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]!));

function safeActionUrl(copy: Copy, payload: Payload, override?: string) {
  const configuredPath = typeof copy.path === "function" ? copy.path(payload) : copy.path;
  const candidate = override || absoluteUrl(configuredPath);
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : absoluteUrl(configuredPath);
  } catch {
    return absoluteUrl(configuredPath);
  }
}

function reference(payload: Payload) {
  const candidates = [
    ["Duel", payload.duel_id],
    ["Introduction", payload.introduction_id],
    ["Payment", payload.payment_id],
    ["Request", payload.request_id]
  ] as const;
  const match = candidates.find(([, value]) => typeof value === "string");
  return match ? match[0] + " " + String(match[1]).slice(0, 8).toUpperCase() : null;
}

export function renderBrandedEmail(templateKey: string, payload: Payload = {}, context: EmailContext = {}) {
  const copy = templates[templateKey] || fallback;
  const actionUrl = safeActionUrl(copy, payload, context.actionUrl);
  const recipientName = context.recipientName && context.recipientName.trim();
  const organizationName = context.organizationName && context.organizationName.trim();
  const greeting = recipientName ? "Hello " + recipientName + "," : "Hello,";
  const notificationReference = reference(payload);
  const accent = copy.tone === "warning" ? "#FFCF66" : copy.tone === "success" ? "#D9FF43" : "#E8E6DE";
  const preheader = copy.summary + " " + copy.cta + ".";
  const meta = [copy.eyebrow, organizationName || null, notificationReference].filter(Boolean).join("  ·  ");

  const html = [
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<meta name=\"x-apple-disable-message-reformatting\"><title>", escapeHtml(copy.subject), "</title>",
    "<style>@media(max-width:620px){.email-shell{width:100%!important}.email-pad{padding:30px 22px!important}.email-title{font-size:36px!important}.email-footer{padding:24px 10px!important}}a{color:inherit}</style></head>",
    "<body style=\"margin:0;padding:0;background:#F1EFE8;color:#171713;font-family:Inter,Arial,sans-serif;-webkit-font-smoothing:antialiased\">",
    "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent\">", escapeHtml(preheader), "</div>",
    "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"background:#F1EFE8\"><tr><td align=\"center\" style=\"padding:38px 14px\">",
    "<table role=\"presentation\" class=\"email-shell\" width=\"600\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:600px;max-width:600px\">",
    "<tr><td style=\"background:#171713;padding:24px 30px;border-radius:14px 14px 0 0\"><table role=\"presentation\" width=\"100%\"><tr>",
    "<td style=\"font-size:18px;font-weight:900;letter-spacing:-.02em;color:#FFFDF7\"><span style=\"display:inline-block;color:#171713;background:#D9FF43;padding:5px 8px;margin-right:9px;border-radius:5px\">V</span>BEATMYVENDOR</td>",
    "<td align=\"right\" style=\"font-size:11px;font-weight:800;letter-spacing:.12em;color:#B9B8B1;text-transform:uppercase\">TRANSACTIONAL</td>",
    "</tr></table></td></tr>",
    "<tr><td class=\"email-pad\" style=\"background:#FFFDF7;padding:46px 44px;border-left:1px solid #D8D5CB;border-right:1px solid #D8D5CB\">",
    "<div style=\"display:inline-block;background:", accent, ";padding:7px 10px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#171713\">", escapeHtml(meta), "</div>",
    "<p style=\"margin:30px 0 10px;font-size:15px;line-height:1.6;color:#5D5C55\">", escapeHtml(greeting), "</p>",
    "<h1 class=\"email-title\" style=\"margin:0 0 22px;font-size:46px;line-height:1.02;letter-spacing:-.045em;color:#171713\">", escapeHtml(copy.headline), "</h1>",
    "<p style=\"margin:0 0 16px;font-size:18px;line-height:1.65;color:#30312C\">", escapeHtml(copy.summary), "</p>",
    "<p style=\"margin:0;font-size:15px;line-height:1.75;color:#68675F\">", escapeHtml(copy.detail), "</p>",
    "<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin-top:30px\"><tr><td style=\"background:#171713;border-radius:7px\">",
    "<a href=\"", escapeHtml(actionUrl), "\" style=\"display:inline-block;padding:16px 22px;color:#FFFDF7;text-decoration:none;font-size:15px;font-weight:850;letter-spacing:-.01em\">", escapeHtml(copy.cta), " &nbsp;→</a>",
    "</td></tr></table>",
    "<p style=\"margin:28px 0 0;padding-top:22px;border-top:1px solid #E2DFD5;font-size:12px;line-height:1.65;color:#838178\">If the button does not work, copy and paste this link into your browser:<br><a href=\"", escapeHtml(actionUrl), "\" style=\"color:#33342F;word-break:break-all\">", escapeHtml(actionUrl), "</a></p>",
    "</td></tr>",
    "<tr><td class=\"email-footer\" style=\"padding:26px 28px;background:#E7E4DA;border:1px solid #D8D5CB;border-radius:0 0 14px 14px;font-size:11px;line-height:1.65;color:#6A6962\">",
    "<strong style=\"color:#2E2F2A\">BeatMyVendor</strong> · Software buying, reversed.<br>This operational message was sent because of activity in your BeatMyVendor account or workspace. Never send passwords, card details, or verification documents by email.",
    "</td></tr></table></td></tr></table></body></html>"
  ].join("");

  const text = [
    "BEATMYVENDOR", meta, "", greeting, "", copy.headline, "", copy.summary, "", copy.detail, "",
    copy.cta + ": " + actionUrl, "", "BeatMyVendor · Software buying, reversed.",
    "Never send passwords, card details, or verification documents by email."
  ].join("\n");

  return { subject: copy.subject, html, text, actionUrl, templateKey };
}
