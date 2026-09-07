import { test, withOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, defaultMembershipTier, makeMember, registerVerifiedUser } from './arrange-lib.mjs';
import { gotoClean, uiLogin, waitClientAuth, glideScroll } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';
import type { Page } from '@playwright/test';

test.use({ bypassCSP: true });

// Episode 10 · Polls. The organizer of an allotment society builds "Which
// night for the summer social?" in the poll builder, opens it; then Lena, one
// of the members, votes and sees the result right away.
const CARD = { episode: 10, title: 'Polls', pov: 'the organizer, then a member' };

const ADDRESS = 'Kleingartenverein Prater, Meiereistraße 20, 1020 Vienna, Austria';

/**
 * Org names are unique, and `createDressedOrg` resolves a clash by appending
 * "Studio" / "II" / "III" — which would put "Prater Allotment Society IV" on
 * camera by the fourth render. Pick a district that is still free instead.
 */
async function freeOrgName(): Promise<string> {
	const districts = ['Prater', 'Augarten', 'Donaufeld', 'Simmering', 'Floridsdorf', 'Hietzing', 'Döbling', 'Favoriten', 'Liesing', 'Penzing'];
	for (const d of districts) {
		const name = `${d} Allotment Society`;
		const found = await api(`/api/organizations/?search=${encodeURIComponent(name)}&page_size=5`);
		if (!(found.results ?? []).some((o: { name: string }) => o.name === name)) return name;
	}
	return 'Allotment Society';
}

const CAST: Array<[string, string, string]> = [
	['Lena', 'Hartmann', 'lena.hartmann'],
	['Tomas', 'Berger', 'tomas.berger'],
	['Priya', 'Nair', 'priya.nair'],
	['Jonas', 'Wieser', 'jonas.wieser'],
	['Mira', 'Kovac', 'mira.kovac']
];

interface Persona {
	email: string;
	password: string;
	token: string;
}

/**
 * Log in and land on `path` with client auth (the bell) present.
 *
 * Every author on this machine shares one IP and the API throttles per IP. A
 * burst — our own arrange step, or someone else's — can 429 a page's SSR
 * fetch and then the client's token refresh, after which the session is gone
 * for good and every reload bounces to /login. So a miss is recovered by
 * logging in AGAIN, not by reloading. And the dashboard's own bootstrap must
 * finish before we leave it: the refresh token rotates on that call, and
 * navigating away mid-flight leaves the browser holding the old cookie.
 */
async function landAuthed(page: Page, path: string, who: Persona): Promise<void> {
	for (let attempt = 0; ; attempt++) {
		await uiLogin(page, who.email, who.password);
		await waitClientAuth(page).catch(() => undefined);
		await page.waitForTimeout(800);
		await gotoClean(page, path);
		const ok = await waitClientAuth(page).then(() => true, () => false);
		if (ok && page.url().includes(path)) return;
		if (attempt >= 3) throw new Error(`client auth never landed on ${path}`);
		console.warn(`[ep-polls] auth miss on ${path} (at ${page.url()}) — logging in again`);
		await page.waitForTimeout(15_000 + attempt * 10_000);
	}
}

/**
 * Swap the context's session on an unrecorded side page, and let that page's
 * auth bootstrap settle before closing it (see `landAuthed` for why).
 */
async function switchUserSettled(page: Page, who: Persona): Promise<void> {
	const side = await page.context().newPage();
	await side.goto('/logout');
	await side.waitForURL(/logged_out/, { timeout: 15_000 }).catch(() => undefined);
	await uiLogin(side, who.email, who.password);
	await waitClientAuth(side).catch(() => undefined);
	await side.waitForTimeout(800);
	await side.close();
}

/** Glide so that `el` sits roughly `offset` px from the top of the viewport. */
async function glideTo(page: Page, el: ReturnType<Page['locator']>, offset: number, ms: number): Promise<void> {
	const box = await el.boundingBox();
	if (!box) return;
	const delta = box.y - offset;
	if (Math.abs(delta) > 24) await glideScroll(page, delta, ms);
}

/**
 * Glide only as far as needed for `el` to be inside the viewport with some
 * margin — and not at all when it already is. Scrolling to a target that is
 * already on screen is what pushed the footer into frame on the first render.
 */
async function glideIntoView(
	page: Page,
	el: ReturnType<Page['locator']>,
	{ top = 140, bottom = 90, ms = 800 }: { top?: number; bottom?: number; ms?: number } = {}
): Promise<void> {
	const box = await el.boundingBox();
	if (!box) return;
	const vh = page.viewportSize()?.height ?? 1080;
	let delta = 0;
	if (box.y < top) delta = box.y - top;
	else if (box.y + box.height > vh - bottom) delta = box.y + box.height - (vh - bottom);
	if (Math.abs(delta) > 8) await glideScroll(page, delta, ms);
}

test('ep-polls', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): an allotment society with five members.
	const org = await createDressedOrg({
		name: await freeOrgName(),
		description:
			'Forty garden plots behind the Prater, and the people who tend them. We share tools, seedlings and a long table in the courtyard. One social a season, weather permitting.',
		address: ADDRESS
	});
	const tier = await defaultMembershipTier(org.slug, org.owner.token);
	const members: Persona[] = [];
	for (const [first, last, emailLocal] of CAST) {
		const u = await registerVerifiedUser(emailLocal.replace('.', '-'), first, last, { emailLocal });
		await makeMember(org.slug, u.token, org.owner.token, tier.id);
		members.push(u);
	}
	const lena = members[0];
	const builderPath = `/org/${org.slug}/admin/polls/new`;

	// ---- Owner in, builder primed on this very page (bundle cache, client auth).
	// Let the per-minute throttle window breathe after the arrange burst first.
	await page.waitForTimeout(6000);
	await landAuthed(page, builderPath, org.owner);
	await page.getByLabel('Poll name').waitFor({ timeout: 15_000 });
	await page.waitForTimeout(800);

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1: the question, the audience, the rules.
	await titleCardCutTo(page, CARD, builderPath);
	await waitClientAuth(page).catch(() => undefined);
	const nameInput = page.getByLabel('Poll name');
	await nameInput.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await page.mouse.move(1500, 420);
	narration.mark('create');
	await withOverlay(page, 'create', async () => {
		await page.waitForTimeout(600);
		await nameInput.click();
		await nameInput.pressSequentially('Which night for the summer social?', { delay: 50 });
		await page.waitForTimeout(250);

		const desc = page.getByRole('textbox', { name: /Description/ });
		if (await desc.isVisible().catch(() => false)) {
			await desc.click();
			await page.keyboard.type('One evening in July at the courtyard table. Most votes wins.', { delay: 16 });
			await page.waitForTimeout(300);
		}

		// Who can vote: open the list so the six audiences are seen, then Members only.
		const voteSel = page.locator('#vote-visibility');
		await voteSel.hover();
		await page.waitForTimeout(250);
		await voteSel.click();
		const membersOpt = page.getByRole('option', { name: 'Members only' });
		await membersOpt.waitFor({ timeout: 10_000 });
		await page.getByRole('option', { name: 'Public' }).hover();
		await page.waitForTimeout(450);
		await page.getByRole('option', { name: 'Attendees only' }).hover();
		await page.waitForTimeout(450);
		await membersOpt.hover();
		await page.waitForTimeout(300);
		await membersOpt.click();
		await page.waitForTimeout(400);

		// Who can see results → Members only.
		const resultSel = page.locator('#result-visibility');
		await resultSel.hover();
		await page.waitForTimeout(250);
		await resultSel.click();
		const resMembers = page.getByRole('option', { name: 'Members only' });
		await resMembers.waitFor({ timeout: 10_000 });
		await resMembers.hover();
		await page.waitForTimeout(300);
		await resMembers.click();
		await page.waitForTimeout(400);

		// When voters see results → After voting.
		const timingSel = page.locator('#result-timing');
		await glideTo(page, timingSel, 420, 900);
		await timingSel.hover();
		await page.waitForTimeout(250);
		await timingSel.click();
		const afterVote = page.getByRole('option', { name: 'After voting' });
		await afterVote.waitFor({ timeout: 10_000 });
		await afterVote.hover();
		await page.waitForTimeout(300);
		await afterVote.click();
		await page.waitForTimeout(300);

		// The anonymity checkboxes — hover them for the "anonymous or not" line.
		const anon = page.getByLabel('Hide voter identities from voters');
		if (await anon.isVisible().catch(() => false)) {
			await anon.hover();
		}
		await page.waitForTimeout(1000);
		// Drift down to the Questions card while the line finishes, so the next
		// scene opens on it rather than scrolling to it. 480 from the top keeps
		// the Schedule card above it and the footer mostly out of frame.
		await glideTo(page, page.getByRole('button', { name: 'Multiple Choice' }), 480, 1800);
		await page.waitForTimeout(Math.max(600, narration.durationFor('create')));
	});

	// ---- Scene 2: the options, then Create.
	narration.mark('options');
	await withOverlay(page, 'options', async () => {
		const mcBtn = page.getByRole('button', { name: 'Multiple Choice' });
		await glideIntoView(page, mcBtn, { top: 200, bottom: 300, ms: 900 });
		await page.waitForTimeout(200);
		await mcBtn.hover();
		await page.waitForTimeout(300);
		await mcBtn.click();
		const qText = page.getByRole('textbox', { name: /Question Text/ });
		await qText.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(300);
		// Question text near the top, so the question AND its options share the frame.
		await glideTo(page, qText, 240, 900);
		await qText.click();
		await page.keyboard.type('Which night works for you?', { delay: 40 });
		await page.waitForTimeout(250);

		const opt1 = page.getByPlaceholder('Option 1');
		const opt2 = page.getByPlaceholder('Option 2');
		await glideIntoView(page, opt2);
		await opt1.click();
		await opt1.pressSequentially('Friday 24 July', { delay: 40 });
		await opt2.click();
		await opt2.pressSequentially('Saturday 25 July', { delay: 40 });
		const addOpt = page.getByRole('button', { name: 'Add Option' });
		await addOpt.hover();
		await page.waitForTimeout(200);
		await addOpt.click();
		const opt3 = page.getByPlaceholder('Option 3');
		await opt3.waitFor({ timeout: 5_000 });
		await glideIntoView(page, opt3);
		await opt3.click();
		await opt3.pressSequentially('Sunday afternoon, 26 July', { delay: 40 });
		await page.waitForTimeout(250);

		// Dates read best in order — turn per-voter shuffling off.
		const shuffle = page.getByLabel('Shuffle answer options for each user');
		if (await shuffle.isVisible().catch(() => false)) {
			await glideIntoView(page, shuffle, { ms: 700 });
			if ((await shuffle.getAttribute('aria-checked')) === 'true') await shuffle.click();
		}

		// Hold the click until the line is nearly over, so "Create it" lands on it.
		const remaining = narration.durationFor('options');
		if (remaining > 4000) await page.waitForTimeout(remaining - 4000);
		const createBtn = page.getByRole('button', { name: 'Create poll' });
		await glideIntoView(page, createBtn, { bottom: 120, ms: 800 });
		await createBtn.hover();
		await page.waitForTimeout(350);
		await createBtn.click();
		await page.waitForURL(/\/admin\/polls\/[0-9a-f-]{36}$/, { timeout: 20_000 });
		await page.getByRole('button', { name: 'Open poll' }).waitFor({ timeout: 15_000 });
		await page.mouse.move(1500, 700);
		await page.waitForTimeout(Math.max(600, narration.durationFor('options')));
	});
	const pollId = page.url().split('/').pop() as string;
	const voterPath = `/org/${org.slug}/polls/${pollId}`;

	// ---- Scene 3: open it.
	narration.mark('open');
	await withOverlay(page, 'open', async () => {
		const openBtn = page.getByRole('button', { name: 'Open poll' });
		await page.waitForTimeout(500);
		await openBtn.hover();
		await page.waitForTimeout(500);
		await openBtn.click();
		const closeBtn = page.getByRole('button', { name: 'Close poll' });
		await closeBtn.waitFor({ timeout: 15_000 });
		await page.waitForTimeout(700);
		const strip = page.getByLabel('Poll share URL');
		if (await strip.isVisible().catch(() => false)) {
			await strip.hover();
			await page.waitForTimeout(1500);
			const copy = page.getByRole('button', { name: 'Copy link' });
			if (await copy.isVisible().catch(() => false)) await copy.hover();
			await page.waitForTimeout(1200);
		}
		await closeBtn.hover();
		await page.waitForTimeout(Math.max(800, narration.durationFor('open')));
	});

	// ---- Cut: four members vote through the API (the poll must be OPEN first),
	// then Lena's session takes over the browser.
	await episodeCut(page, 'Meanwhile', 'On Lena’s side', voterPath, {
		during: async () => {
			const detail = await api(`/api/polls/${pollId}/`, { token: org.owner.token });
			const q = detail.questionnaire.multiple_choice_questions[0];
			const byText: Record<string, string> = Object.fromEntries(
				q.options.map((o: { option: string; id: string }) => [o.option, o.id])
			);
			const votes: Array<[Persona, string]> = [
				[members[1], 'Friday 24 July'],
				[members[2], 'Saturday 25 July'],
				[members[3], 'Saturday 25 July'],
				[members[4], 'Sunday afternoon, 26 July']
			];
			for (const [u, choice] of votes) {
				await api(`/api/polls/${pollId}/vote`, {
					token: u.token,
					body: {
						mc_answers: [{ question_id: q.id, option_ids: [byText[choice]] }],
						free_text_answers: [],
						file_upload_answers: []
					}
				});
			}
			await switchUserSettled(page, lena);
		}
	});
	await waitClientAuth(page).catch(() => undefined);
	const saturday = page.getByRole('radio', { name: 'Saturday 25 July' });
	await saturday.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await page.mouse.move(1500, 520);

	// ---- Scene 4: the rules, then the vote.
	narration.mark('vote');
	await withOverlay(page, 'vote', async () => {
		await page.waitForTimeout(900);
		const canVote = page.getByText(/Who can vote:/).first();
		if (await canVote.isVisible().catch(() => false)) {
			await canVote.hover();
			await page.waitForTimeout(1300);
		}
		const seeResults = page.getByText(/Results visible to:/).first();
		if (await seeResults.isVisible().catch(() => false)) {
			await seeResults.hover();
			await page.waitForTimeout(1300);
		}
		const hidden = page.getByText(/identity is hidden/).first();
		if (await hidden.isVisible().catch(() => false)) {
			await hidden.hover();
			await page.waitForTimeout(1300);
		}
		await glideIntoView(page, saturday, { bottom: 200 });
		await saturday.hover();
		await page.waitForTimeout(500);
		await saturday.click();
		await page.waitForTimeout(700);
		const submit = page.getByRole('button', { name: 'Submit vote' });
		await submit.hover();
		// Land the submit on "and submit", near the end of the line.
		const remaining = narration.durationFor('vote');
		if (remaining > 2200) await page.waitForTimeout(remaining - 2200);
		await submit.click();
		await page.getByText('You voted on this poll.').waitFor({ timeout: 15_000 }).catch(() => undefined);
		await page.waitForTimeout(Math.max(500, narration.durationFor('vote')));
	});

	// ---- Scene 5: results, right there.
	narration.mark('results');
	await withOverlay(page, 'results', async () => {
		const heading = page.getByRole('heading', { name: 'Results' }).filter({ visible: true }).first();
		await heading.waitFor({ timeout: 15_000 }).catch(() => undefined);
		const voters = page.getByText(/\d+ voters?/).first();
		await voters.waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(400);
		if (await heading.isVisible().catch(() => false)) {
			// The voted page is short (band, rules, banner, results): it fits, so
			// this is a no-op unless the bars really are below the fold.
			const responses = page.getByText(/\d+ responses?$/).first();
			if (await responses.isVisible().catch(() => false)) await glideIntoView(page, responses, { bottom: 120, ms: 1200 });
			else await glideIntoView(page, heading, { top: 260, ms: 1200 });
			// Park the cursor beside the heading, off the bars the viewer reads.
			const box = await heading.boundingBox();
			if (box) await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2, { steps: 12 });
		}
		await page.waitForTimeout(Math.max(1200, narration.durationFor('results')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
