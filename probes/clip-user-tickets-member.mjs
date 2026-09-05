import { chromium } from 'playwright';
import { createDressedOrg, createEvent, createTier, deleteDefaultTier, registerVerifiedUser, makeMember, defaultMembershipTier } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const org = await createDressedOrg({ name: 'The Velvet Cellar', description: 'probe org' });
const event = await createEvent(org.slug, org.owner.token, { name: 'Basement Sessions: Live & Loud' });
await deleteDefaultTier(event.id, org.owner.token);
await createTier(event.id, org.owner.token, { name: 'General Admission', payment_method: 'at_the_door', price: '15.00' });
await createTier(event.id, org.owner.token, {
	name: 'Members — Free Entry',
	payment_method: 'free',
	price: '0.00',
	visibility: 'members-only',
	purchasable_by: 'members'
});
const [guest, member] = await Promise.all([
	registerVerifiedUser('probeguest', 'Sam', 'Visitor'),
	registerVerifiedUser('probemember', 'Noa', 'Member')
]);
const tier = await defaultMembershipTier(org.slug, org.owner.token);
await makeMember(org.slug, member.token, org.owner.token, tier.id);
console.log('arrange: OK', event.path);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

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

await uiLogin(guest.email, guest.password);
await page.goto(BASE + event.path);
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
await page.getByRole('heading', { name: 'General Admission' }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
const memberTierHidden = await page.getByRole('heading', { name: 'Members — Free Entry' }).count();
console.log('guest: GA visible, member-tier headings in DOM:', memberTierHidden, memberTierHidden === 0 ? '(correctly filtered) OK' : '⚠️ VISIBLE TO GUEST');

// switch to member
const side = await context.newPage();
await side.goto(BASE + '/logout');
await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
await side.close();
await uiLogin(member.email, member.password);
await page.goto(BASE + event.path);
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.getByRole('heading', { name: 'Members — Free Entry' }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
console.log('member: member tier visible OK');

await browser.close();
console.log('PROBE PASSED');
