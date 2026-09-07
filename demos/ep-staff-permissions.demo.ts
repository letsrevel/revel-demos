import { test, withOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, createEvent, createTier, deleteDefaultTier, registerVerifiedUser, makeMember, defaultMembershipTier } from './arrange-lib.mjs';
import { gotoClean, uiLogin, waitClientAuth, glideScroll } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';
import type { Page } from '@playwright/test';

test.use({ bypassCSP: true });

// Episode 7 · Staff and permissions. The owner of a cellar theatre makes a
// member staff and trims his permissions down to exactly two — the door and
// the ticket list. Then, signed in as that staff member, the admin area opens
// on what he was ticked for and shuts on what he wasn't.
const CARD = { episode: 7, title: 'Staff and permissions', pov: 'the owner, then a staff member' };

const ADDRESS = 'Kellertheater, Schleifmühlgasse 12, 1040 Vienna, Austria';

/**
 * Org names are unique, and `createDressedOrg` resolves a clash by appending
 * "Studio" / "II" / "III" — which would put "Kellertheater IV" on camera by
 * the fourth render. Pick a district prefix that is still free instead.
 */
async function freeOrgName(): Promise<string> {
	const districts = ['Wieden', 'Neubau', 'Josefstadt', 'Margareten', 'Mariahilf', 'Alsergrund', 'Landstraße', 'Leopoldstadt', 'Ottakring', 'Hernals'];
	for (const d of districts) {
		const name = `${d} Kellertheater`;
		const found = await api(`/api/organizations/?search=${encodeURIComponent(name)}&page_size=5`);
		if (!(found.results ?? []).some((o: { name: string }) => o.name === name)) return name;
	}
	return 'Kellertheater Collective';
}

/** Ticket holders, so the door list is a list and not an empty state. */
const HOLDERS: Array<[string, string, string]> = [
	['Lena', 'Hartmann', 'lena.hartmann'],
	['Tomas', 'Berger', 'tomas.berger'],
	['Priya', 'Nair', 'priya.nair'],
	['Elif', 'Demir', 'elif.demir']
];

/** The two permissions Felix keeps. Everything else in the editor gets unticked. */
const KEEP = new Set(['check_in_attendees', 'manage_tickets']);

/**
 * Sign in and let the session SETTLE before going anywhere else.
 *
 * `uiLogin` returns the moment the URL is /dashboard, while the dashboard's
 * own auth bootstrap is still refreshing the token. Refresh tokens rotate and
 * the old one is blacklisted on use — so navigating away mid-refresh can
 * leave the browser holding a dead cookie, and the next page's bootstrap
 * then reads as "logged out" and clears the session. The bell is the sign
 * that the refresh has completed and the rotated cookie is stored.
 */
async function loginSettled(p: Page, email: string, password: string): Promise<void> {
	await uiLogin(p, email, password);
	await waitClientAuth(p);
}

/**
 * Sign `email` in on an unrecorded side page and prime `path` there, so the
 * recorded page's cut lands on a document whose bundle is cached and whose
 * client auth is known to work. On a busy shared stack the client bootstrap
 * can miss once (a throttled refresh reads as "logged out" and drops the
 * session), so the whole thing is retried off camera rather than discovered
 * on it.
 */
async function switchUserWarm(page: Page, email: string, password: string, path: string): Promise<void> {
	for (let attempt = 0; ; attempt++) {
		const side = await page.context().newPage();
		try {
			await side.goto('/logout');
			await side.waitForURL(/logged_out/, { timeout: 15_000 }).catch(() => undefined);
			await loginSettled(side, email, password);
			await side.goto(path);
			await side.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
			await waitClientAuth(side);
			return;
		} catch (err) {
			if (attempt >= 2) throw err;
			console.warn(`[switchUserWarm] ${email}: client auth missed on ${path} — retrying`);
			await side.waitForTimeout(5000);
		} finally {
			await side.close();
		}
	}
}

test('ep-staff-permissions', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a cellar theatre, one free-ticketed night
	// with four ticket holders, and Felix — a member about to become staff.
	const org = await createDressedOrg({
		name: await freeOrgName(),
		description:
			'A forty-seat cellar theatre run by the people who perform in it. Cabaret, small plays, the occasional very late poetry night. Tickets are free or cheap; the bar keeps the lights on.',
		address: ADDRESS
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Autumn Cabaret Night',
		description:
			'Four acts, one piano, and a bar that opens at seven. Doors at half seven, first act at eight. Free entry — grab a ticket so we know how many chairs to put out.',
		max_attendees: 40,
		address: ADDRESS
	});
	// The auto-created default tier is `offline`, whose tickets sit as "Pending"
	// on the door list. A free tier issues them outright.
	await deleteDefaultTier(event.id, org.owner.token);
	const tier = await createTier(event.id, org.owner.token, { name: 'Free entry', total_quantity: 40 });
	for (const [first, last, emailLocal] of HOLDERS) {
		const u = await registerVerifiedUser(emailLocal.replace('.', '-'), first, last, { emailLocal });
		await api(`/api/events/${event.id}/tickets/${tier.id}/checkout`, {
			token: u.token,
			body: { tickets: [{ guest_name: `${first} ${last}` }] }
		});
	}
	const felix = await registerVerifiedUser('felix-brandl', 'Felix', 'Brandl', { emailLocal: 'felix.brandl' });
	const mtier = await defaultMembershipTier(org.slug, org.owner.token);
	await makeMember(org.slug, felix.token, org.owner.token, mtier.id);
	const felixName = `${felix.firstName} ${felix.lastName}`;

	const membersPath = `/org/${org.slug}/admin/members`;
	const adminPath = `/org/${org.slug}/admin`;

	// ---- Owner in, and the members page primed on this very page (bundle
	// cache, client auth), so the cut off the title card lands on a painted
	// roster. The bell is the sign that client auth has landed; on a busy
	// shared stack the bootstrap can miss once, and off camera a reload is cheap.
	for (let attempt = 0; ; attempt++) {
		// A miss may have cleared the cookies (see loginSettled), so each retry
		// signs in again rather than merely reloading.
		await loginSettled(page, org.owner.email, org.owner.password).catch(() => undefined);
		await gotoClean(page, membersPath);
		const ok = await waitClientAuth(page).then(() => true, () => false);
		if (ok) break;
		if (attempt >= 3) throw new Error('client auth never landed on the members page');
		console.warn(`[ep-staff-permissions] client auth missed on ${membersPath} — signing in again`);
		await page.waitForTimeout(8000 + attempt * 4000);
	}
	await page.getByRole('button', { name: `Manage ${felixName}` }).waitFor({ timeout: 15_000 });

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1: Felix's member card → Make Staff Member.
	await titleCardCutTo(page, CARD, membersPath);
	await waitClientAuth(page).catch(() => undefined);
	const manageBtn = page.getByRole('button', { name: `Manage ${felixName}` });
	await manageBtn.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await page.mouse.move(1500, 700);
	narration.mark('promote');
	await withOverlay(page, 'promote', async () => {
		// The line: "…helping on the door for months. Under Members, open his
		// card, and make him staff." — click at "open his card", promote at
		// "make him staff", then the Staff badge holds for the rest.
		await page.waitForTimeout(2600);
		await manageBtn.hover();
		await page.waitForTimeout(700);
		await manageBtn.click();
		const dialog = page.getByRole('dialog');
		await dialog.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(2200);
		const makeStaff = dialog.getByRole('button', { name: 'Make Staff Member' });
		await makeStaff.hover();
		await page.waitForTimeout(900);
		await makeStaff.click();
		// No confirm step: the button promotes straight away (with the default
		// staff set) and the modal closes on success.
		await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
		// Park the cursor beside the card, off the new Staff badge.
		await page.mouse.move(1500, 700, { steps: 12 });
		await page.waitForTimeout(Math.max(1200, narration.durationFor('promote')));
	});

	// ---- Scene 2: Staff tab → Permissions → down to two → Save.
	narration.mark('permissions');
	await withOverlay(page, 'permissions', async () => {
		const staffTab = page.getByRole('tab', { name: /^Staff/ });
		await staffTab.hover();
		await page.waitForTimeout(300);
		await staffTab.click();
		const editBtn = page.getByRole('button', { name: `Edit permissions for ${felixName}` });
		await editBtn.waitFor({ timeout: 15_000 });
		await page.waitForTimeout(700);
		await editBtn.hover();
		await page.waitForTimeout(400);
		await editBtn.click();
		const editor = page.getByRole('dialog');
		await editor.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(900);

		// Walk the boxes top to bottom, unticking everything but the two kept.
		// Playwright scrolls the dialog as it goes, so the viewer follows the
		// list down through the groups.
		const boxes = editor.getByRole('checkbox');
		const n = await boxes.count();
		for (let i = 0; i < n; i++) {
			const box = boxes.nth(i);
			const id = (await box.getAttribute('id')) ?? '';
			const checked = (await box.getAttribute('aria-checked')) === 'true';
			if (KEEP.has(id)) {
				// A beat on the ones that stay, so they read as deliberate.
				await box.hover();
				await page.waitForTimeout(650);
				continue;
			}
			if (checked) {
				await box.hover();
				await page.waitForTimeout(220);
				await box.click();
				await page.waitForTimeout(260);
			}
		}
		await page.waitForTimeout(500);
		const save = editor.getByRole('button', { name: 'Save Changes' });
		await save.hover();
		await page.waitForTimeout(500);
		await save.click();
		await editor.waitFor({ state: 'hidden', timeout: 20_000 });
		await page.getByText('2 permissions granted').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.mouse.move(1500, 760, { steps: 12 });
		await page.waitForTimeout(Math.max(1500, narration.durationFor('permissions')));
	});

	// ---- Cut: Felix, signed in, on the same organization's admin.
	await episodeCut(page, 'Meanwhile', 'Signed in as Felix', adminPath, {
		during: () => switchUserWarm(page, felix.email, felix.password, adminPath)
	});
	// SSR paints the logged-out header until client auth lands; wait for the
	// account chrome, bounded and swallowed — a screen that never arrives is
	// worse than a flash.
	await waitClientAuth(page).catch(() => undefined);
	await page.mouse.move(1500, 320);

	// ---- Scene 3: the staff badge, then the Tickets link → the door list.
	narration.mark('limited');
	await withOverlay(page, 'limited', async () => {
		// The line spends its first ~8 s on the dashboard (the badge, the menu),
		// so stay there: rest on the Staff badge, then drift along the admin
		// menu, and only click Tickets at "the ticket list… yes".
		await page.waitForTimeout(900);
		const badge = page.getByText('Staff', { exact: true }).filter({ visible: true }).first();
		if (await badge.isVisible().catch(() => false)) {
			await badge.hover();
			await page.waitForTimeout(2200);
		}
		const settingsLink = page.getByRole('link', { name: 'Settings', exact: true }).filter({ visible: true }).first();
		const membersNav = page.getByRole('link', { name: 'Members', exact: true }).filter({ visible: true }).first();
		if (await settingsLink.isVisible().catch(() => false)) {
			await settingsLink.hover();
			await page.waitForTimeout(900);
			const box = await membersNav.boundingBox().catch(() => null);
			if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
			await page.waitForTimeout(1500);
		}
		const ticketsLink = page.getByRole('link', { name: 'Tickets', exact: true }).filter({ visible: true }).first();
		await ticketsLink.hover();
		await page.waitForTimeout(700);
		await ticketsLink.click();
		// The org-wide tickets page redirects to the only ticketed event's list.
		await page.getByRole('heading', { name: 'Manage Tickets' }).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
		await page.waitForLoadState('networkidle').catch(() => undefined);
		await page.waitForTimeout(600);
		// Bring the counts and the first rows into frame, cursor off the names.
		await glideScroll(page, 260, 1600);
		await page.mouse.move(1700, 560, { steps: 10 });
		await page.waitForTimeout(Math.max(1500, narration.durationFor('limited')));
	});

	// ---- Scene 4: Members → Access Denied.
	narration.mark('denied');
	await withOverlay(page, 'denied', async () => {
		await page.waitForTimeout(400);
		const membersLink = page.getByRole('link', { name: 'Members', exact: true }).filter({ visible: true }).first();
		await membersLink.hover();
		await page.waitForTimeout(600);
		await membersLink.click();
		await page.getByRole('heading', { name: 'Access Denied' }).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
		await page.mouse.move(1500, 800, { steps: 12 });
		await page.waitForTimeout(Math.max(1500, narration.durationFor('denied')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
