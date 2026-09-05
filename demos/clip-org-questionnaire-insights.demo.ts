import { test, withOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { createDressedOrg, createEvent, attachQuestionnaire, registerVerifiedUser, submitQuestionnaire, innerQuestionnaireId, api } from './arrange-lib.mjs';
import { gotoClean, waitClientAuth, uiLogin, slowScroll } from './clip-helpers';

test.use({ bypassCSP: true });

const APPLICANTS: Array<[string, string, string, number, string]> = [
	// [first, last, freeText, mcqOptionIndex, evaluation]
	['Mara', 'Lindgren', 'A battered Pentax K1000 my dad left me.', 0, 'approved'],
	['Jonas', 'Weiss', 'Fuji X100V, mostly street.', 1, 'approved'],
	['Priya', 'Nair', 'Half-frame Olympus Pen — 72 shots of chaos.', 0, 'approved'],
	['Tom', 'Okafor', 'My phone, but I want to learn film.', 1, 'approved'],
	['Lena', 'Kovacs', 'Rolleiflex from a flea market, still learning.', 2, 'approved'],
	['Rex', 'Marlowe', 'idk cameras are cameras', 2, 'rejected'],
	['Vic', 'Sloane', 'not telling', 1, 'rejected'],
	['Ana', 'Duarte', 'Canon AE-1 and too many rolls of Portra.', 0, 'pending'],
	['Kai', 'Tanaka', 'Large format when I can carry it.', 0, 'pending'],
	['Sofia', 'Ricci', 'Disposables only. It is a lifestyle.', 2, 'pending']
];

test('clip-org-questionnaire-insights', async ({ page, narration }) => {
	test.setTimeout(540_000);

	// ---- Arrange (not recorded): org, event, questionnaire, 10 fresh applicants.
	const org = await createDressedOrg({
		name: 'Analog Photo Walks',
		description:
			'We walk, we shoot film, we compare grain like it matters (it does). Monthly photo walks through the city, darkroom nights in winter.'
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Golden Hour Photo Walk',
		requires_ticket: false,
		max_attendees: 25,
		description:
			'An evening walk chasing the good light along the canal. All cameras welcome — film gets you bragging rights.'
	});
	const wrapper = await attachQuestionnaire(org.id, event.id, org.owner.token, {
		name: 'Walk Application',
		min_score: 0,
		evaluation_mode: 'manual',
		status: 'published',
		freetextquestion_questions: [{ question: 'What do you shoot with?', is_mandatory: true }],
		multiplechoicequestion_questions: [
			{
				question: 'How did you hear about us?',
				is_mandatory: true,
				options: [
					{ option: 'A friend brought me' },
					{ option: 'Social media' },
					{ option: 'Just wandered in' }
				]
			}
		]
	});
	const innerId = await innerQuestionnaireId(wrapper.id, org.owner.token);

	let detailCache: { mcqId: string; optionIds: string[]; ftId: string } | null = null;
	for (const [first, last, answer, optIdx] of APPLICANTS) {
		const user = await registerVerifiedUser(`applicant-${first.toLowerCase()}`, first, last);
		if (!detailCache) {
			const detail = await api(`/api/events/${event.id}/questionnaire/${innerId}`, {
				token: user.token
			});
			const mcq = detail.multiple_choice_questions[0];
			detailCache = {
				mcqId: mcq.id,
				optionIds: mcq.options.map((o: { id: string }) => o.id),
				ftId: detail.free_text_questions[0].id
			};
		}
		await submitQuestionnaire(event.id, innerId, user.token, {
			freeText: [{ question_id: detailCache.ftId, answer }],
			multipleChoice: [{ question_id: detailCache.mcqId, options_id: [detailCache.optionIds[optIdx]] }]
		});
	}
	// Evaluate: match submissions to applicants by list order is unreliable —
	// evaluate by index over the submissions list instead.
	const subs = await api(`/api/questionnaires/${wrapper.id}/submissions?page_size=50`, {
		token: org.owner.token
	});
	const rows: Array<{ id: string }> = subs.results ?? subs.items ?? [];
	const verdicts = APPLICANTS.map(([, , , , v]) => v);
	for (let i = 0; i < rows.length && i < verdicts.length; i++) {
		if (verdicts[i] === 'pending') continue;
		await api(`/api/questionnaires/${wrapper.id}/submissions/${rows[i].id}/evaluate`, {
			token: org.owner.token,
			body: {
				status: verdicts[i],
				score: verdicts[i] === 'approved' ? 85 : 30,
				comments: null
			}
		});
	}

	// ---- On camera: the organizer's view
	await uiLogin(page, org.owner.email, org.owner.password);
	await gotoClean(page, `/org/${org.slug}/admin/questionnaires/${wrapper.id}/submissions`);
	await waitClientAuth(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// Scene 1: the submissions board + filters
	narration.mark('board');
	await withOverlay(page, 'board', async () => {
		await page.waitForTimeout(1500);
		await slowScroll(page, 300, 1500);
		const approved = page.getByRole('button', { name: 'Approved' }).filter({ visible: true }).first();
		if (await approved.isVisible().catch(() => false)) {
			await approved.hover();
			await page.waitForTimeout(500);
			await approved.click();
			await page.waitForTimeout(1500);
			const all = page.getByRole('button', { name: 'All' }).filter({ visible: true }).first();
			await all.click().catch(() => undefined);
		}
		await page.waitForTimeout(Math.max(1000, narration.durationFor('board')));
	});

	// Scene 2: the summary page
	await gotoClean(page, `/org/${org.slug}/admin/questionnaires/${wrapper.id}/summary`);
	narration.mark('summary');
	await withOverlay(page, 'summary', async () => {
		await page.waitForTimeout(1800);
		await slowScroll(page, 700, Math.max(2500, narration.durationFor('summary')));
		await page.waitForTimeout(Math.max(800, narration.durationFor('summary')));
	});
	await page.waitForTimeout(600);
});
