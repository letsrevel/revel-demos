import { test, showOverlay, withOverlay } from '@argo-video/cli';
import type { Locator, Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { api, login, registerVerifiedUser, attachQuestionnaire, innerQuestionnaireId } from './arrange-lib.mjs';
import { glideScroll, uiLogin, waitClientAuth, switchUser } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 13 · "The questionnaire gate". The seeded Shibari Circle Vienna
// flagship is a one-question, questionnaire-gated workshop that other clips
// film, so it is left untouched. Every run duplicates it into an "October"
// edition, swaps the copy's questionnaire for a fresh two-section, five-question
// one, and registers a fresh applicant — then films her applying, Ren reading
// the answers and approving, and the free tier unlocking.
const CARD = { episode: 13, title: 'The questionnaire gate', pov: 'an applicant, then the organizer' };
const ORG = 'shibari-circle-vienna';
const OWNER = { email: 'ren.owner@demovideo.example.com', password: 'password123' };
const SEEDED_SLUG = 'intro-to-shibari-rope-and-trust';
const COPY_NAME = 'Intro to Shibari — Rope & Trust · October';
const Q_NAME = 'Workshop Application · October';

const ANSWERS = {
	experience: 'None — complete beginner',
	partner: 'No, on my own',
	hope: 'How to tie safely, and how to talk about what I want before the rope comes out.',
	injuries: 'A stiff left shoulder — nothing serious, but please no tight overhead ties.',
	consent: 'Yes, I have read them',
	note: 'Welcome, Noa — see you in October.'
};

interface Question {
	id: string;
	question: string;
}
interface Section {
	multiplechoicequestion_questions: Question[];
	freetextquestion_questions: Question[];
}

async function arrange() {
	const ownerToken: string = await login(OWNER.email, OWNER.password);
	const seeded = await api(`/api/events/${ORG}/event/${SEEDED_SLUG}`);
	const orgId: string = seeded.organization.id;

	// Self-healing: retire the copies and questionnaires left by earlier takes.
	// The event DELETE commits and then a post-commit hook 500s on the missing
	// row (backend #937), so the rejection is expected and the row is gone.
	const stale = await api(`/api/events/?organization_slug=${ORG}&search=October&page_size=50`, { token: ownerToken });
	for (const old of (stale.results ?? []).filter((e: { name: string }) => e.name === COPY_NAME)) {
		await api(`/api/event-admin/${old.id}`, { method: 'DELETE', token: ownerToken }).catch(() => undefined);
	}
	const qs = await api(`/api/questionnaires/?organization_id=${orgId}&page_size=50`, { token: ownerToken });
	for (const old of (qs.results ?? []).filter((q: { questionnaire?: { name: string } }) => q.questionnaire?.name === Q_NAME)) {
		await api(`/api/questionnaires/${old.id}`, { method: 'DELETE', token: ownerToken }).catch(() => undefined);
	}
	const seededQ = (qs.results ?? []).find((q: { events?: { id: string }[] }) => q.events?.some((e) => e.id === seeded.id));
	if (!seededQ) throw new Error('seeded questionnaire not found on the flagship event');

	// Duplicate as the October edition (a Sunday evening, like the original),
	// open it, and detach the seeded one-question questionnaire from the COPY.
	const copy = await api(`/api/event-admin/${seeded.id}/duplicate`, {
		token: ownerToken,
		body: { name: COPY_NAME, start: new Date('2026-10-11T17:00:00Z').toISOString() }
	});
	await api(`/api/event-admin/${copy.id}/actions/update-status/open`, { method: 'POST', token: ownerToken, body: {} });
	await api(`/api/questionnaires/${seededQ.id}/events/${copy.id}`, { method: 'DELETE', token: ownerToken });

	// Every option is marked "correct": the review screen badges each answer
	// either Correct or Incorrect, and a manual questionnaire has no wrong
	// answers — without this, "None — complete beginner" reads "Incorrect".
	const opt = (option: string, order: number) => ({ option, order, is_correct: true });
	const q = await attachQuestionnaire(orgId, copy.id, ownerToken, {
		name: Q_NAME,
		description:
			'We keep these evenings small and balanced. A few questions so we can pair people well and look after everyone — a person reads every answer, usually within a day or two.',
		evaluation_mode: 'manual',
		status: 'published',
		min_score: 0,
		sections: [
			{
				name: 'Your rope experience',
				order: 1,
				multiplechoicequestion_questions: [
					{
						question: 'How much rope experience do you have?',
						is_mandatory: true,
						order: 1,
						shuffle_options: false,
						options: [opt('None — complete beginner', 1), opt('A few workshops', 2), opt('Regular practice', 3)]
					},
					{
						question: 'Are you coming with a partner?',
						is_mandatory: true,
						order: 2,
						shuffle_options: false,
						options: [opt('Yes, together', 1), opt('No, on my own', 2)]
					}
				],
				freetextquestion_questions: [
					{
						question: 'What do you hope to learn or take away from the evening?',
						hint: 'A sentence or two is plenty.',
						is_mandatory: true,
						order: 3
					}
				]
			},
			{
				name: 'Safety and consent',
				order: 2,
				freetextquestion_questions: [
					{
						question: 'Any injuries, conditions or limits the instructors should know about?',
						hint: 'Shared only with the instructors on the night.',
						is_mandatory: true,
						order: 1
					}
				],
				multiplechoicequestion_questions: [
					{
						question: 'Have you read the house rules on consent and aftercare?',
						is_mandatory: true,
						order: 2,
						shuffle_options: false,
						options: [opt('Yes, I have read them', 1)]
					}
				]
			}
		]
	});
	const innerId: string = await innerQuestionnaireId(q.id, ownerToken);
	const detail = await api(`/api/questionnaires/${q.id}`, { token: ownerToken });
	const sections: Section[] = detail.questionnaire.sections ?? [];
	const findQ = (re: RegExp): Question => {
		for (const s of sections) {
			for (const x of [...s.multiplechoicequestion_questions, ...s.freetextquestion_questions]) {
				if (re.test(x.question)) return x;
			}
		}
		throw new Error(`question not found: ${re}`);
	};

	const applicant = await registerVerifiedUser('applicant', 'Noa', 'Beckmann', { emailLocal: 'noa.beckmann' });
	const status = await api(`/api/events/${copy.id}/my-status`, { token: applicant.token });
	if (status.allowed !== false || !String(status.reason_code).includes('questionnaire')) {
		throw new Error(`applicant is not gated by the questionnaire: ${JSON.stringify(status)}`);
	}

	const eventPath = `/events/${ORG}/${copy.slug}`;
	return {
		eventPath,
		fillPath: `${eventPath}/questionnaire/${innerId}`,
		submissionsPath: `/org/${ORG}/admin/questionnaires/${q.id}/submissions`,
		applicant,
		hopeId: findQ(/hope to learn/).id,
		injuriesId: findQ(/injuries/).id
	};
}

/** Type like a person, not a paste; re-fill if the hydration window ate keys. */
async function typeSlowly(page: Page, box: Locator, text: string, delay = 30) {
	await box.click();
	// Focus stays in the box; park the cursor off the words being typed.
	const b = await box.boundingBox().catch(() => null);
	if (b) await page.mouse.move(Math.min(1880, b.x + b.width + 60), b.y + b.height / 2, { steps: 6 });
	await box.pressSequentially(text, { delay });
	if ((await box.inputValue()) !== text) await box.fill(text);
}

/** Glide so `target` sits about `y` px from the top of the viewport. */
async function glideTo(page: Page, target: Locator, y = 480, ms = 900) {
	const box = await target.boundingBox().catch(() => null);
	if (!box) return;
	const delta = Math.round(box.y - y);
	if (Math.abs(delta) > 40) await glideScroll(page, delta, ms);
}

test('ep-questionnaire-gate', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded).
	const { eventPath, fillPath, submissionsPath, applicant, hopeId, injuriesId } = await arrange();

	// ---- Setup (not recorded): the applicant is logged in on the recorded
	// page. No bundle-priming side page: closing one mid-auth-refresh drops
	// the rotated cookie and the recorded page's next load lands on /login
	// (take two of this episode). The title card covers the first load.
	await uiLogin(page, applicant.email, applicant.password);
	await waitClientAuth(page);

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: the gate, from the outside.
	await titleCardCutTo(page, CARD, eventPath);
	// Two "Complete Questionnaire" buttons render: one in the sidebar card and
	// one inside Ticket Options, next to the locked tier. The scene glides down
	// to the latter, so the free tier and the gate share the frame.
	const ctas = page.getByRole('button', { name: 'Complete Questionnaire' }).filter({ visible: true });
	await ctas.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
	await page.mouse.move(760, 640);
	narration.mark('gate');
	await withOverlay(page, 'gate', async () => {
		await page.waitForTimeout(1600);
		const options = page.getByRole('heading', { name: 'Ticket Options' }).filter({ visible: true }).first();
		await glideTo(page, options, 250, 1800);
		await page.waitForTimeout(400);
		// The main-column button is the one under the heading (x well left of
		// the sidebar); fall back to whichever is first.
		let cta = ctas.first();
		for (let i = 0; i < (await ctas.count()); i++) {
			const box = await ctas.nth(i).boundingBox().catch(() => null);
			if (box && box.x < 1150) {
				cta = ctas.nth(i);
				break;
			}
		}
		const box = await cta.boundingBox().catch(() => null);
		if (box) {
			await page.mouse.move(box.x + box.width * 0.75, box.y + box.height + 90, { steps: 16 });
			await page.waitForTimeout(500);
			await cta.hover();
		}
		// durationFor already means "remaining from now" — never subtract.
		await page.waitForTimeout(Math.max(1200, narration.durationFor('gate')));
		// The click lands as the line ends, so the next scene opens on the form.
		await cta.click();
		await page.waitForURL(/\/questionnaire\//, { timeout: 15_000 });
		await page.getByRole('radio', { name: ANSWERS.experience }).waitFor({ timeout: 15_000 });
		await page.waitForLoadState('networkidle').catch(() => undefined);
		await page.waitForTimeout(500);
	});

	// ---- Scene: fill every question on camera.
	narration.mark('fill');
	await withOverlay(page, 'fill', async () => {
		const pick = async (name: string, role: 'radio' | 'checkbox') => {
			const control = page.getByRole(role, { name });
			await glideTo(page, control, 560);
			await control.hover();
			await page.waitForTimeout(350);
			await control.click();
			await page.waitForTimeout(700);
		};
		await page.waitForTimeout(900);
		await pick(ANSWERS.experience, 'radio');
		await pick(ANSWERS.partner, 'radio');

		const hope = page.locator(`[id="${hopeId}"]`);
		await glideTo(page, hope, 520);
		await typeSlowly(page, hope, ANSWERS.hope);
		await page.mouse.move(1500, 560, { steps: 8 });
		await page.waitForTimeout(500);

		const injuries = page.locator(`[id="${injuriesId}"]`);
		await glideTo(page, injuries, 480);
		await typeSlowly(page, injuries, ANSWERS.injuries);
		await page.mouse.move(1500, 560, { steps: 8 });
		await page.waitForTimeout(500);

		await pick(ANSWERS.consent, 'checkbox');

		const submit = page.getByRole('button', { name: 'Submit Questionnaire' });
		await glideTo(page, submit, 620);
		await submit.hover();
		await page.waitForTimeout(700);
		await submit.click();
		await page.waitForURL(new RegExp(`${eventPath.split('/').pop()}/?$`), { timeout: 15_000 });
		await page
			.getByText(/questionnaire submission is under review/i)
			.filter({ visible: true })
			.first()
			.waitFor({ timeout: 15_000 })
			.catch(() => undefined);
		await page.mouse.move(760, 640);
		await page.waitForTimeout(Math.max(600, narration.durationFor('fill')));
	});

	// ---- Scene: pending. Same page; the eligibility card now says "under review".
	narration.mark('pending');
	await showOverlay(page, 'pending', narration.durationFor('pending'));

	// ---- Cut: the organizer's side.
	// No bundle-priming side page here: closing a page while its auth
	// bootstrap is mid-refresh drops the rotated cookie, and the recorded
	// admin page then paints LOGGED OUT (that cost take one of this episode).
	await episodeCut(page, 'Meanwhile', 'The organizer reads the answers', submissionsPath, {
		during: () => switchUser(page, OWNER.email, OWNER.password)
	});
	await waitClientAuth(page).catch(() => undefined);
	const review = page.getByRole('link', { name: 'Review', exact: true }).filter({ visible: true }).first();
	await review.waitFor({ timeout: 20_000 }).catch(() => undefined);
	await page.mouse.move(1500, 900);
	narration.mark('review');
	await withOverlay(page, 'review', async () => {
		await page.waitForTimeout(1500);
		if (await review.count()) {
			await review.hover();
			await page.waitForTimeout(400);
			await review.click();
		}
		const evaluate = page.getByRole('heading', { name: 'Evaluate This Submission' }).filter({ visible: true }).first();
		await evaluate.waitFor({ timeout: 20_000 }).catch(() => undefined);
		await page.mouse.move(1500, 900);
		await page.waitForTimeout(1200);
		// Bring the answers up, then the decision.
		await glideScroll(page, 420, 1400);
		await page.waitForTimeout(900);
		const advanced = page.getByRole('button', { name: /Advanced Options/ }).filter({ visible: true }).first();
		if (await advanced.count()) {
			await glideTo(page, advanced, 520, 700);
			await advanced.click();
			const comments = page.locator('#comments');
			if (await comments.isVisible({ timeout: 3_000 }).catch(() => false)) {
				await typeSlowly(page, comments, ANSWERS.note, 32);
				await page.waitForTimeout(400);
			}
		}
		const approve = page.getByRole('button', { name: /^Approve/ }).filter({ visible: true }).first();
		if (await approve.count()) {
			await glideTo(page, approve, 420, 700);
			await approve.hover();
			await page.waitForTimeout(600);
			await approve.click();
			await page
				.getByRole('button', { name: /Approve/ })
				.getByText('Current')
				.waitFor({ timeout: 15_000 })
				.catch(() => undefined);
			await page.mouse.move(1500, 700);
		}
		await page.waitForTimeout(Math.max(2200, narration.durationFor('review')));
	});

	// ---- Cut: back to the applicant, the tier unlocked.
	await episodeCut(page, 'Afterwards', 'Approved', eventPath, {
		during: () => switchUser(page, applicant.email, applicant.password)
	});
	const getTickets = page.getByRole('button', { name: 'Get Tickets', exact: true }).filter({ visible: true }).first();
	await getTickets.waitFor({ timeout: 20_000 }).catch(() => undefined);
	await page.mouse.move(760, 640);
	narration.mark('unlocked');
	await withOverlay(page, 'unlocked', async () => {
		await page.waitForTimeout(900);
		if (await getTickets.count()) {
			await getTickets.hover();
			await page.waitForTimeout(500);
			await getTickets.click();
			const dialog = page.getByRole('dialog').first();
			const addOne = dialog.getByRole('button', { name: 'Add one Workshop Spot' });
			if (await addOne.isVisible({ timeout: 8_000 }).catch(() => false)) {
				await page.waitForTimeout(700);
				await addOne.hover();
				await page.waitForTimeout(300);
				await addOne.click();
				await page.waitForTimeout(600);
				const buy = dialog.getByRole('button', { name: 'Buy' });
				await buy.hover();
				await page.waitForTimeout(300);
				await buy.click();
				const sheet = page.getByRole('dialog').filter({ hasText: 'Checkout' });
				if (await sheet.isVisible({ timeout: 8_000 }).catch(() => false)) {
					await page.waitForTimeout(500);
					const name = sheet.getByLabel(/Name for ticket/).first();
					if (await name.count()) await typeSlowly(page, name, 'Noa Beckmann', 45);
					await page.waitForTimeout(400);
					const claim = sheet.getByRole('button', { name: 'Claim' });
					await claim.hover();
					await page.waitForTimeout(300);
					if (await claim.isEnabled().catch(() => false)) await claim.click();
				}
				// The ticket opens by itself once the claim lands.
				await page.locator('img[alt="Ticket QR Code"]').waitFor({ timeout: 20_000 }).catch(() => undefined);
				await page.mouse.move(1500, 300);
			}
		}
		await page.waitForTimeout(Math.max(2600, narration.durationFor('unlocked')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
