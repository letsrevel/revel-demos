import { test, withOverlay } from '@argo-video/cli';
import type { Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, createEvent } from './arrange-lib.mjs';
import { gotoClean, hideDemoChrome, waitHydrated } from './clip-helpers';
import { closeEpisode, showTitleCard, titleCardCutTo } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 11 · No account needed. A logged-OUT visitor on a free open-air
// film night: the guest R S V P button, a name and an email, the one
// confirmation email (framed as the email itself, via Mailpit's HTML view),
// the Confirm button inside it, and the event page in its confirmed state.
//
// Nobody logs in anywhere in this episode. The Playwright context is fresh,
// so the recorded page carries no session, and the header reads
// "Login / Sign Up" on purpose — that is the point of view.
const CARD = { episode: 11, title: 'No account needed', pov: 'a visitor with no account' };

const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const ADDRESS = 'Augartenspitz, Obere Augartenstraße 1, 1020 Vienna, Austria';
const FONT = "-apple-system,'Nata Sans',sans-serif";

/** Poll Mailpit for the guest confirmation email; returns its id and confirm link. */
async function findConfirmationEmail(email: string): Promise<{ id: string; link: string }> {
	const intercepted = `+${email.replace('@', '_at_').replaceAll('.', '_dot_')}@`;
	const deadline = Date.now() + 30_000;
	for (;;) {
		for (const q of [`to:"${email}"`, `to:"${intercepted}"`]) {
			const data = await (
				await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(q)}&limit=5`)
			).json();
			const hit = data.messages?.find((m: { Subject: string }) => /Confirm your RSVP/i.test(m.Subject));
			if (hit) {
				const full = await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json();
				const link = full.Text.match(/https?:\/\/\S*confirm-action\?token=\S+/)?.[0];
				if (!link) throw new Error('ep-no-account: confirmation email has no confirm link');
				return { id: hit.ID, link };
			}
		}
		if (Date.now() > deadline) throw new Error(`ep-no-account: no confirmation email for ${email}`);
		await new Promise((r) => setTimeout(r, 500));
	}
}

/**
 * Remove every helper-painted cover except `keep`. The episode helpers' title
 * card cover (`revel-ep-cover-*`) is an init script guarded by sessionStorage,
 * which is per origin — so it paints the title card again on the first
 * document of any other origin, and stays there. Sweep it whenever the page
 * changes origin, in either direction.
 */
async function sweepStaleCovers(page: Page, keep?: string, label = ''): Promise<void> {
	try {
		const removed = await page.evaluate((keepId) => {
			const gone: string[] = [];
			document
				.querySelectorAll('[id^="revel-ep-cover-"], [id^="revel-ep-ext-cover-"]')
				.forEach((el) => {
					if (el.id !== keepId) {
						gone.push(el.id);
						el.remove();
					}
				});
			return gone;
		}, keep ?? '');
		if (removed.length) console.warn(`[ep-no-account] sweep${label ? ' ' + label : ''}: removed stale cover(s) ${removed.join(', ')}`);
	} catch (err) {
		console.warn(`[ep-no-account] sweep${label ? ' ' + label : ''} failed: ${(err as Error).message}`);
	}
}

/**
 * From now on, on EVERY new document, remove the episode helpers' title-card
 * cover the instant it is painted. Registered once, before the first hop off
 * the app's origin. The sweep above is the same idea after the fact; this one
 * does not depend on when the cover lands relative to our own evaluates.
 */
async function armCoverKiller(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const kill = (): void => {
			document.querySelectorAll('[id^="revel-ep-cover-"]').forEach((el) => el.remove());
		};
		const observer = new MutationObserver(kill);
		const start = (): boolean => {
			const root = document.documentElement;
			if (!root) return false;
			observer.observe(root, { childList: true });
			kill();
			return true;
		};
		if (!start()) {
			const poll = setInterval(() => {
				if (start()) clearInterval(poll);
			}, 4);
			setTimeout(() => clearInterval(poll), 5000);
		}
		document.addEventListener('DOMContentLoaded', kill);
		window.addEventListener('load', kill);
		setTimeout(() => observer.disconnect(), 20_000);
	});
}

/**
 * The series' soft place-cut, for a destination OUTSIDE the app. episodeCut
 * goes through gotoClean, which waits for the app's hydration marker — and
 * Mailpit's rendering of an email never sets one, so it would time out on
 * camera. Same card, same cover-then-dissolve, plain load wait; `prep` runs
 * on the loaded page while it is still covered.
 */
async function cutToExternal(
	page: Page,
	kicker: string,
	title: string,
	url: string,
	{ holdMs = 1500, prep }: { holdMs?: number; prep?: () => Promise<void> } = {}
): Promise<void> {
	const html =
		`<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;background:linear-gradient(165deg,#f3eefc 0%,#e7defa 55%,#dbe4ff 100%);font-family:${FONT};">` +
		`<div style="color:#8C3CDD;font-size:1.05rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">${kicker}</div>` +
		`<div style="color:#0D1E1C;font-size:3rem;font-weight:900;line-height:1.12;text-align:center;max-width:58rem;">${title}</div></div>`;
	await page.evaluate((markup) => {
		const el = document.createElement('div');
		el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
		el.innerHTML = markup;
		document.documentElement.appendChild(el);
	}, html);
	await page.waitForTimeout(holdMs);
	const id = `revel-ep-ext-cover-${Date.now().toString(36)}`;
	// Guarded by URL, not sessionStorage: init scripts re-run on every later
	// navigation, and a storage guard is per ORIGIN — the episode helpers'
	// title-card cover, guarded that way, re-paints itself on Mailpit's origin
	// (and this one would re-paint on the app's). See stale-cover sweep below.
	await page.addInitScript(
		([markup, coverId, target]) => {
			if (!location.href.startsWith(target as string)) return;
			const paint = (): boolean => {
				try {
					if (document.getElementById(coverId)) return true;
					const root = document.documentElement;
					if (!root) return false;
					const el = document.createElement('div');
					el.id = coverId;
					el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
					el.innerHTML = markup;
					root.appendChild(el);
					return true;
				} catch {
					return false;
				}
			};
			if (!paint()) {
				const poll = setInterval(() => {
					if (paint()) clearInterval(poll);
				}, 4);
				setTimeout(() => clearInterval(poll), 5000);
			}
			document.addEventListener('DOMContentLoaded', paint);
		},
		[html, id, url]
	);
	await page.goto(url);
	await page.waitForLoadState('load');
	await sweepStaleCovers(page, id, 'after load');
	if (prep) await prep();
	await sweepStaleCovers(page, id, 'before dissolve');
	await page.evaluate(
		([coverId, ms]) => {
			const el = document.getElementById(coverId as string);
			if (!el) return;
			const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: ms as number,
				easing: 'ease',
				fill: 'forwards'
			});
			anim.finished.then(() => el.remove()).catch(() => el.remove());
		},
		[id, 700]
	);
	await page.waitForTimeout(850);
}

test('ep-no-account', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a volunteer open-air cinema, one free night
	// that allows guests.
	const org = await createDressedOrg({
		name: 'Lichtspiel Open Air',
		description:
			'A volunteer-run open-air cinema in the Augarten. One film a week from June to September, a borrowed projector, folding chairs, and whatever the weather decides. Free to come; bring a blanket.',
		address: ADDRESS
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Open-Air Night: Wings of Desire',
		description:
			'Wim Wenders’ black-and-white Berlin, on the big inflatable screen at the tip of the Augarten. Doors at sunset, film at dark. No tickets, no sign-up — just tell us you are coming so we know how many chairs to unfold.',
		address: ADDRESS,
		requires_ticket: false,
		max_attendees: 200,
		can_attend_without_login: true
	});
	const pub = await api(`/api/events/${org.slug}/event/${event.slug}`);
	if (pub.can_attend_without_login !== true) throw new Error('ep-no-account: can_attend_without_login did not stick');

	const stamp = Date.now().toString(36).slice(-4);
	const guest = { first: 'Nora', last: 'Lindqvist', email: `nora.lindqvist.${stamp}@example.com` };

	// ---- Setup (not recorded): NO login. Prime the event page so the bundle
	// is cached and the cut off the title card lands on a painted page.
	//
	// Anonymous API calls are throttled per IP (60/min), and the frontend's
	// server-side fetch shares that budget with every other author rendering
	// against this stack. When it is throttled, the event page renders as a
	// 404 — so keep loading until the guest button is actually on screen.
	const guestButtonLocator = () => page.getByRole('button', { name: 'Submit RSVP' }).filter({ visible: true }).first();
	for (let attempt = 0; ; attempt++) {
		await gotoClean(page, event.path);
		if (await guestButtonLocator().isVisible({ timeout: 8_000 }).catch(() => false)) break;
		if (attempt >= 6) throw new Error('ep-no-account: event page never painted the guest R S V P button (throttled?)');
		console.warn('[ep-no-account] event page did not paint (API throttled?) — retrying');
		await new Promise((r) => setTimeout(r, 20_000 + attempt * 10_000));
	}

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: guest — the event page, logged out, and the guest button.
	// Wait out any throttle window first (api() retries on 429), so the load
	// under the title card is not the one that gets a 404.
	await api(`/api/events/${org.slug}/event/${event.slug}`);
	await titleCardCutTo(page, CARD, event.path);
	const guestButton = guestButtonLocator();
	await guestButton.waitFor({ timeout: 20_000 }).catch(() => undefined);
	await page.mouse.move(980, 720);
	narration.mark('guest');
	await withOverlay(page, 'guest', async () => {
		const total = narration.durationFor('guest');
		await page.waitForTimeout(Math.max(0, total * 0.5));
		await guestButton.hover({ timeout: 15_000 });
		await page.waitForTimeout(Math.max(0, narration.durationFor('guest') - 4200));
		await guestButton.click({ timeout: 15_000 });
		await page.getByRole('dialog').getByText('RSVP without an account').waitFor({ timeout: 10_000 });
		await page.waitForTimeout(Math.max(1200, narration.durationFor('guest')));
	});

	// ---- Scene: form — a name and an email, then "Check your email!".
	const dialog = page.getByRole('dialog');
	narration.mark('form');
	await withOverlay(page, 'form', async () => {
		// Email first: the dialog autofocuses it, and leaving it empty for the
		// name fields flashes a "valid email" error on camera.
		const emailField = dialog.locator('#guest-email');
		await emailField.click({ timeout: 15_000 });
		await emailField.pressSequentially(guest.email, { delay: 38 });
		await page.waitForTimeout(250);
		await dialog.locator('#guest-first-name').click({ timeout: 15_000 });
		await dialog.locator('#guest-first-name').pressSequentially(guest.first, { delay: 70 });
		await dialog.locator('#guest-last-name').click({ timeout: 15_000 });
		await dialog.locator('#guest-last-name').pressSequentially(guest.last, { delay: 60 });
		await page.waitForTimeout(300);
		// "Yes, I'll be there" is already selected — point at it, don't change it.
		await dialog.locator('label[for="rsvp-yes"]').hover({ timeout: 15_000 });
		await page.waitForTimeout(700);
		const submit = dialog.getByRole('button', { name: 'Submit RSVP' });
		await submit.hover({ timeout: 15_000 });
		await page.waitForTimeout(Math.max(500, narration.durationFor('form') - 3600));
		await submit.click({ timeout: 15_000 });
		await dialog.getByText('Check your email!').waitFor({ timeout: 15_000 });
		await page.mouse.move(1500, 900);
		await page.waitForTimeout(Math.max(2800, narration.durationFor('form')));
	});

	// ---- Cut: the inbox. The email is what's in frame, not Mailpit's chrome.
	const mail = await findConfirmationEmail(guest.email);
	await armCoverKiller(page);
	await cutToExternal(page, 'Your inbox', 'One email, to confirm', `${MAILPIT}/view/${mail.id}.html`, {
		prep: async () => {
			// A 600px email on a 1920px frame reads small; scale it a touch and
			// let its logo decode before the card dissolves.
			// Zoom a WRAPPER, not <body>: argo's pseudo-cursor ring lives in
			// <body>, and zooming that draws the ring 20% off the real pointer.
			await page.evaluate(() => {
				const wrap = document.createElement('div');
				(wrap.style as unknown as { zoom: string }).zoom = '1.2';
				Array.from(document.body.childNodes).forEach((n) => {
					if (n instanceof HTMLElement && (n.hasAttribute('data-argo-cursor') || n.id.startsWith('argo'))) return;
					wrap.appendChild(n);
				});
				document.body.prepend(wrap);
			});
			await page
				.locator('img')
				.first()
				.evaluate((img) => (img as HTMLImageElement).decode().catch(() => undefined))
				.catch(() => undefined);
			await page.waitForTimeout(300);
		}
	});
	await page.mouse.move(1500, 620);
	await sweepStaleCovers(page, undefined, 'at email mark');
	narration.mark('email');
	await withOverlay(page, 'email', async () => {
		const total = narration.durationFor('email');
		await page.waitForTimeout(Math.max(0, total * 0.45));
		await sweepStaleCovers(page, undefined, 'before confirm hover');
		const confirm = page.getByRole('link', { name: 'Confirm RSVP' }).first();
		await confirm.hover({ timeout: 15_000 });
		await page.waitForTimeout(Math.max(600, narration.durationFor('email') - 1400));
		await confirm.click({ timeout: 15_000 });
		await page.waitForURL(/confirm-action/, { timeout: 15_000 });
	});

	// ---- Scene: confirmed — the confirm page, then the event with its banner.
	await waitHydrated(page);
	await sweepStaleCovers(page, undefined, 'confirm page');
	await hideDemoChrome(page);
	const confirmedHeading = page.getByRole('heading', { name: 'RSVP Confirmed!' });
	await confirmedHeading.waitFor({ timeout: 20_000 });
	await page.mouse.move(1400, 700);
	narration.mark('confirmed');
	await withOverlay(page, 'confirmed', async () => {
		const total = narration.durationFor('confirmed');
		await page.waitForTimeout(Math.max(0, total * 0.22));
		const view = page.getByRole('button', { name: 'View Event Details' });
		await view.hover({ timeout: 15_000 });
		await page.waitForTimeout(Math.max(0, total * 0.12));
		await view.click({ timeout: 15_000 });
		await page.waitForURL(/\/events\//, { timeout: 15_000 });
		await waitHydrated(page);
		await sweepStaleCovers(page, undefined, 'event page');
		await hideDemoChrome(page);
		await page.mouse.move(980, 760);
		await page
			.getByText('RSVP Confirmed!')
			.filter({ visible: true })
			.first()
			.waitFor({ timeout: 15_000 })
			.catch(() => undefined);
		await page.waitForTimeout(Math.max(2500, narration.durationFor('confirmed')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
