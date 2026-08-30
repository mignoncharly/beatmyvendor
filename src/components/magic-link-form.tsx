"use client";

import { useActionState } from "react";
import { requestMagicLink } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { TurnstileWidget } from "@/components/turnstile-widget";

export function MagicLinkForm({ next }: { next?: string }) {
  const [state, action] = useActionState(requestMagicLink, {});
  return (
    <form action={action} className="form-stack">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="field">
        <span>Work email</span>
        <input name="email" type="email" autoComplete="email" placeholder="you@company.com" required autoFocus />
      </label>
      <TurnstileWidget />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <SubmitButton pendingText="Sending secure link…">Continue with email</SubmitButton>
      <p className="fine-print">No password. We’ll email you a secure, single-use sign-in link.</p>
    </form>
  );
}
