import { test, withOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, registerVerifiedUser } from './arrange-lib.mjs';
import { gotoClean, uiLogin, waitClientAuth, switchUser, glideScroll } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';
import type { Page, Locator } from '@playwright/test';

test.use({ bypassCSP: true });

// Episode 9 · Recurring events. The organizer of a life-drawing group fills in
// the recurring-series wizard on camera — one template event, then the rule:
// weekly on Thursdays, auto-published — and lands on the dashboard of
// generated Thursdays. Then Noor, who is not a member of anything, finds the
// series' public page and follows it.
const CARD = { episode: 9, title: 'Recurring events', pov: 'the organizer, then a follower' };

const ADDRESS = 'Atelier Lange Gasse, Lange Gasse 34, 1080 Vienna, Austria';
const ORG_DESCRIPTION =
	'An open life-drawing group in Vienna. One long pose a week, a model, good light, and no teacher — bring your own paper and whatever you like to draw with. Beginners are very welcome.';
const EVENT_NAME = 'Long Pose Thursday';
const SERIES_DESCRIPTION =
	'Our weekly long-pose session. One model, two and a half hours, easels provided. Just say you’re coming.';

/**
 * Org names are unique, and `createDressedOrg` resolves a clash by appending
 * "Studio" / "II" / "III" — which would put "Life Drawing IV" on camera by the
 * fourth render. Pick a district prefix that is still free instead.
 */
async function freeOrgName(): Promise<string> {
	const districts = ['Josefstadt', 'Neubau', 'Wieden', 'Margareten', 'Mariahilf', 'Alsergrund', 'Landstraße', 'Leopoldstadt', 'Ottakring', 'Hernals', 'Währing', 'Döbling'];
	for (const d of districts) {
		const name = `${d} Life Drawing`;
		const found = await api(`/api/organizations/?search=${encodeURIComponent(name)}&page_size=5`);
		if (!(found.results ?? []).some((o: { name: string }) => o.name === name)) return name;
	}
	return 'Vienna Life Drawing';
}

/** `datetime-local` input value, in the browser's (= this machine's) zone. */
function localInputValue(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Glide so that `target` sits `offset` px below the top of the viewport. */
async function glideTo(page: Page, target: Locator, offset = 200, ms = 1200): Promise<void> {
	const box = await target.boundingBox();
	if (!box) return;
	const delta = box.y - offset;
	if (Math.abs(delta) > 24) await glideScroll(page, delta, ms);
}

test('ep-recurring-events', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a life-drawing group with a city (so the
	// wizard's City field is pre-filled), and Noor, who will follow the series.
	const org = await createDressedOrg({ name: await freeOrgName(), description: ORG_DESCRIPTION, address: ADDRESS });
	const vienna = (await api('/api/cities/?search=Vienna&page_size=1')).results?.[0];
	if (!vienna) throw new Error('no Vienna in /api/cities');
	await api(`/api/organization-admin/${org.slug}`, {
		method: 'PUT',
		token: org.owner.token,
		body: { visibility: 'public', accept_membership_requests: true, description: ORG_DESCRIPTION, address: ADDRESS, city_id: vienna.id }
	});
	const noor = await registerVerifiedUser('noor-haddad', 'Noor', 'Haddad', { emailLocal: 'noor.haddad' });

	// Next Thursday at least a week out, 19:00 local.
	const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
	while (start.getDay() !== 4) start.setDate(start.getDate() + 1);
	start.setHours(19, 0, 0, 0);
	const end = new Date(start.getTime() + 2.5 * 3600 * 1000);

	const wizardPath = `/org/${org.slug}/admin/event-series/new-recurring`;

	// ---- Owner in. Wait for the dashboard's client bootstrap BEFORE leaving
	// it: navigating away 80ms after login once made the next page refresh
	// with an already-rotated refresh token, 401, and drop the session.
	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	await page.waitForTimeout(800);
	// Prime the wizard page (bundle cache, client auth) so the cut off the
	// title card lands on a painted, signed-in form. A miss is a cheap reload.
	for (let attempt = 0; ; attempt++) {
		await gotoClean(page, wizardPath);
		const ok = await waitClientAuth(page).then(() => true, () => false);
		if (ok) break;
		if (attempt >= 2) throw new Error('client auth never landed on the wizard page');
		await page.waitForTimeout(4000);
	}
	await page.locator('#event-name').waitFor({ timeout: 15_000 });

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1: the template event (wizard step A).
	await titleCardCutTo(page, CARD, wizardPath);
	await waitClientAuth(page).catch(() => undefined);
	const nameInput = page.locator('#event-name');
	await nameInput.waitFor({ timeout: 15_000 });
	await page.mouse.move(1560, 620);
	narration.mark('template');
	await withOverlay(page, 'template', async () => {
		await page.waitForTimeout(700);
		await nameInput.click();
		await page.mouse.move(1560, 620, { steps: 6 });
		await nameInput.pressSequentially(EVENT_NAME, { delay: 60 });
		await page.waitForTimeout(400);
		const startInput = page.locator('#event-start');
		await startInput.hover();
		await page.waitForTimeout(200);
		await startInput.fill(localInputValue(start));
		await page.waitForTimeout(700);
		const endInput = page.locator('#event-end');
		await endInput.hover();
		await page.waitForTimeout(200);
		await endInput.fill(localInputValue(end));
		await page.waitForTimeout(700);

		// Location: the "Add Address" card, then the (pre-filled) city and the
		// address itself.
		const addAddress = page.getByRole('button', { name: /Add Address/ });
		await glideTo(page, addAddress, 380, 1300);
		await page.waitForTimeout(200);
		await addAddress.hover();
		await page.waitForTimeout(300);
		await addAddress.click();
		const addr = page.locator('#location-address');
		await addr.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(300);
		await addr.click();
		await page.mouse.move(1560, 640, { steps: 6 });
		await addr.pressSequentially(ADDRESS, { delay: 22 });
		await page.waitForTimeout(400);

		// "Tickets or a simple R S V P": bring the Ticketing block back into
		// view above the filled location, and rest there for the rest of the
		// line — the Continue button lives under a stack of empty accordions
		// and the footer, which is nothing to look at.
		const ticket = page.getByText('Requires Ticket', { exact: true }).first();
		await glideTo(page, ticket, 150, 1100);
		await ticket.hover().catch(() => undefined);
		await page.waitForTimeout(900);
		await page.mouse.move(1560, 700, { steps: 10 });
		await page.waitForTimeout(Math.max(600, narration.durationFor('template') - 500));
		const cont = page.getByRole('button', { name: 'Continue', exact: true });
		await cont.scrollIntoViewIfNeeded();
		await cont.click();
		await page.locator('#series-name').waitFor({ timeout: 10_000 });
		await page.waitForTimeout(600);
	});

	// ---- Scene 2: the rule (wizard step B).
	narration.mark('rule');
	await withOverlay(page, 'rule', async () => {
		await page.waitForTimeout(500);
		const desc = page.locator('#series-description');
		await desc.click();
		await page.mouse.move(1560, 640, { steps: 6 });
		await desc.pressSequentially(SERIES_DESCRIPTION, { delay: 14 });
		await page.waitForTimeout(300);

		const thursday = page.getByRole('button', { name: 'Thursday', exact: true });
		await glideTo(page, thursday, 300, 1100);
		await page.getByRole('radio', { name: 'Weekly' }).hover();
		await page.waitForTimeout(600);
		await thursday.hover();
		await page.waitForTimeout(900);
		await page.getByRole('radio', { name: 'Never' }).hover().catch(() => undefined);
		await page.waitForTimeout(700);

		const advanced = page.getByRole('button', { name: 'Advanced', exact: true });
		await glideTo(page, advanced, 420, 1100);
		await advanced.hover();
		await page.waitForTimeout(250);
		if ((await advanced.getAttribute('aria-expanded')) !== 'true') await advanced.click();
		const autoPublish = page.locator('#auto-publish');
		await autoPublish.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(400);
		await autoPublish.hover();
		await page.waitForTimeout(250);
		if ((await autoPublish.getAttribute('aria-checked')) !== 'true') await autoPublish.click();
		await page.waitForTimeout(700);
		await page.locator('#generation-window').hover();
		await page.waitForTimeout(600);

		const create = page.getByRole('button', { name: 'Create series', exact: true });
		await glideTo(page, create, 760, 1000);
		await create.hover();
		await page.waitForTimeout(Math.max(600, narration.durationFor('rule') - 1200));
		await create.click();
		await page.waitForURL(/\/admin\/event-series\/[0-9a-f-]{36}$/, { timeout: 30_000 });
		await page.locator('[data-testid="occurrence-row"]').first().waitFor({ timeout: 20_000 });
		await page.waitForTimeout(400);
	});

	const seriesId = page.url().match(/event-series\/([0-9a-f-]{36})$/)?.[1];
	if (!seriesId) throw new Error('no series id in the dashboard URL');
	const detail = await api(`/api/organization-admin/${org.slug}/event-series/${seriesId}`, { token: org.owner.token });
	const seriesPath = `/events/${org.slug}/series/${detail.slug}`;

	// ---- Scene 3: the dashboard of generated Thursdays.
	await page.mouse.move(1700, 640);
	narration.mark('occurrences');
	await withOverlay(page, 'occurrences', async () => {
		await page.waitForTimeout(2200);
		const rows = page.locator('[data-testid="occurrence-row"]');
		// Header action first (hovering it later would scroll the page back up).
		const editTemplate = page.getByRole('button', { name: 'Edit template' }).first();
		if (await editTemplate.isVisible().catch(() => false)) {
			await editTemplate.hover();
			await page.waitForTimeout(1600);
			await page.mouse.move(1700, 640, { steps: 10 });
		}
		await glideScroll(page, 320, 2600);
		await page.waitForTimeout(1200);
		const cancelOne = rows.nth(2).getByRole('button', { name: 'Cancel this date' });
		if (await cancelOne.isVisible().catch(() => false)) {
			await cancelOne.hover();
		}
		await page.waitForTimeout(Math.max(1200, narration.durationFor('occurrences')));
	});

	// ---- Cut: Noor on the series' public page, nearest date first.
	await episodeCut(page, 'Meanwhile', 'On Noor’s side', `${seriesPath}?order_by=start`, {
		during: () => switchUser(page, noor.email, noor.password)
	});
	await waitClientAuth(page).catch(() => undefined);
	const follow = page.getByRole('button', { name: 'Follow', exact: true });
	await follow.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await page.mouse.move(1500, 700);

	// ---- Scene 4: the list of dates, then Follow.
	narration.mark('follow');
	await withOverlay(page, 'follow', async () => {
		await page.waitForTimeout(900);
		// Bring the first row of dates up under the header, Follow still in shot.
		await glideScroll(page, 300, 2200);
		await page.waitForTimeout(1800);
		if (await follow.isVisible().catch(() => false)) {
			await follow.hover();
			await page.waitForTimeout(600);
			await follow.click();
			await page.getByRole('button', { name: 'Following', exact: true }).waitFor({ timeout: 15_000 }).catch(() => undefined);
			await page.waitForTimeout(300);
			await page.mouse.move(1500, 760, { steps: 14 });
		}
		await page.waitForTimeout(Math.max(1500, narration.durationFor('follow')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
