"use client";

import { useFormStatus } from "react-dom";

export function DuelSubmitButtons({ editing = false }: { editing?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="form-actions">
      <button className="button button-secondary" type="submit" name="intent" value="draft" disabled={pending}>
        {pending ? "Saving…" : editing ? "Save changes" : "Save draft"}
      </button>
      <button className="button button-primary" type="submit" name="intent" value="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit for verification"}
      </button>
    </div>
  );
}
