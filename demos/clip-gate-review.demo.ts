import { test, withOverlay } from '@argo-video/cli';
import {
	gotoClean,
	waitClientAuth,
	uiLogin,
	switchUser,
	interstitialCutTo,
	revealFromInterstitial,
	glideScroll
} from './clip-helpers';

test.use({ bypassCSP: true });

const APPLICANT = 'noa.attendee@demovideo.example.com';
const OWNER = 'ren.owner@demovideo.example.com';
const PASSWORD = 'password123';
const ORG = 'shibari-circle-vienna';
const EVENT = `/events/${ORG}/intro-to-shibari-rope-and-trust`;

test('clip-gate-review', async ({ page, narration }) => {
	test.setTimeout(300_000);

	// ---- Setup (not recorded). Seeded by bootstrap_demo_video: Noa has NOT
	// applied (so she meets the gate), and three applications are already
	// waiting in Ren's queue.
	await uiLogin(page, APPLICANT, PASSWORD);
	// Auth bootstrap is waited for here, on the dashboard; every page after this
	// waits for its own content instead. Re-waiting for the bell on a heavy page
	// races and has cost takes in the other clips.
	await waitClientAuth(page);
	await gotoClean(page, EVENT);
	await page
		.getByText('Complete the required questionnaire to attend', { exact: false })
		.filter({ visible: true })
		.first()
		.waitFor({ timeout: 20_000 })
		.catch(() => undefined);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// ---- Scene 1: the door, from the outside.
	narration.mark('gate');
	await withOverlay(page, 'gate', async () => {
		await page.waitForTimeout(1200);
		const gate = page
			.getByText('Complete the required questionnaire to attend', { exact: false })
			.filter({ visible: true })
			.first();
		if (await gate.count()) {
			await gate.scrollIntoViewIfNeeded();
		} else {
			await glideScroll(page, 600, 1400);
		}
		await page.waitForTimeout(1500);
		await page.waitForTimeout(Math.max(0, narration.durationFor('gate')));
	});

	// ---- Cut to the organizer. The interstitial covers the account switch,
	// which happens on a second, UNRECORDED page in the same context.
	// The account switch happens here, in the silence after the gate line, with
	// the event page still on screen. The questionnaire's id is generated fresh
	// on every reseed, so it is looked up on a SECOND, UNRECORDED page — routing
	// the recorded page through the questionnaires list put that list on camera
	// for a beat before the queue.
	await switchUser(page, OWNER, PASSWORD);
	const lookup = await page.context().newPage();
	await lookup.goto(`/org/${ORG}/admin/questionnaires`);
	await lookup.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const qLink = lookup.locator('a[href*="/admin/questionnaires/"]').first();
	await qLink.waitFor({ state: 'attached', timeout: 20_000 });
	const href = await qLink.getAttribute('href');

	// Self-heal: the clip approves a submission on camera, and there is no API to
	// put one back to pending — but the review screen itself offers "Pending
	// Review", so walk any already-approved submission back before recording.
	// Without this the queue empties out after a few takes.
	await lookup.goto(`${href}/submissions`);
	await lookup.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await lookup.waitForLoadState('networkidle').catch(() => undefined);
	const reviewHrefs = await lookup
		.getByRole('link', { name: 'Review', exact: true })
		.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
	for (const submission of reviewHrefs.filter(Boolean)) {
		await lookup.goto(submission);
		await lookup.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
		await lookup.waitForLoadState('networkidle').catch(() => undefined);
		const reset = lookup.getByRole('button', { name: /Pending Review/ }).filter({ visible: true }).first();
		const current = await lookup
			.locator('main')
			.getByText(/^(Pending|Approved|Rejected)$/)
			.filter({ visible: true })
			.first()
			.innerText()
			.catch(() => 'Pending');
		if (current !== 'Pending' && (await reset.count())) {
			await reset.click();
			await lookup.waitForTimeout(1200);
		}
	}
	await lookup.close();

	// The transition's full-black window is only ~200ms wide, but a page needs
	// roughly 600ms to paint while the screencast is running. So a navigation
	// placed after the mark is still showing the OLD page when the fade comes
	// back up, and one placed before the mark means both sides of the fade show
	// the SAME page. Either way it reads as a stutter.
	//
	// The interstitial solves both: it paints instantly, so the fade goes
	// event page → black → title card, and the slow navigation to the queue
	// then happens as a straight cut underneath it, mid-scene.
	narration.mark('queue');
	// The card is carried ACROSS the navigation and then dissolved, so the queue
	// arrives on a soft crossfade instead of the hard cut it used to be.
	await interstitialCutTo(page, 'the other side', 'Who gets in is your decision', `${href}/submissions`, {
		holdMs: 1300
	});
	await page
		.getByRole('button', { name: 'Pending Review' })
		.filter({ visible: true })
		.first()
		.waitFor({ timeout: 20_000 })
		.catch(() => undefined);
	await revealFromInterstitial(page, 700);
	await withOverlay(page, 'queue', async () => {
		await page.waitForTimeout(600);
		const pending = page
			.getByRole('button', { name: 'Pending Review' })
			.filter({ visible: true })
			.first();
		if (await pending.count()) {
			await pending.hover();
			await page.waitForTimeout(300);
			await pending.click();
			await page.waitForTimeout(700);
		}
		await glideScroll(page, 300, 700);

		// Open one application and actually decide on it. This stays INSIDE the
		// queue scene: a scene of its own would add another fade through black
		// across a page change, which is the thing that keeps reading as a
		// stutter. "Review" is a link, and the click is a client-side navigation,
		// so the change is quick.
		const review = page.getByRole('link', { name: 'Review', exact: true }).filter({ visible: true }).first();
		if (await review.count()) {
			await review.scrollIntoViewIfNeeded();
			await review.hover();
			await page.waitForTimeout(300);
			await review.click();
			const evaluate = page
				.getByRole('heading', { name: 'Evaluate This Submission' })
				.filter({ visible: true })
				.first();
			await evaluate.waitFor({ timeout: 20_000 }).catch(() => undefined);
			await page.waitForTimeout(700);

			// Scroll far enough that the answer and the decision are both in frame
			// AND the "Already Evaluated" banner from a previous take is above the
			// viewport — it contradicts the queue we just showed.
			await glideScroll(page, 560, 1000);
			await page.waitForTimeout(600);

			// The label gains a "Current" suffix once this submission is the
			// approved one, so match on the leading word rather than the whole
			// string.
			const approve = page.getByRole('button', { name: /^Approve/ }).filter({ visible: true }).first();
			if (await approve.count()) {
				await approve.scrollIntoViewIfNeeded();
				await approve.hover();
				await page.waitForTimeout(700);
				await approve.click();
				// Hold on the result — this is the payoff of the whole scene.
				await page.waitForTimeout(2600);
			}
		}
		await page.waitForTimeout(Math.max(0, narration.durationFor('queue')));
	});
});
