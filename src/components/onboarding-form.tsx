"use client";

import { useActionState, useMemo, useState } from "react";
import { onboardOrganization } from "@/app/actions/onboarding";
import { SubmitButton } from "@/components/submit-button";

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function OnboardingForm({ initialKind }: { initialKind: "buyer" | "vendor" }) {
  const [kind, setKind] = useState(initialKind);
  const [name, setName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const slug = useMemo(() => customSlug || toSlug(name), [customSlug, name]);
  const [state, action] = useActionState(onboardOrganization, {});

  return (
    <form action={action} className="form-stack onboarding-form">
      <input type="hidden" name="kind" value={kind} />
      <div className="role-switch" role="group" aria-label="Choose workspace type">
        <button type="button" aria-pressed={kind === "buyer"} className={kind === "buyer" ? "active" : ""} onClick={() => setKind("buyer")}>
          <strong>I buy software</strong><span>Start duels and compare offers</span>
        </button>
        <button type="button" aria-pressed={kind === "vendor"} className={kind === "vendor" ? "active" : ""} onClick={() => setKind("vendor")}>
          <strong>I sell software</strong><span>Challenge competitors and win buyers</span>
        </button>
      </div>
      <label className="field">
        <span>Your name</span>
        <input name="contactName" autoComplete="name" required maxLength={120} />
      </label>
      <label className="field">
        <span>Company name</span>
        <input name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="organization" required maxLength={160} />
      </label>
      <label className="field">
        <span>Workspace URL</span>
        <div className="slug-input"><span>beatmyvendor.com/</span><input name="slug" value={slug} onChange={(event) => setCustomSlug(toSlug(event.target.value))} required /></div>
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <SubmitButton pendingText="Creating workspace…">Create {kind} workspace</SubmitButton>
    </form>
  );
}
