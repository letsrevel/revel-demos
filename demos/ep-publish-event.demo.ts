import { test, withOverlay } from '@argo-video/cli';
import type { Locator, Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg } from './arrange-lib.mjs';
import { gotoClean, glideScroll, uiLogin, waitClientAuth, waitHydrated } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 1 · Publish your first event — the organizer's eyes. The club is
// arranged through the API; the EVENT is created on camera, in the form.
const CARD = { episode: 1, title: 'Publish your first event', pov: 'the organizer' };

// The club's name is on camera in every scene, so it should read like a club
// and not "Neubau Listening Club III". Org names are unique across the stack
// and every render takes one, so the first free name from this list wins;
// createDressedOrg's own suffixing is only the fallback.
const ORG_NAMES = [
	'Neubau Listening Club',
	'Westbahn Listening Club',
	'Spittelberg Listening Club',
	'Lerchenfeld Listening Club',
	'Siebenstern Listening Club',
	'Burggasse Listening Club',
	'Zieglergasse Listening Club',
	'Neubau Record Club',
	'Seventh District Record Club'
];
const ORG = {
	name: ORG_NAMES[0],
	description:
		'A small club that meets twice a month to listen to one record, start to finish, with the lights down. No phones, no skipping. Run by a handful of friends in the seventh district.',
	address: 'Westbahnstraße 27, 1070 Vienna, Austria'
};
const EVENT_NAME = 'Autumn Listening Night';
// Street only: the public page appends the city itself ("…, Vienna, Austria"),
// so a full postal address would read the city twice.
const EVENT_ADDRESS = 'Westbahnstraße 27';
const EVENT_DESCRIPTION =
	'One record, start to finish, on the good speakers. Doors at seven, quiet by half past.';
const CAPACITY = '40';

const pad = (n: number) => String(n).padStart(2, '0');
/** `YYYY-MM-DDTHH:mm` in the browser's own (= this machine's) timezone. */
const toLocalInput = (d: Date) =>
	`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The first club name nobody has taken yet (exact match, case-insensitive). */
async function freeOrgName(): Promise<string> {
	for (const name of ORG_NAMES) {
		const page = await api(`/api/organizations/?search=${encodeURIComponent(name)}&page_size=20`).catch(
			() => null
		);
		if (!page) return name;
		const taken = (page.results ?? []).some(
			(o: { name: string }) => o.name.trim().toLowerCase() === name.toLowerCase()
		);
		if (!taken) return name;
	}
	return ORG_NAMES[0];
}

/** Park the cursor in the right margin, off every card and hover state. */
async function parkMouse(page: Page): Promise<void> {
	await page.mouse.move(1500, 640);
}

/** Glide so `target` sits `offset` px below the top of the viewport. */
async function glideTo(page: Page, target: Locator, offset: number, ms: number): Promise<void> {
	const box = await target.boundingBox();
	if (!box) return;
	const delta = Math.round(box.y - offset);
	if (Math.abs(delta) < 8) return;
	await glideScroll(page, delta, ms);
}

test('ep-publish-event', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a small club with an address and a city.
	//
	// The city matters: the event form seeds its City field from the
	// organization's, and the post-creation Save refuses an event without one.
	// createDressedOrg sets the address but not the city, so it is PUT again
	// here with every dressed field repeated (PUT, so omitted fields clear).
	const org = await createDressedOrg({ ...ORG, name: await freeOrgName() });
	const cities = await api('/api/cities/?search=Vienna&page_size=1');
	const vienna = cities.results?.[0];
	if (!vienna) throw new Error('No Vienna in /api/cities');
	await api(`/api/organization-admin/${org.slug}`, {
		method: 'PUT',
		token: org.owner.token,
		body: {
			visibility: 'public',
			accept_membership_requests: true,
			description: ORG.description,
			address: ORG.address,
			city_id: vienna.id
		}
	});

	const formPath = `/org/${org.slug}/admin/events/new`;
	const start = new Date(Date.now() + 10 * 24 * 3600 * 1000);
	start.setHours(19, 30, 0, 0);
	const end = new Date(start.getTime() + 3 * 3600 * 1000);

	// The publish button asks "Are you sure…?" through window.confirm; an
	// unanswered dialog is dismissed, which cancels the publish.
	page.on('dialog', (d) => void d.accept());

	// ---- Setup (not recorded): log in, prime the form page, paint the card.
	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	await gotoClean(page, formPath);
	await page.locator('#event-name').waitFor({ timeout: 20_000 });

	await showTitleCard(page, CARD);
	await page.mouse.move(1500, 640);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1: the form — what, when, who; tickets off; Create.
	await titleCardCutTo(page, CARD, formPath);
	await page.locator('#event-name').waitFor({ timeout: 20_000 });
	await page
		.getByRole('button', { name: 'Open notifications' })
		.waitFor({ timeout: 4_000 })
		.catch(() => undefined);
	narration.mark('form');
	await withOverlay(page, 'form', async () => {
		await page.waitForTimeout(700);
		const name = page.locator('#event-name');
		await name.click();
		await name.pressSequentially(EVENT_NAME, { delay: 55 });
		await page.waitForTimeout(400);
		await page.locator('#event-start').fill(toLocalInput(start));
		await page.waitForTimeout(500);
		await page.locator('#event-end').fill(toLocalInput(end));
		await page.waitForTimeout(600);

		// Who it's for: the Visibility cards. Public is the default; the click
		// is for the camera. The input is drawn as a card, so force through.
		// The cursor parks in the margin while the page glides: the option
		// cards paint crimson under a hovering pointer, and a scroll under a
		// stationary cursor would flash every card it passes.
		const publicRadio = page.locator('input[type=radio][name="visibility"][value="public"]');
		await parkMouse(page);
		await glideTo(page, publicRadio, 230, 1600);
		await page.waitForTimeout(300);
		await publicRadio.hover();
		await publicRadio.click({ force: true });
		await page.waitForTimeout(700);
		await parkMouse(page);
		await page.waitForTimeout(400);

		// The OTHER dial: Event Type, who is allowed to come. Visibility and
		// eligibility are separate settings, and the line says so — so the
		// camera visits both card groups, with the form's own "What's the
		// difference?" box between them.
		const eventTypeRadio = page.locator('input[type=radio][name="event_type"][value="public"]');
		if (await eventTypeRadio.count()) {
			await glideTo(page, eventTypeRadio, 300, 1600);
			await page.waitForTimeout(300);
			await eventTypeRadio.hover();
			await page.waitForTimeout(1500);
			await parkMouse(page);
			await page.waitForTimeout(400);
		}

		// Tickets stay off: a free RSVP night. The scroll brings it into view;
		// no hover, or the card reads as an alarm.
		const ticket = page.getByLabel('Requires Ticket');
		await glideTo(page, ticket, 380, 1600);
		await page.waitForTimeout(700);

		const createBtn = page.getByRole('button', { name: 'Create Event', exact: true });
		await glideTo(page, createBtn, 820, 1200);
		await createBtn.hover();
		// Land the click on the last words of the line, not in the middle.
		await page.waitForTimeout(Math.max(0, narration.durationFor('form') - 1200));
		await createBtn.click();
		await page.getByRole('button', { name: 'Save', exact: true }).first().waitFor({ timeout: 20_000 });
		await page.waitForTimeout(600);
	});

	// ---- Scene 2: where, and how many — then Save.
	narration.mark('details');
	await withOverlay(page, 'details', async () => {
		await page.waitForLoadState('networkidle').catch(() => undefined);
		await parkMouse(page);
		// A couple of lines about the night first. The editor is Tiptap: the
		// editable surface is the ProseMirror node inside "Basic Details".
		const editor = page
			.locator('.markdown-editor-surface .ProseMirror[contenteditable="true"]')
			.first();
		await editor.waitFor({ timeout: 10_000 });
		await glideTo(page, editor, 330, 1400);
		await editor.click();
		await editor.pressSequentially(EVENT_DESCRIPTION, { delay: 28 });
		await page.waitForTimeout(500);
		await parkMouse(page);
		const addAddress = page.getByRole('button', { name: 'Add Address' });
		await glideTo(page, addAddress, 420, 1400);
		await addAddress.hover();
		await page.waitForTimeout(300);
		await addAddress.click();
		const address = page.locator('#location-address');
		await address.waitFor({ timeout: 10_000 });
		await address.click();
		await address.pressSequentially(EVENT_ADDRESS, { delay: 55 });
		await page.waitForTimeout(600);
		await parkMouse(page);

		// Capacity lives in a collapsed accordion.
		const capToggle = page
			.getByRole('button', { name: /Capacity and waitlist/ })
			.filter({ visible: true })
			.first();
		await glideTo(page, capToggle, 300, 1400);
		if ((await capToggle.getAttribute('aria-expanded')) !== 'true') await capToggle.click();
		const cap = page.locator('#max-attendees');
		await cap.waitFor({ timeout: 10_000 });
		await cap.click();
		await cap.pressSequentially(CAPACITY, { delay: 140 });
		await page.waitForTimeout(900);

		// The bottom save bar is sticky, so Save is always in frame.
		const save = page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).last();
		await save.hover();
		await page.waitForTimeout(500);
		await save.click();
		await page.waitForURL(/\/admin\/events\/[^/]+\/edit/, { timeout: 20_000 });
		await waitHydrated(page);
		await page.getByText('Draft', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
		await page.mouse.move(1500, 640);
		await page.waitForTimeout(Math.max(0, narration.durationFor('details')));
	});

	// ---- Scene 3: it is a draft.
	narration.mark('draft');
	await withOverlay(page, 'draft', async () => {
		await parkMouse(page);
		await page.waitForTimeout(1800);
		await glideScroll(page, 520, 2600);
		await page.waitForTimeout(900);
		await glideScroll(page, -520, 2000);
		await page.waitForTimeout(300);
		const publish = page.getByRole('button', { name: 'Publish Event' });
		await publish.hover();
		await page.waitForTimeout(Math.max(0, narration.durationFor('draft')));
	});

	// ---- Scene 4: one click publishes it.
	narration.mark('open');
	await withOverlay(page, 'open', async () => {
		const publish = page.getByRole('button', { name: 'Publish Event' });
		await page.waitForTimeout(500);
		// Publishing makes the page reload itself, and the reloaded document
		// paints server-side first: a "Login / Sign Up" header and UTC times
		// for half a second before client auth lands. That flash was on camera.
		// So the reloaded document is covered, from its very first frame, with
		// a still of the page as it looks right now, and the still dissolves
		// once the account chrome and the new status badge are both up.
		const still = await page.screenshot({ type: 'jpeg', quality: 82 });
		const coverId = 'ep-publish-reload-cover';
		await page.addInitScript(
			([src, id]) => {
				try {
					if (sessionStorage.getItem(id)) return;
					sessionStorage.setItem(id, '1');
				} catch {
					/* fall through and paint */
				}
				const paint = (): boolean => {
					try {
						if (document.getElementById(id)) return true;
						const root = document.documentElement;
						if (!root) return false;
						const img = document.createElement('img');
						img.id = id;
						img.src = src;
						img.style.cssText =
							'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;object-fit:cover;';
						root.appendChild(img);
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
			[`data:image/jpeg;base64,${still.toString('base64')}`, coverId]
		);
		await publish.click();
		await page.getByText('Published', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
		await page
			.getByRole('button', { name: 'Open notifications' })
			.waitFor({ timeout: 6_000 })
			.catch(() => undefined);
		await page.mouse.move(1500, 640);
		await page.evaluate((id) => {
			const el = document.getElementById(id);
			if (!el) return;
			const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease', fill: 'forwards' });
			anim.finished.then(() => el.remove()).catch(() => el.remove());
		}, coverId);
		await page.waitForTimeout(600);
		await page.waitForTimeout(Math.max(2000, narration.durationFor('open')));
	});

	// ---- Scene 5: the public page, after a place cut.
	const eventId = page.url().match(/events\/([^/]+)\/edit/)?.[1];
	const saved = eventId ? await api(`/api/events/${eventId}`, { token: org.owner.token }) : null;
	const publicPath = saved?.slug ? `/events/${org.slug}/${saved.slug}` : `/org/${org.slug}`;
	await episodeCut(page, 'Published', 'What your people see', publicPath);
	await page
		.getByRole('button', { name: 'Open notifications' })
		.waitFor({ timeout: 4_000 })
		.catch(() => undefined);
	narration.mark('live');
	await withOverlay(page, 'live', async () => {
		// The right margin is the sidebar here, and its buttons paint crimson
		// under the pointer once the glide brings them up: park in the empty
		// space under the detail cards instead.
		await page.mouse.move(1000, 820);
		await page.waitForTimeout(2200);
		await glideScroll(page, 260, 2600);
		const yes = page.getByRole('button', { name: /Yes/ }).filter({ visible: true }).first();
		if (await yes.count()) await yes.hover();
		await page.waitForTimeout(Math.max(0, narration.durationFor('live')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
