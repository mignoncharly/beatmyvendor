import { expect, test } from "@playwright/test";

test.describe("public acquisition journey", () => {
  test("buyer CTA reaches passwordless sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start a Duel" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "One link. No password." })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Work email" })).toBeFocused();
  });

  test("vendor CTA preserves vendor intent", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Find Duels" }).click();

    await expect(page).toHaveURL(/\/login\?role=vendor$/);
    await expect(page.getByText("Buyer and vendor workspaces stay separate.")).toBeVisible();
  });

  test("email field blocks malformed addresses before a server action", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByRole("textbox", { name: "Work email" });
    await email.fill("not-an-email");
    await page.getByRole("button", { name: "Continue with email" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(email).toHaveJSProperty("validity.valid", false);
  });

  test("catalog discovery reaches a comparison-ready software page", async ({ page }) => {
    await page.goto("/vendors");
    const catalogLink = page.locator('a[href^="/software/"]').first();
    const href = await catalogLink.getAttribute("href");
    expect(href).toMatch(/^\/software\/[a-z0-9-]+$/);

    await catalogLink.click();
    await expect(page).toHaveURL(new RegExp(String(href) + "$"));
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('a[href^="/alternatives/"]').first()).toBeVisible();
  });
});

test.describe("HTTP and indexing boundaries", () => {
  test("all public responses carry baseline browser security headers", async ({ request }) => {
    for (const path of ["/", "/login", "/duels", "/privacy"]) {
      const response = await request.get(path);
      expect(response.ok(), path + " should load").toBe(true);
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["x-frame-options"]).toBe("DENY");
      expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(response.headers()["permissions-policy"]).toContain("camera=()");
    }
  });

  test("maintenance and Stripe endpoints reject unauthenticated calls", async ({ request }) => {
    const retention = await request.post("/api/maintenance/retention");
    expect(retention.status()).toBe(401);
    await expect(retention.json()).resolves.toEqual({ error: "Unauthorized" });

    const stripe = await request.post("/api/stripe/webhook", { data: "{}" });
    expect(stripe.status()).toBe(503);
    await expect(stripe.json()).resolves.toEqual({ error: "Webhook is not configured." });
  });

  test("robots excludes private surfaces and advertises the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBe(true);
    const body = await response.text();

    for (const path of ["/admin/", "/buyer/", "/vendor/", "/auth/", "/account/", "/report"]) {
      expect(body).toContain("Disallow: " + path);
    }
    expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  test("sitemap contains discovery pages but no private application routes", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.ok()).toBe(true);
    const body = await response.text();

    for (const path of ["/how-it-works", "/vendors", "/duels", "/pricing", "/privacy", "/software/zendesk"]) {
      expect(body).toContain(path);
    }
    for (const path of ["/admin", "/buyer", "/vendor", "/account", "/login"]) {
      expect(body).not.toMatch(new RegExp("<loc>[^<]+" + path + "(?:/|<)"));
    }
  });

  test("unsupported methods fail closed", async ({ request }) => {
    const retention = await request.get("/api/maintenance/retention");
    const stripe = await request.get("/api/stripe/webhook");
    expect(retention.status()).toBe(405);
    expect(stripe.status()).toBe(405);
  });
});
