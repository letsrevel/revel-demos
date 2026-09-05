// Shared browser-side helpers for demo clips. Import from every clip demo so
// the recording conventions stay identical across the library.
import type { Page } from '@playwright/test';

/** Smooth incremental scroll over roughly `ms` milliseconds. */
export async function slowScroll(page: Page, totalPx: number, ms: number): Promise<void> {
	const steps = Math.max(1, Math.floor(ms / 120));
	const perStep = Math.round(totalPx / steps);
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel(0, perStep);
		await page.waitForTimeout(120);
	}
}

const DEMO_CHROME_CSS = `div[role="alert"]:has(a[href*="mailpit"]) { display: none !important; }`;

/** Pages whose permanent hiding rule has already been installed. */
const chromeHidden = new WeakSet<Page>();

/**
 * Hide demo-environment chrome (the "Demo Mode … mailpit" banner).
 *
 * Injecting the rule after the page has loaded is not enough on its own. The
 * banner is client-rendered once /api/version comes back, so on a slow load it
 * can paint after `gotoClean` has already run — and a scene recorded in that
 * window has the banner in shot. That is not hypothetical: it put the banner
 * across the middle scene of clip-eligibility-gates while the scenes on either
 * side of it, recorded by the same code, were clean.
 *
 * So the rule is installed twice over. `addInitScript` re-runs on every
 * navigation this page makes from now on, before any of the app's own script,
 * which closes the race for good; the `addStyleTag` covers the document that is
 * already open at the moment of the first call.
 */
export async function hideDemoChrome(page: Page): Promise<void> {
	if (!chromeHidden.has(page)) {
		chromeHidden.add(page);
		await page.addInitScript((css: string) => {
			const install = (): void => {
				const style = document.createElement('style');
				style.setAttribute('data-demo-chrome-hider', '');
				style.textContent = css;
				document.head.append(style);
			};
			// addInitScript runs before the document has a <head>.
			if (document.head) install();
			else document.addEventListener('DOMContentLoaded', install, { once: true });
		}, DEMO_CHROME_CSS);
	}
	// Can reject if the page navigates mid-call; the init script covers that case.
	await page.addStyleTag({ content: DEMO_CHROME_CSS }).catch(() => undefined);
}

export async function waitHydrated(page: Page): Promise<void> {
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
}

/** Full page load + hydration + demo-chrome hide, in one call. */
export async function gotoClean(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await waitHydrated(page);
	await page.waitForLoadState('networkidle').catch(() => undefined);
	await hideDemoChrome(page);
}

/** Wait for the client auth bootstrap (required before any mutation). */
export async function waitClientAuth(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20_000 });
}

/** UI login handling the DEMO_MODE "Show login form" toggle. */
export async function uiLogin(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await waitHydrated(page);
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3_000 }).catch(() => false)) {
		await reveal.click();
	}
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20_000 });
}

/**
 * Swap the CONTEXT's session to another user via a second, unrecorded page.
 * The recorded page should be showing an interstitial meanwhile.
 */
export async function switchUser(page: Page, email: string, password: string): Promise<void> {
	const side = await page.context().newPage();
	await side.goto('/logout');
	await side.waitForURL(/logged_out/, { timeout: 15_000 }).catch(() => undefined);
	await uiLogin(side, email, password);
	await side.close();
}

/**
 * Full-screen SOFT brand interstitial on the recorded page (about:blank):
 * lavender-paper wash, ink text — per the skill's "softer" rule.
 */
export async function showInterstitial(page: Page, kicker: string, title: string): Promise<void> {
	await page.goto('about:blank');
	await page.evaluate(
		([k, t]) => {
			document.body.innerHTML = `
				<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;background:linear-gradient(165deg,#f3eefc 0%,#e7defa 55%,#dbe4ff 100%);font-family:-apple-system,'Nata Sans',sans-serif;">
					<div style="color:#8C3CDD;font-size:1.05rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">${k}</div>
					<div style="color:#0D1E1C;font-size:3rem;font-weight:900;line-height:1.12;text-align:center;max-width:58rem;">${t}</div>
				</div>`;
			document.body.style.margin = '0';
		},
		[kicker, title]
	);
}
