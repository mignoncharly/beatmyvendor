import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/how-it-works",
  "/duels",
  "/vendors",
  "/pricing",
  "/privacy",
  "/cookies",
  "/login",
  "/start"
];

const viewports = [
  { name: "phone", width: 320, height: 700 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 }
];

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of publicRoutes) {
      test(`${route} has no page-level horizontal overflow`, async ({ page }) => {
        const response = await page.goto(route);
        expect(response?.ok(), `${route} should load`).toBe(true);
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth
        }));
        expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
      });
    }
  });
}

for (const route of ["/", "/how-it-works", "/login", "/cookies", "/this-route-does-not-exist"]) {
  test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("skip link moves keyboard focus to the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("mobile navigation is keyboard operable and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.locator(".mobile-nav summary");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("custom 404 is accessible and returns the correct status", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This Duel moved on." })).toBeVisible();
});

test("unsupported API methods return 405", async ({ request }) => {
  const response = await request.post("/api/account/export");
  expect(response.status()).toBe(405);
});

test("site metadata exposes branded icons and social previews", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/VendorDuel/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Tell us what you use/i);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const url = await page.locator(selector).getAttribute("content");
    expect(url).toBeTruthy();
    const response = await request.get(url!);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});
