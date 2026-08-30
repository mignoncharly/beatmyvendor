// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormRecovery } from "./form-recovery";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function RecoveryForm() {
  return (
    <form id="recovery-test">
      <label>
        Company
        <input name="company" />
      </label>
      <label>
        Private note
        <textarea name="privateNote" />
      </label>
      <FormRecovery formId="recovery-test" storageKey="phase10" exclude="privateNote" />
    </form>
  );
}

describe("FormRecovery", () => {
  it("restores safe fields, excludes private fields, and lets the user clear the draft", async () => {
    const first = render(<RecoveryForm />);
    fireEvent.input(screen.getByRole("textbox", { name: "Company" }), { target: { value: "Acme" } });
    fireEvent.input(screen.getByRole("textbox", { name: "Private note" }), { target: { value: "Secret" } });

    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));

    const stored = sessionStorage.getItem("beatmyvendor:form:phase10");
    expect(stored).toContain("Acme");
    expect(stored).not.toContain("Secret");

    first.unmount();
    render(<RecoveryForm />);

    expect(await screen.findByRole("textbox", { name: "Company" })).toHaveProperty("value", "Acme");
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveProperty("value", "");
    fireEvent.click(await screen.findByRole("button", { name: "Clear recovered form" }));
    expect(sessionStorage.getItem("beatmyvendor:form:phase10")).toBeNull();
  });
});
