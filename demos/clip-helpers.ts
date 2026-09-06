// Shared browser-side helpers for demo clips. Import from every clip demo so
// the recording conventions stay identical across the library.
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Full-screen end card built from the real brand lockup — the R mark with the
 * "let's revel." wordmark, on its own purple-to-crimson gradient.
 *
 * Why this exists rather than argo's `logo-outro` block: that block renders
 * whatever it is given inside a hard-sized 72x72 square, which squashes a wide
 * lockup, and when no logo is supplied at all it falls back to a generic
 * placeholder tile with a system-font wordmark beside it. Both are off-brand.
 * Here the artwork IS the card, so the wordmark is never re-typeset.
 *
 * The image has to be inlined as a data: URI — the card is painted inside the
 * recorded page, where a file path on the host does not resolve.
 *
 * It is painted as an overlay on the CURRENT page rather than after a
 * `goto('about:blank')`. Navigating renders a white page for a few frames, and
 * those white frames land inside the outgoing scene's fade-to-black and blend
 * into it as a visible one-frame flash (measured: the fade ran 6 → 2 → 10 → 6
 * instead of falling monotonically). Overlaying never produces a white frame.
 */
export async function showEndCard(page: Page, url = 'letsrevel.io'): Promise<void> {
	const b64 = readFileSync(new URL('../assets/revel-logo-gradient.png.b64', import.meta.url), 'utf8').replace(/\s+/g, '');
	await page.evaluate(
		([src, text]) => {
			const card = document.createElement('div');
			card.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#8C3CDD;overflow:hidden;';
			// The slow drift is not decoration. argo records with
			// page.screencast.start(), and a CDP screencast only emits a frame
			// when the page actually changes — a completely static card sends
			// one frame and then nothing, so the clip ENDS there and the outro
			// narration gets cut off. Continuous motion keeps frames flowing.
			card.innerHTML = `
				<style>
					@keyframes revel-drift { from { transform: scale(1); } to { transform: scale(1.06); } }
					@keyframes revel-rise  { from { opacity: 0; transform: translateY(14px); } to { opacity: .95; transform: none; } }
				</style>
				<div style="position:absolute;inset:-2%;background-image:url('${src}');background-size:cover;background-position:center;background-repeat:no-repeat;animation:revel-drift 24s ease-out forwards;"></div>
				<div style="position:absolute;left:0;right:0;bottom:11%;text-align:center;color:#fff;font-family:-apple-system,'Nata Sans',sans-serif;font-size:1.6rem;font-weight:600;letter-spacing:.16em;animation:revel-rise 1.1s ease-out .35s both;">${text}</div>`;
			document.documentElement.appendChild(card);
		},
		[`data:image/png;base64,${b64}`, url]
	);
	// Let the (large) data URI decode and paint before the recorder moves on.
	await page.waitForTimeout(600);
}

/** Smooth incremental scroll over roughly `ms` milliseconds. */
export async function slowScroll(page: Page, totalPx: number, ms: number): Promise<void> {
	const steps = Math.max(1, Math.floor(ms / 120));
	const perStep = Math.round(totalPx / steps);
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel(0, perStep);
		await page.waitForTimeout(120);
	}
}

/**
 * Glide the page down `totalPx` over `ms`, eased, at the browser's own frame
 * rate.
 *
 * `slowScroll` steps the wheel every 120ms, which at 30fps lands as a visible
 * jump every ~4 frames — fine behind a busy scene, obviously juddery in a
 * montage. This drives window.scrollTo from inside the page on
 * requestAnimationFrame with an ease-in-out, so every recorded frame gets its
 * own scroll position.
 */
export async function glideScroll(page: Page, totalPx: number, ms: number): Promise<void> {
	await page.evaluate(
		([distance, duration]) =>
			new Promise<void>((resolve) => {
				const start = window.scrollY;
				const t0 = performance.now();
				const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
				const step = (now: number) => {
					const t = Math.min(1, (now - t0) / duration);
					window.scrollTo(0, start + distance * ease(t));
					if (t < 1) requestAnimationFrame(step);
					else resolve();
				};
				requestAnimationFrame(step);
			}),
		[totalPx, ms]
	);
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

const CUT_COVER_ID = 'revel-cut-cover';

/**
 * Cut from a painted interstitial to `path` WITHOUT a visible jump.
 *
 * A plain `showInterstitial` + `goto` is a hard cut: the card is on about:blank,
 * and navigating throws it away the instant the new document paints. This keeps
 * an identical card on the destination page from its very first frame — an init
 * script paints it at document start, so it beats the app's own render — and
 * `revealFromInterstitial` then dissolves it away once the page is ready.
 *
 * The card cannot simply be faded across the navigation any other way: nothing
 * in the old document survives it.
 */
export async function interstitialCutTo(
	page: Page,
	kicker: string,
	title: string,
	path: string,
	{ holdMs = 1200 }: { holdMs?: number } = {}
): Promise<void> {
	await showInterstitial(page, kicker, title);
	await page.waitForTimeout(holdMs);
	await page.addInitScript(
		([k, t, id]) => {
			// Paint on the FIRST new document only; later navigations in the same
			// clip must not get covered.
			try {
				if (sessionStorage.getItem('revel-cut-cover-used')) return;
				sessionStorage.setItem('revel-cut-cover-used', '1');
			} catch {
				/* about:blank has no storage — fall through and paint */
			}
			const paint = (): boolean => {
				try {
					if (document.getElementById(id)) return true;
					// At document-start there is no <html> yet, and touching it
					// throws — which used to abort this whole script before it
					// could register any listener, so no cover was ever painted.
					const root = document.documentElement;
					if (!root) return false;
					const el = document.createElement('div');
					el.id = id;
					el.style.cssText =
						'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;' +
						'align-items:center;justify-content:center;gap:1rem;' +
						'background:linear-gradient(165deg,#f3eefc 0%,#e7defa 55%,#dbe4ff 100%);' +
						"font-family:-apple-system,'Nata Sans',sans-serif;";
					el.innerHTML =
						`<div style="color:#8C3CDD;font-size:1.05rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">${k}</div>` +
						`<div style="color:#0D1E1C;font-size:3rem;font-weight:900;line-height:1.12;text-align:center;max-width:58rem;">${t}</div>`;
					root.appendChild(el);
					return true;
				} catch {
					return false;
				}
			};
			// Paint the instant <html> appears, so the destination never gets a
			// frame on camera before it is covered.
			if (!paint()) {
				const poll = setInterval(() => {
					if (paint()) clearInterval(poll);
				}, 4);
				setTimeout(() => clearInterval(poll), 5000);
			}
			// And again once parsing finishes, in case the parser discarded it.
			document.addEventListener('DOMContentLoaded', paint);
		},
		[kicker, title, CUT_COVER_ID]
	);
	await gotoClean(page, path);
}

/** Dissolve the card left by `interstitialCutTo`, revealing the loaded page. */
export async function revealFromInterstitial(page: Page, fadeMs = 700): Promise<void> {
	await page.evaluate(
		([id, ms]) => {
			const el = document.getElementById(id as string);
			if (!el) return;
			// Web Animations rather than a CSS transition. A transition needs a
			// style recalculation between setting `transition` and changing
			// `opacity`; without one the browser applies both as a single change
			// and the card vanishes in one frame. Forcing a reflow did not fix it
			// here, and .animate() does not depend on that timing at all.
			const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: ms as number,
				easing: 'ease',
				fill: 'forwards'
			});
			anim.finished.then(() => el.remove()).catch(() => el.remove());
		},
		[CUT_COVER_ID, fadeMs]
	);
	await page.waitForTimeout(fadeMs + 150);
}
