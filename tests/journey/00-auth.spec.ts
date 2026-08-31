import { test, expect, login } from "../fixtures/auth";

// De-risks the whole authenticated harness: a service-role magic link, driven
// through the real /auth/callback, must establish a session (leave /login).
test("magic-link sign-in establishes a session", async ({ page }) => {
  const email = `buyer-${Date.now()}@beatmyvendor.invalid`;
  await login(page, email, { next: "/buyer" });
  await expect(page).not.toHaveURL(/\/login/);
  // A brand-new account with no org is routed to onboarding; an existing member
  // lands on their dashboard.
  await expect(page).toHaveURL(/\/(onboarding|buyer)/);
});
