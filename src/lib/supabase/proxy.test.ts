import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./proxy";

describe("isProtectedPath", () => {
  it.each(["/buyer", "/buyer/duels/new", "/vendor", "/vendor/billing", "/admin/users", "/onboarding", "/account/privacy", "/report"])(
    "protects application route %s",
    (path) => expect(isProtectedPath(path)).toBe(true)
  );

  it.each(["/", "/vendors", "/vendor-stories", "/buyers", "/administrator", "/onboarding-guide"])(
    "does not capture public sibling route %s",
    (path) => expect(isProtectedPath(path)).toBe(false)
  );
});
