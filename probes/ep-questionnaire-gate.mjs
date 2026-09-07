// Probe for Episode 13 · "The questionnaire gate". Duplicates the seeded
// Shibari flagship into an "October" copy, swaps its questionnaire for a fresh
// five-question one, registers a fresh applicant, verifies the gate via the
// API, then walks every page and selector the episode touches.
// `node probes/ep-questionnaire-gate.mjs`
import { chromium } from 'playwright';
import { api, login, registerVerifiedUser, attachQuestionnaire, innerQuestionnaireId } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const ORG = 'shibari-circle-vienna';
const OWNER = { email: 'ren.owner@demovideo.example.com', password: 'password123' };
const SEEDED_SLUG = 'intro-to-shibari-rope-and-trust';
const COPY_NAME = 'Intro to Shibari — Rope & Trust · October';
const Q_NAME = 'Workshop Application · October';

// ---- Arrange -------------------------------------------------------------
const ownerToken = await login(OWNER.email, OWNER.password);
const seeded = await api(`/api/events/${ORG}/event/${SEEDED_SLUG}`);
console.log('seeded event', seeded.id, seeded.name, seeded.status);
const orgId = seeded.organization.id;

// Self-healing: retire copies and questionnaires left by earlier takes. The
// event DELETE commits, then a post-commit hook 500s on the now-missing row
// (backend #937), so the rejection is expected and the row is in fact gone.
const stale = await api(`/api/events/?organization_slug=${ORG}&search=${encodeURIComponent('October')}&page_size=50`, { token: ownerToken });
for (const old of (stale.results ?? []).filter((e) => e.name === COPY_NAME)) {
	console.log('deleting stale copy', old.id);
	await api(`/api/event-admin/${old.id}`, { method: 'DELETE', token: ownerToken }).catch(() => undefined);
}
const qs = await api(`/api/questionnaires/?organization_id=${orgId}&page_size=50`, { token: ownerToken });
for (const old of (qs.results ?? []).filter((q) => q.questionnaire?.name === Q_NAME)) {
	console.log('deleting stale questionnaire', old.id);
	await api(`/api/questionnaires/${old.id}`, { method: 'DELETE', token: ownerToken }).catch((e) => console.log('  (delete failed)', String(e).slice(0, 160)));
}
const seededQ = (qs.results ?? []).find((q) => q.events?.some((e) => e.id === seeded.id));
if (!seededQ) throw new Error('seeded questionnaire not found on the flagship event');
console.log('seeded questionnaire', seededQ.id, seededQ.questionnaire.name, '| pending', seededQ.pending_evaluations_count);

// Duplicate as the October edition (a Sunday evening, like the original).
const start = new Date('2026-10-11T17:00:00Z');
const copy = await api(`/api/event-admin/${seeded.id}/duplicate`, { token: ownerToken, body: { name: COPY_NAME, start: start.toISOString() } });
console.log('copy', copy.id, copy.slug, copy.status, '| address', copy.address, '| cover', copy.cover_art);
await api(`/api/event-admin/${copy.id}/actions/update-status/open`, { method: 'POST', token: ownerToken, body: {} });
const copyPublic = await api(`/api/events/${ORG}/event/${copy.slug}`);
console.log('copy status after open:', copyPublic.status);
if (copyPublic.status !== 'open') throw new Error('copy is not open');

// Detach the seeded one-question questionnaire from the COPY only.
await api(`/api/questionnaires/${seededQ.id}/events/${copy.id}`, { method: 'DELETE', token: ownerToken });
const seededQAfter = await api(`/api/questionnaires/${seededQ.id}`, { token: ownerToken });
const stillOnSeeded = seededQAfter.events?.some((e) => e.id === seeded.id);
const onCopy = seededQAfter.events?.some((e) => e.id === copy.id);
console.log('seeded questionnaire: still on seeded event', stillOnSeeded, '| on copy', onCopy);
if (!stillOnSeeded || onCopy) throw new Error('seeded questionnaire links wrong after detach');

// The copy keeps ONE free tier — the gate is the questionnaire, not the price.
const tiers = await api(`/api/event-admin/${copy.id}/ticket-tiers`, { token: ownerToken });
const tierList = tiers.results ?? tiers.items ?? tiers;
console.log('copy tiers', tierList.map((t) => [t.name, t.payment_method, t.price, t.total_quantity]));
if (tierList.length !== 1 || tierList[0].payment_method !== 'free') throw new Error('copy should have exactly one free tier');

// The new questionnaire: two sections, five questions, read by a person.
const q = await attachQuestionnaire(orgId, copy.id, ownerToken, {
	name: Q_NAME,
	description: 'We keep these evenings small and balanced. A few questions so we can pair people well and look after everyone — a person reads every answer, usually within a day or two.',
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
					options: [
						{ option: 'None — complete beginner', order: 1, is_correct: true },
						{ option: 'A few workshops', order: 2, is_correct: true },
						{ option: 'Regular practice', order: 3, is_correct: true }
					]
				},
				{
					question: 'Are you coming with a partner?',
					is_mandatory: true,
					order: 2,
					shuffle_options: false,
					options: [
						{ option: 'Yes, together', order: 1, is_correct: true },
						{ option: 'No, on my own', order: 2, is_correct: true }
					]
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
					options: [{ option: 'Yes, I have read them', order: 1, is_correct: true }]
				}
			]
		}
	]
});
const innerId = await innerQuestionnaireId(q.id, ownerToken);
const qDetail = await api(`/api/questionnaires/${q.id}`, { token: ownerToken });
const sections = qDetail.questionnaire.sections ?? [];
console.log('new questionnaire', q.id, '| inner', innerId, '| status', qDetail.questionnaire.status, '| mode', qDetail.questionnaire.evaluation_mode, '| on copy', qDetail.events?.some((e) => e.id === copy.id));
for (const s of sections) {
	console.log('  section', s.name, '| mc', s.multiplechoicequestion_questions.map((x) => [x.question, x.options.map((o) => o.option)]), '| ft', s.freetextquestion_questions.map((x) => x.question));
}
const nQ = sections.reduce((n, s) => n + s.multiplechoicequestion_questions.length + s.freetextquestion_questions.length, 0);
if (sections.length !== 2 || nQ !== 5) throw new Error(`expected 2 sections / 5 questions, got ${sections.length} / ${nQ}`);
const findQ = (re) => {
	for (const s of sections) for (const x of [...s.multiplechoicequestion_questions, ...s.freetextquestion_questions]) if (re.test(x.question)) return x;
	throw new Error('question not found ' + re);
};
const Q = {
	experience: findQ(/rope experience/),
	partner: findQ(/partner/),
	hope: findQ(/hope to learn/),
	injuries: findQ(/injuries/),
	consent: findQ(/house rules/)
};

// A fresh applicant, human-shaped.
const applicant = await registerVerifiedUser('applicant', 'Noa', 'Beckmann', { emailLocal: 'noa.beckmann' });
const status = await api(`/api/events/${copy.id}/my-status`, { token: applicant.token });
console.log('applicant my-status:', JSON.stringify(status).slice(0, 600));
const reasonText = JSON.stringify(status).toLowerCase();
if (!reasonText.includes('questionnaire')) throw new Error('applicant eligibility does not mention the questionnaire');
const eventPath = `/events/${ORG}/${copy.slug}`;
const fillPath = `${eventPath}/questionnaire/${innerId}`;
const submissionsPath = `/org/${ORG}/admin/questionnaires/${q.id}/submissions`;
console.log('arrange OK', eventPath, '|', fillPath, '|', submissionsPath, '| applicant', applicant.email);

if (process.env.ARRANGE_ONLY) process.exit(0);

// ---- Browser walk ---------------------------------------------------------
const SHOT = '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-questionnaire-gate';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

async function uiLogin(p, email, password) {
	await p.goto(BASE + '/login');
	await p.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = p.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await p.getByLabel('Email address').fill(email);
	await p.getByLabel('Password', { exact: true }).fill(password);
	await p.getByRole('button', { name: 'Sign in', exact: true }).click();
	await p.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
	await p.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 }).catch(() => undefined);
	await p.waitForTimeout(800);
}
async function switchUser(email, password) {
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await uiLogin(side, email, password);
	await side.close();
}
async function loaded(p) {
	await p.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await p.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
	await p.waitForLoadState('networkidle').catch(() => undefined);
}
const visibleTexts = async (loc) => (await loc.filter({ visible: true }).allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

// Persona A: the applicant on the event page.
await uiLogin(page, applicant.email, applicant.password);
let t0 = Date.now();
await page.goto(BASE + eventPath);
await loaded(page);
console.log('event page loaded in', Date.now() - t0, 'ms | title', await page.title());
console.log('event page: "Location TBD"', await page.getByText('Location TBD').count(), '| buttons', (await visibleTexts(page.getByRole('button'))).filter((s) => /uestionnaire|Ticket|RSVP|Apply/i.test(s)), '| links', (await visibleTexts(page.getByRole('link'))).filter((s) => /uestionnaire|Ticket|Apply/i.test(s)));
console.log('event page: gate text', await visibleTexts(page.getByText(/questionnaire/i)));
await page.screenshot({ path: `${SHOT}/probe-gate.png` });
const cta = page.getByRole('button', { name: /Complete (the )?Questionnaire/i }).filter({ visible: true }).first();
const ctaLink = page.getByRole('link', { name: /Complete (the )?Questionnaire/i }).filter({ visible: true }).first();
console.log('cta button count', await cta.count(), '| cta link count', await ctaLink.count());
if (await cta.count()) {
	await cta.scrollIntoViewIfNeeded();
	console.log('cta box', JSON.stringify(await cta.boundingBox()));
	await cta.click();
} else if (await ctaLink.count()) {
	await ctaLink.click();
} else {
	console.log('no CTA found — navigating directly');
	await page.goto(BASE + fillPath);
}
await page.waitForURL(/\/questionnaire\//, { timeout: 15000 });
await page.waitForLoadState('networkidle').catch(() => undefined);
console.log('questionnaire page url', page.url(), '| matches fillPath', page.url().endsWith(fillPath));

// Fill.
console.log('fill: headings', await visibleTexts(page.getByRole('heading')));
console.log('fill: radios', await visibleTexts(page.getByRole('radio')), '| checkboxes', await page.getByRole('checkbox').count(), '| textareas', await page.getByRole('textbox').count());
const radioLabels = await page.locator('label').filter({ visible: true }).allTextContents();
console.log('fill: labels', radioLabels.map((s) => s.replace(/\s+/g, ' ').trim()));
const submit = page.getByRole('button', { name: 'Submit Questionnaire' });
console.log('fill: submit disabled before', await submit.isDisabled());
const pickRadio = async (name) => {
	const r = page.getByRole('radio', { name });
	console.log('  radio', name, 'count', await r.count());
	await r.click();
	console.log('  radio', name, 'checked', await r.getAttribute('aria-checked'), await r.getAttribute('data-state'));
};
await pickRadio('None — complete beginner');
await pickRadio('No, on my own');
const hopeBox = page.locator(`[id="${Q.hope.id}"]`);
console.log('  hope textarea count', await hopeBox.count(), '| by label', await page.getByLabel(/hope to learn/).count());
await hopeBox.click();
await hopeBox.pressSequentially('How to tie safely, and how to talk about what I want before the rope comes out.', { delay: 5 });
const injBox = page.locator(`[id="${Q.injuries.id}"]`);
await injBox.scrollIntoViewIfNeeded();
await injBox.click();
await injBox.pressSequentially('A stiff left shoulder — nothing serious, but please no tight overhead ties.', { delay: 5 });
const consent = page.getByRole('checkbox', { name: 'Yes, I have read them' });
console.log('  consent checkbox count', await consent.count());
await consent.click();
console.log('  consent state', await consent.getAttribute('aria-checked'), await consent.getAttribute('data-state'));
console.log('fill: typed', (await hopeBox.inputValue()).length, (await injBox.inputValue()).length, '| submit disabled after', await submit.isDisabled());
await submit.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${SHOT}/probe-filled.png`, fullPage: true });
await submit.click();
await page.waitForURL(new RegExp(copy.slug + '/?$'), { timeout: 15000 });
await loaded(page);
console.log('submit: back on event page');
const pendingText = page.getByText(/being reviewed|under review|pending review/i).filter({ visible: true }).first();
await pendingText.waitFor({ timeout: 10000 });
console.log('pending state:', await visibleTexts(page.getByText(/being reviewed|under review|pending review/i)));
await page.screenshot({ path: `${SHOT}/probe-pending.png` });
const subs = await api(`/api/questionnaires/${q.id}/submissions`, { token: ownerToken });
console.log('api: submissions on new questionnaire', (subs.results ?? subs).length, (subs.results ?? subs).map((s) => [s.user?.display_name ?? s.user?.email, s.status, s.evaluation?.status]));

// Persona B: Ren on the submissions list → review → approve.
await switchUser(OWNER.email, OWNER.password);
t0 = Date.now();
await page.goto(BASE + submissionsPath);
await loaded(page);
console.log('submissions page loaded in', Date.now() - t0, 'ms | headings', await visibleTexts(page.getByRole('heading')));
const rows = page.locator('tbody tr').filter({ visible: true });
console.log('submissions: rows', await rows.count(), '| first row text', (await rows.first().textContent().catch(() => '')).replace(/\s+/g, ' ').trim());
const review = page.getByRole('link', { name: 'Review', exact: true }).filter({ visible: true }).first();
console.log('submissions: Review links', await review.count(), '| href', await review.getAttribute('href'));
await page.screenshot({ path: `${SHOT}/probe-submissions.png` });
await review.click();
await page.getByRole('heading', { name: 'Review Submission' }).waitFor({ timeout: 15000 });
await page.waitForLoadState('networkidle').catch(() => undefined);
console.log('review: headings', await visibleTexts(page.getByRole('heading')));
const reviewBody = await page.textContent('body');
console.log('review: body contains answers', ['complete beginner', 'on my own', 'rope comes out', 'left shoulder', 'read them'].map((s) => [s, reviewBody.includes(s)]));
const evaluate = page.getByRole('heading', { name: 'Evaluate This Submission' });
await evaluate.scrollIntoViewIfNeeded();
console.log('review: Evaluate heading y', JSON.stringify(await evaluate.boundingBox()), '| page height', await page.evaluate(() => document.documentElement.scrollHeight));
const adv = page.getByRole('button', { name: /Advanced Options/ });
console.log('review: advanced toggle count', await adv.count());
await adv.click();
const comments = page.locator('#comments');
await comments.waitFor({ timeout: 5000 });
await comments.pressSequentially('Welcome, Noa — see you in October.', { delay: 5 });
const approve = page.getByRole('button', { name: /^Approve/ }).filter({ visible: true }).first();
console.log('review: approve count', await approve.count(), '| box', JSON.stringify(await approve.boundingBox()));
await page.screenshot({ path: `${SHOT}/probe-review.png`, fullPage: true });
await approve.click();
await page.getByRole('button', { name: /Approve/ }).getByText('Current').waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
console.log('approve: OK | url', page.url(), '| headings', await visibleTexts(page.getByRole('heading')));
await page.screenshot({ path: `${SHOT}/probe-approved.png` });
const subs2 = await api(`/api/questionnaires/${q.id}/submissions`, { token: ownerToken });
console.log('api: after approve', (subs2.results ?? subs2).map((s) => [s.status, s.evaluation?.status, s.evaluation?.comments]));

// Persona A again: the tier unlocked.
await switchUser(applicant.email, applicant.password);
const status2 = await api(`/api/events/${copy.id}/my-status`, { token: applicant.token });
console.log('applicant my-status after approve:', JSON.stringify(status2).slice(0, 400));
await page.goto(BASE + eventPath);
await loaded(page);
console.log('unlocked: buttons', (await visibleTexts(page.getByRole('button'))).filter((s) => /Ticket|RSVP|Claim|Get/i.test(s)));
const getTickets = page.getByRole('button', { name: 'Get Tickets', exact: true }).filter({ visible: true }).first();
await getTickets.waitFor({ timeout: 20000 });
await getTickets.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${SHOT}/probe-unlocked.png` });
await getTickets.click();
await page.waitForTimeout(1500);
console.log('after Get Tickets: url', page.url(), '| dialogs', await page.getByRole('dialog').count(), '| headings', await visibleTexts(page.getByRole('heading')));
console.log('after Get Tickets: buttons', (await visibleTexts(page.getByRole('button'))).filter((s) => /Ticket|Claim|Get|Reserve|Confirm|Buy|Checkout/i.test(s)));
console.log('after Get Tickets: tier text', await visibleTexts(page.getByText(/Workshop Spot/)));
await page.screenshot({ path: `${SHOT}/probe-tickets.png` });
const dialog = page.getByRole('dialog').first();
console.log('dialog text:', (await dialog.textContent().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 500));
console.log('dialog buttons:', await visibleTexts(dialog.getByRole('button')), '| radios', await visibleTexts(dialog.getByRole('radio')), '| textboxes', await dialog.getByRole('textbox').count());
const addOne = dialog.getByRole('button', { name: 'Add one Workshop Spot' });
console.log('add-one count', await addOne.count());
await addOne.click();
await page.waitForTimeout(600);
const buy = dialog.getByRole('button', { name: 'Buy' }).filter({ visible: true }).first();
if (await buy.count()) {
	console.log('claim button:', await buy.textContent(), '| disabled', await buy.isDisabled());
	await buy.click();
	const sheet = page.getByRole('dialog').filter({ hasText: 'Checkout' });
	await sheet.waitFor({ timeout: 10000 });
	const nameField = sheet.getByLabel(/Name for ticket/).first();
	console.log('checkout: name fields', await sheet.getByLabel(/Name for ticket/).count(), '| buttons', await visibleTexts(sheet.getByRole('button')));
	await nameField.pressSequentially('Noa Beckmann', { delay: 5 });
	const claimBtn = sheet.getByRole('button', { name: 'Claim' });
	console.log('checkout: Claim disabled', await claimBtn.isDisabled());
	await claimBtn.click();
	await page.locator('img[alt="Ticket QR Code"]').waitFor({ timeout: 20000 }).catch(() => console.log('  (no QR modal within 20s)'));
	await page.waitForTimeout(1000);
	console.log('after claim: url', page.url(), '| dialogs', await page.getByRole('dialog').count(), '| dialog headings', await visibleTexts(page.getByRole('dialog').getByRole('heading')), '| toasts', await visibleTexts(page.locator('[data-sonner-toast]')));
	console.log('after claim: buttons', (await visibleTexts(page.getByRole('button'))).filter((s) => /Ticket|Claim|Get|Reserve|Confirm|Buy|Wallet|Done|Close/i.test(s)));
	await page.screenshot({ path: `${SHOT}/probe-claimed.png` });
	const tix = await api('/api/me/tickets?page_size=20', { token: applicant.token }).catch(() => ({}));
	console.log('api: my tickets', (tix.results ?? []).map((t) => [t.status, t.tier?.name, t.event?.name]));
}

await browser.close();
console.log('PROBE PASSED');
