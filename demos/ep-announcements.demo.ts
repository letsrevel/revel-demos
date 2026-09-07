import { test, withOverlay } from '@argo-video/cli';
import { appendFileSync } from 'node:fs';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, createEvent, registerVerifiedUser, rsvpYes } from './arrange-lib.mjs';
import { gotoClean, uiLogin, waitClientAuth, switchUser, glideScroll } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 6 · Announcements. The organizer writes "Venue change for Friday" to
// the attendees of one event and sends it; then one of those attendees finds
// it in her bell and on the event page.
const CARD = { episode: 6, title: 'Announcements', pov: 'the organizer, then an attendee' };

const ADDRESS = 'Café Korb, Brandstätte 9, 1010 Vienna, Austria';

/**
 * Org names are unique, and `createDressedOrg` resolves a clash by appending
 * "Studio" / "II" / "III" — which would put "Vinyl Listening Club IV" on camera
 * by the fourth render. Pick a district prefix that is still free instead.
 */
async function freeOrgName(): Promise<string> {
	const districts = ['Neubau', 'Josefstadt', 'Wieden', 'Margareten', 'Mariahilf', 'Alsergrund', 'Landstraße', 'Leopoldstadt', 'Ottakring', 'Hernals'];
	for (const d of districts) {
		const name = `${d} Listening Club`;
		const found = await api(`/api/organizations/?search=${encodeURIComponent(name)}&page_size=5`);
		if (!(found.results ?? []).some((o: { name: string }) => o.name === name)) return name;
	}
	return 'Vinyl Listening Club';
}

const CAST: Array<[string, string, string]> = [
	['Lena', 'Hartmann', 'lena.hartmann'],
	['Tomas', 'Berger', 'tomas.berger'],
	['Priya', 'Nair', 'priya.nair'],
	['Jonas', 'Wieser', 'jonas.wieser'],
	['Mira', 'Kovac', 'mira.kovac'],
	['Elif', 'Demir', 'elif.demir']
];

const TRACE = '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-announcements/browser-trace.log';
const trace = (line: string) => {
	try {
		appendFileSync(TRACE, `${new Date().toISOString()} ${line}\n`);
	} catch {
		/* scratch dir missing — tracing is optional */
	}
};

test('ep-announcements', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// Diagnostics: the browser's /send has been refused inside argo while the
	// same flow passes in the probe. Record what the browser actually sends.
	page.on('response', async (res) => {
		if (!res.url().includes('/announcements') || res.url().includes('/org/')) return;
		let body = '';
		try {
			body = (await res.text()).slice(0, 160);
		} catch {
			/* body unavailable */
		}
		trace(`HTTP ${res.request().method()} ${res.status()} ${new URL(res.url()).pathname} ${body}`);
	});
	page.on('requestfailed', (req) => {
		if (req.url().includes('/announcements')) trace(`FAILED ${req.method()} ${req.url()} ${req.failure()?.errorText}`);
	});
	page.on('console', (msg) => {
		if (msg.type() === 'error') trace(`CONSOLE ${msg.text().slice(0, 200)}`);
	});

	// ---- Arrange (not recorded): a listening club, one RSVP event, six people coming.
	//
	// Request budget, and why the order below matters: the backend's
	// SendAnnouncementThrottle (25/day) shares its "user" cache scope with the
	// general 100/min throttle, so the send is refused whenever the owner has
	// made more than ~25 API calls in the preceding minute. Login + dashboard
	// cost 13, an admin page load 8. So: log the owner in FIRST, let the
	// attendee registrations (~40 s, other users) push that login out of the
	// window, skip any priming load, and let the title-card cut be the only
	// admin page load before Send.
	const org = await createDressedOrg({
		name: await freeOrgName(),
		description:
			'A monthly listening session for people who still sit down for a whole record. One album, front to back, no phones, good speakers. Bring a friend and an opinion.',
		address: ADDRESS
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Friday Listening Session: Blue Train',
		description:
			'This month we sit down with Coltrane’s Blue Train, front to back, on the big speakers. Doors at half seven, needle drops at eight. Free — just say you’re coming so we know how many chairs to set out.',
		requires_ticket: false,
		max_attendees: 40,
		address: ADDRESS
	});
	const adminPath = `/org/${org.slug}/admin/announcements`;

	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	const loginAt = Date.now();

	const attendees = [];
	for (const [first, last, emailLocal] of CAST) {
		const u = await registerVerifiedUser(emailLocal.replace('.', '-'), first, last, { emailLocal });
		await rsvpYes(event.id, u.token);
		attendees.push(u);
	}
	const lena = attendees[0];
	// The RSVP itself may notify; clear it so the announcement is the one unread.
	await api('/api/notifications/mark-all-read', { method: 'POST', token: lena.token, body: {} });

	// Recording starts ~25 s before the Send click (title + draft scenes); keep
	// the login's calls a full minute behind it.
	await page.waitForTimeout(Math.max(0, loginAt + 50_000 - Date.now()));

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1: draft the announcement.
	await titleCardCutTo(page, CARD, adminPath);
	await waitClientAuth(page).catch(() => undefined);
	const newBtn = page.getByRole('button', { name: 'New Announcement' }).first();
	await newBtn.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await page.mouse.move(1500, 500);
	narration.mark('draft');
	await withOverlay(page, 'draft', async () => {
		await page.waitForTimeout(700);
		await newBtn.hover();
		await page.waitForTimeout(300);
		await newBtn.click();
		const dialog = page.getByRole('dialog');
		await dialog.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(500);

		const title = dialog.getByLabel('Title');
		await title.click();
		await title.pressSequentially('Venue change for Friday', { delay: 55 });
		await page.waitForTimeout(300);

		const body = dialog.getByRole('textbox', { name: 'Message' });
		await body.waitFor({ timeout: 10_000 });
		await body.click();
		await page.keyboard.type(
			'Friday’s session moves to the back room at Café Korb, same start time. The bar downstairs is closed for a private party, so come in through the side entrance on Brandstätte.',
			{ delay: 18 }
		);
		await page.waitForTimeout(400);

		// Recipients: the four choices, then "Event Attendees" and the event itself.
		const eventTarget = dialog.getByRole('button', { name: 'Event Attendees' });
		await dialog.getByRole('button', { name: 'All Members' }).hover();
		await page.waitForTimeout(500);
		await eventTarget.hover();
		await page.waitForTimeout(300);
		await eventTarget.click();
		const picker = dialog.getByRole('combobox');
		await picker.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(300);
		await picker.click();
		const option = dialog.getByRole('option', { name: new RegExp(event.name) });
		await option.waitFor({ timeout: 15_000 });
		await option.hover();
		await page.waitForTimeout(500);
		await option.click();
		await page.waitForTimeout(Math.max(800, narration.durationFor('draft')));
	});

	// The modal creates the draft, then fires /send as a second browser
	// call. On the shared stack that second call has been refused (a red
	// "Something went wrong" toast, the card still a draft) — which cannot be
	// healed after the fact, because it is already on camera. So: confirm the
	// send through the API and, if it did not land, abort the take loudly.
	const ensureSent = async () => {
		for (let i = 0; i < 8; i++) {
			const rows =
				(await api(`/api/organization-admin/${org.slug}/announcements?page_size=10`, { token: org.owner.token })).results ?? [];
			if (rows.some((a: { status: string }) => a.status === 'sent')) return;
			await page.waitForTimeout(600);
		}
		throw new Error('ep-announcements: the browser /send was refused (shared-stack throttling) — re-run the episode');
	};

	// ---- Scene 2: send, then the count.
	narration.mark('count');
	await withOverlay(page, 'count', async () => {
		const dialog = page.getByRole('dialog');
		const schedule = dialog.getByRole('radio', { name: 'Schedule' });
		if (await schedule.isVisible().catch(() => false)) {
			await schedule.hover();
			await page.waitForTimeout(1400);
		}
		const sendBtn = dialog.getByRole('button', { name: 'Send', exact: true });
		await sendBtn.hover();
		await page.waitForTimeout(400);
		await sendBtn.click();
		await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
		await page.getByText('Announcement sent').waitFor({ timeout: 4_000 }).catch(() => undefined);
		await ensureSent();
		await page.waitForTimeout(300);
		await page.getByRole('tab', { name: 'Sent' }).click();
		// Inactive tab panels stay in the DOM — only the visible copies count.
		const recipients = page.getByText(/\d+ recipients/).filter({ visible: true }).first();
		await recipients.waitFor({ timeout: 15_000 }).catch(() => undefined);
		await page.waitForTimeout(300);
		if (await recipients.isVisible().catch(() => false)) await recipients.hover();
		await page.waitForTimeout(Math.max(1500, narration.durationFor('count')));
	});

	// ---- Cut: Lena, one of the six, on the event page.
	// The notification row is created with an empty title/body; the worker
	// renders them afterwards. On a busy shared worker that lag has exceeded
	// the bell scene's wait, so hold the cut (off camera) until it has caught up.
	const waitRendered = async () => {
		const deadline = Date.now() + 12_000;
		while (Date.now() < deadline) {
			const inbox = await api('/api/notifications?page_size=10', { token: lena.token });
			const hit = (inbox.results ?? []).find(
				(n: { notification_type: string; title: string }) => n.notification_type === 'org_announcement' && n.title
			);
			if (hit) return;
			await page.waitForTimeout(2000);
		}
	};
	await episodeCut(page, 'Meanwhile', 'On Lena’s side', event.path, {
		during: async () => {
			await switchUser(page, lena.email, lena.password);
			await waitRendered();
		}
	});
	const bell = page.getByRole('button', { name: 'Open notifications' });
	await bell.waitFor({ timeout: 20_000 }).catch(() => undefined);
	await bell.locator('[role="status"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
	await page.mouse.move(1200, 600);

	// ---- Scene 3: the bell, the announcement, and the event page's section.
	narration.mark('inbox');
	await withOverlay(page, 'inbox', async () => {
		await page.waitForTimeout(600);
		await bell.hover();
		await page.waitForTimeout(700);
		await bell.click();
		const item = page.getByRole('button', { name: /Venue change for Friday/ }).first();
		await item.waitFor({ timeout: 15_000 });
		await page.waitForTimeout(300);
		await item.hover();
		await page.waitForTimeout(3200);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(500);

		const section = page.getByRole('heading', { name: 'Announcements' }).filter({ visible: true }).first();
		if (await section.isVisible().catch(() => false)) {
			const box = await section.boundingBox();
			// Land the section around the viewport's middle: the page ends soon
			// after it, and parking it at the top drags the footer into frame.
			if (box) await glideScroll(page, Math.max(0, box.y - 520), 1600);
			// Park the cursor on the section's count badge, beside the heading —
			// not on the announcement text the viewer is meant to read.
			const hbox = await section.boundingBox();
			if (hbox) await page.mouse.move(hbox.x + hbox.width + 22, hbox.y + hbox.height / 2, { steps: 12 });
		}
		await page.waitForTimeout(Math.max(1500, narration.durationFor('inbox')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
