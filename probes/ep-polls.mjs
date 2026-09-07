// Probe for Episode 10 · "Polls". Arranges an allotment society with five
// members, then walks every selector the episode touches:
//   owner  → /org/<slug>/admin/polls/new: name, description, the three
//            audience/timing selects, "Multiple Choice", question text, the
//            option inputs, "Add Option", the shuffle checkbox, "Create poll",
//            then "Open poll" on the admin detail page;
//   API    → four members vote (needs the poll OPEN first);
//   member → /org/<slug>/polls/<id>: privacy summary, radio, "Submit vote",
//            the voted banner and the Results card with a spread.
// Verifies through the API that votes landed and that the member can see
// results right after voting (result_visibility=members-only, timing=after_vote).
import { chromium } from 'playwright';
import {
	api,
	createDressedOrg,
	defaultMembershipTier,
	makeMember,
	registerVerifiedUser
} from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const ADDRESS = 'Kleingartenverein Prater, Meiereistraße 20, 1020 Vienna, Austria';

// ---- Arrange
const org = await createDressedOrg({
	name: 'Prater Allotment Society',
	description:
		'Forty garden plots behind the Prater, and the people who tend them. We share tools, seedlings and a long table in the courtyard. One social a season, weather permitting.',
	address: ADDRESS
});
const tier = await defaultMembershipTier(org.slug, org.owner.token);
const cast = [
	['Lena', 'Hartmann', 'lena.hartmann'],
	['Tomas', 'Berger', 'tomas.berger'],
	['Priya', 'Nair', 'priya.nair'],
	['Jonas', 'Wieser', 'jonas.wieser'],
	['Mira', 'Kovac', 'mira.kovac']
];
const members = [];
for (const [first, last, emailLocal] of cast) {
	const u = await registerVerifiedUser(emailLocal.replace('.', '-'), first, last, { emailLocal });
	await makeMember(org.slug, u.token, org.owner.token, tier.id);
	members.push(u);
}
const lena = members[0];
log('arranged', org.slug, '| members:', members.length, '| tier:', tier.name);

// ---- Owner UI walk
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.on('response', (r) => {
	if (r.status() === 429 || r.status() >= 500) log('HTTP', r.status(), r.url().replace(BASE, ''));
});
page.on('console', (m) => {
	if (m.type() === 'error') log('CONSOLE', m.text().slice(0, 300));
});
const SCRATCH = '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-polls';

async function uiLogin(p, email, password) {
	await p.goto(BASE + '/login');
	await p.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = p.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await p.getByLabel('Email address').fill(email);
	await p.getByLabel('Password', { exact: true }).fill(password);
	await p.getByRole('button', { name: 'Sign in', exact: true }).click();
	await p.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
}
const waitAuth = (p) => p.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });

const newPath = `/org/${org.slug}/admin/polls/new`;
/**
 * Land on an authenticated page with the bell (client auth) present.
 *
 * Every author on this machine shares one IP and the API throttles per IP. A
 * burst — our own arrange step, or someone else's — can 429 the page's SSR
 * fetch (rendered as a 502) and then the client's token refresh, after which
 * the session is gone for good and every reload bounces to /login. So a miss
 * is recovered by logging in AGAIN, not by reloading.
 */
async function landAuthed(p, path, who) {
	for (let attempt = 0; ; attempt++) {
		await uiLogin(p, who.email, who.password);
		// Let the dashboard's own auth bootstrap finish before leaving it: the
		// refresh token rotates on that call, and navigating away mid-flight
		// leaves the browser holding the OLD cookie → the next refresh is a 401
		// and the session is gone.
		await waitAuth(p).catch(() => undefined);
		await p.waitForTimeout(800);
		await p.goto(BASE + path);
		await p.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
		const ok = await waitAuth(p).then(() => true, () => false);
		if (ok && p.url().includes(path)) return;
		if (attempt >= 3) throw new Error(`client auth never landed on ${path}`);
		log('miss on', path, '| url:', p.url(), '| header:', (await p.locator('header').first().innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 120));
		await p.screenshot({ path: `${SCRATCH}/miss-${attempt}.png` }).catch(() => undefined);
		await p.waitForTimeout(15000 + attempt * 10000);
	}
}
// Let the per-minute throttle window breathe after the arrange burst.
await new Promise((r) => setTimeout(r, 8000));
await landAuthed(page, newPath, org.owner);
await page.getByRole('heading', { name: 'Create Poll' }).first().waitFor({ timeout: 15000 });
log('builder: heading + auth OK; logged-out header?', await page.getByRole('link', { name: 'Login' }).count());

// Basics
const nameInput = page.getByLabel('Poll name');
await nameInput.pressSequentially('Which night for the summer social?', { delay: 10 });
log('name typed:', await nameInput.inputValue());
const desc = page.getByRole('textbox', { name: /Description/ });
await desc.waitFor({ timeout: 10000 });
await desc.click();
await page.keyboard.type('One evening in July at the courtyard table. Most votes wins.', { delay: 5 });
log('description typed:', (await desc.innerText()).slice(0, 60));

// Audience
const voteSel = page.locator('#vote-visibility');
log('who-can-vote trigger:', await voteSel.count(), '| current:', await voteSel.innerText());
await voteSel.click();
const membersOpt = page.getByRole('option', { name: 'Members only' });
await membersOpt.waitFor({ timeout: 10000 });
log('select options:', await page.getByRole('option').allInnerTexts());
await membersOpt.click();
log('who-can-vote after:', await voteSel.innerText());

const resultSel = page.locator('#result-visibility');
log('who-sees-results trigger current:', await resultSel.innerText());
await resultSel.click();
await page.getByRole('option', { name: 'Members only' }).click();
log('who-sees-results after:', await resultSel.innerText());

const timingSel = page.locator('#result-timing');
log('timing trigger current:', await timingSel.innerText());
await timingSel.click();
await page.getByRole('option', { name: 'After voting' }).click();
log('timing after:', await timingSel.innerText());
log('anonymity checkboxes:', await page.getByLabel('Hide voter identities from staff').count(), await page.getByLabel('Hide voter identities from voters').count(), await page.getByLabel(/Allow voters to change their vote/).count());

// Questions
const mcBtn = page.getByRole('button', { name: 'Multiple Choice' });
log('Multiple Choice button:', await mcBtn.count(), '| empty state:', await page.getByText('No questions yet.').count());
await mcBtn.scrollIntoViewIfNeeded();
await mcBtn.click();
const qText = page.getByRole('textbox', { name: /Question Text/ });
await qText.waitFor({ timeout: 10000 });
await qText.click();
await page.keyboard.type('Which night works for you?', { delay: 5 });
log('question typed:', await qText.innerText());
const opt1 = page.getByPlaceholder('Option 1');
const opt2 = page.getByPlaceholder('Option 2');
log('option inputs:', await opt1.count(), await opt2.count(), '| option 3 before add:', await page.getByPlaceholder('Option 3').count());
await opt1.pressSequentially('Friday 24 July', { delay: 10 });
await opt2.pressSequentially('Saturday 25 July', { delay: 10 });
await page.getByRole('button', { name: 'Add Option' }).click();
const opt3 = page.getByPlaceholder('Option 3');
await opt3.waitFor({ timeout: 5000 });
await opt3.pressSequentially('Sunday afternoon, 26 July', { delay: 10 });
log('options:', await opt1.inputValue(), '|', await opt2.inputValue(), '|', await opt3.inputValue());
const shuffle = page.getByLabel('Shuffle answer options for each user');
log('shuffle checkbox:', await shuffle.count(), '| checked before:', await shuffle.getAttribute('aria-checked'), await shuffle.getAttribute('data-state'));
await shuffle.click();
log('shuffle after click:', await shuffle.getAttribute('aria-checked'), await shuffle.getAttribute('data-state'));

// Create
const createBtn = page.getByRole('button', { name: 'Create poll' });
log('create button:', await createBtn.count());
await createBtn.click();
await page.waitForURL(/\/admin\/polls\/[0-9a-f-]{36}$/, { timeout: 20000 });
const pollId = page.url().split('/').pop();
log('created → admin detail:', page.url());
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await waitAuth(page);
const openBtn = page.getByRole('button', { name: 'Open poll' });
await openBtn.waitFor({ timeout: 15000 });
log('status before:', await page.getByText('Draft', { exact: true }).filter({ visible: true }).count(), '| Open poll button:', await openBtn.count());
await openBtn.click();
const closeBtn = page.getByRole('button', { name: 'Close poll' });
await closeBtn.waitFor({ timeout: 15000 });
log('opened; Close poll button:', await closeBtn.count(), '| Opened text:', await page.getByText(/^Opened /).count(), '| url strip:', await page.getByText(new RegExp(`/org/${org.slug}/polls/${pollId}`)).count(), await page.locator('input[readonly]').count(), '| copy btn:', await page.getByRole('button', { name: /Copy/ }).count());
log('questions locked banner:', await page.getByText(/Questions are locked/).count(), '| results empty:', await page.getByText('No votes yet.').count());

// ---- API: shape + four votes
const detail = await api(`/api/polls/${pollId}/`, { token: org.owner.token });
log('poll:', detail.status, detail.vote_visibility, detail.result_visibility, detail.result_timing, '| staff_anon', detail.staff_anonymous, '| public_anon', detail.public_anonymous);
const q = detail.questionnaire.multiple_choice_questions[0];
log('question:', q.question, '| options:', q.options.map((o) => `${o.order}:${o.option}`).join(' / '));
const byText = Object.fromEntries(q.options.map((o) => [o.option, o.id]));
const votes = [
	[members[1], 'Friday 24 July'],
	[members[2], 'Saturday 25 July'],
	[members[3], 'Saturday 25 July'],
	[members[4], 'Sunday afternoon, 26 July']
];
for (const [u, choice] of votes) {
	await api(`/api/polls/${pollId}/vote`, {
		token: u.token,
		body: { mc_answers: [{ question_id: q.id, option_ids: [byText[choice]] }], free_text_answers: [], file_upload_answers: [] }
	});
}
const asLenaBefore = await api(`/api/polls/${pollId}/`, { token: lena.token });
log('lena before vote: can_vote', asLenaBefore.user_can_vote, '| has_voted', asLenaBefore.user_has_voted, '| can_see_results', asLenaBefore.user_can_see_results, '| results', JSON.stringify(asLenaBefore.results));
log('lena sees option order:', asLenaBefore.questionnaire.multiple_choice_questions[0].options.map((o) => o.option).join(' / '));

// ---- Member UI walk
const side = await context.newPage();
await side.goto(BASE + '/logout');
await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
await side.close();
const voterPath = `/org/${org.slug}/polls/${pollId}`;
await landAuthed(page, voterPath, lena);
log('voter page h1:', await page.getByRole('heading', { level: 1 }).first().innerText());
log('privacy rows:', (await page.locator('section.rounded-lg').first().innerText()).replace(/\s+/g, ' '));
log('status badge Open:', await page.getByText('Open', { exact: true }).filter({ visible: true }).count());
log('Cast your vote heading:', await page.getByRole('heading', { name: 'Cast your vote' }).count());
const radios = page.getByRole('radio');
log('radios:', await radios.count(), '| labels:', await page.locator('label:has([role=radio])').allInnerTexts());
const sat = page.getByRole('radio', { name: 'Saturday 25 July' });
log('saturday radio:', await sat.count());
await sat.click();
log('saturday checked:', await sat.getAttribute('aria-checked'), await sat.getAttribute('data-state'));
const submit = page.getByRole('button', { name: 'Submit vote' });
log('submit button:', await submit.count());
await submit.click();
await page.getByText('You voted on this poll.').waitFor({ timeout: 15000 });
log('voted banner OK | change-vote button:', await page.getByRole('button', { name: 'Change my vote' }).count());
const resultsHeading = page.getByRole('heading', { name: 'Results' });
await resultsHeading.waitFor({ timeout: 15000 });
const voters = page.getByText(/\d+ voters?/).first();
await voters.waitFor({ timeout: 10000 });
log('results:', await voters.innerText(), '|', (await page.locator('[role=img]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join(' / '));
log('Location TBD anywhere?', await page.getByText('Location TBD').count());

// ---- API verification
const asLena = await api(`/api/polls/${pollId}/`, { token: lena.token });
if (!asLena.user_has_voted) throw new Error('lena vote not recorded');
if (!asLena.user_can_see_results) throw new Error('lena cannot see results after voting');
if (asLena.results.total_voters !== 5) throw new Error(`expected 5 voters, got ${asLena.results.total_voters}`);
log('API: lena voted, sees results, total_voters =', asLena.results.total_voters, '|', asLena.results.mc_question_stats[0].options.map((o) => `${o.option_text}=${o.count}`).join(', '));

await browser.close();
console.log('PROBE PASSED', { org: org.slug, pollId, voterPath });
