// Diagnose the two broken clips: what do the pages ACTUALLY render?
import { chromium } from 'playwright';
import { createDressedOrg, createEvent, createPotluckItem, registerVerifiedUser, rsvpYes, attachQuestionnaire, makeMember, defaultMembershipTier, inviteToEvent } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
context.setDefaultTimeout(10000);

async function uiLogin(email, password) {
	await page.goto(BASE + '/login');
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
}
async function logout() {
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await side.close();
}

// ---------- POTLUCK ----------
{
	const org = await createDressedOrg({ name: 'Potluck Fix Probe', description: 'probe' });
	const event = await createEvent(org.slug, org.owner.token, { name: 'Fix Probe Picnic', requires_ticket: false, potluck_open: true });
	await createPotluckItem(event.id, org.owner.token, { name: 'A big green salad', item_type: 'side_dish', quantity: 'serves 8' });
	const guest = await registerVerifiedUser('fixpicnic');
	await rsvpYes(event.id, guest.token);
	await uiLogin(guest.email, guest.password);
	await page.goto(BASE + event.path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
	await page.waitForTimeout(2000);
	const header = page.getByRole('button', { name: /Potluck Coordination/ }).filter({ visible: true }).first();
	console.log('potluck header visible:', await header.isVisible().catch(() => false));
	if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
	await page.waitForTimeout(1500);
	const claimBtn = page.getByRole('button', { name: 'Claim A big green salad' });
	console.log('claim button count:', await claimBtn.count());
	if ((await claimBtn.count()) === 0) {
		console.log('--- visible buttons in potluck region:');
		const region = page.getByRole('region', { name: /Potluck/ }).first();
		for (const b of await region.getByRole('button').allInnerTexts().catch(() => [])) console.log('  *', b.slice(0, 60));
		console.log('--- region text:', (await region.innerText().catch(() => 'NO REGION')).slice(0, 400));
	}
	await logout();
}

// ---------- GATES (invited + member views) ----------
{
	const org = await createDressedOrg({ name: 'Gates Fix Probe', description: 'probe' });
	const event = await createEvent(org.slug, org.owner.token, { name: 'Fix Probe Circle', event_type: 'members-only', requires_ticket: false });
	await attachQuestionnaire(org.id, event.id, org.owner.token, {
		name: 'Fix Intro', min_score: 0, evaluation_mode: 'manual', status: 'published',
		freetextquestion_questions: [{ question: 'Last book you loved?', is_mandatory: true }]
	});
	const [member, invitee] = await Promise.all([registerVerifiedUser('fixmem'), registerVerifiedUser('fixinv')]);
	const tier = await defaultMembershipTier(org.slug, org.owner.token);
	await makeMember(org.slug, member.token, org.owner.token, tier.id);
	await inviteToEvent(event.id, org.owner.token, [invitee.email], { waives_questionnaire: true, waives_membership_required: true });

	await uiLogin(member.email, member.password);
	await page.goto(BASE + event.path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.waitForTimeout(2500);
	console.log('member sees Complete Questionnaire:', await page.getByRole('button', { name: 'Complete Questionnaire' }).filter({ visible: true }).count());
	console.log('member gate text sample:', (await page.getByText(/Questionnaire|Members only|Will you attend/).allInnerTexts().catch(() => [])).slice(0, 5));
	await logout();

	await uiLogin(invitee.email, invitee.password);
	await page.goto(BASE + event.path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.waitForTimeout(2500);
	console.log('invitee sees Will you attend:', await page.getByText('Will you attend?').filter({ visible: true }).count());
	console.log('invitee gate text sample:', (await page.getByText(/Questionnaire|Members only|Will you attend|Invitation/).allInnerTexts().catch(() => [])).slice(0, 6));
}

await browser.close();
console.log('FIX PROBE DONE');
