// Probe for Episode 17 · "Paid memberships". Needs the Stripe test stack
// (STRIPE_* in .env, `stripe listen` forwarding to :8000). Arranges a dressed,
// Stripe-connected rowing club with a "Supporter" tier, one yearly card plan,
// one offline plan with two staff-recorded members, then walks:
//
//   owner  : Members admin → Tiers → the Supporter card → "Add plan" → the
//            plan form (name, Online — Stripe, €8, every 1 month) → Create
//   member : /org/<slug>/membership → the plan cards → Subscribe → the dialog
//            ("How billing works") → (pay on Stripe OFF camera) → the page
//            shows "Your plan" Active → /account/memberships: the card with
//            next renewal, payment history and the Manage/Change/Cancel buttons
//   owner  : Members admin → Subscriptions tab → metrics + rows → an offline
//            member's drawer → Record payment → the modal → submit
//
//   MAILPIT_URL=http://localhost:8125 SHOT_DIR=<dir> node probes/ep-paid-memberships.mjs
import { chromium } from 'playwright';
import {
	api,
	createDressedOrg,
	createMembershipPlan,
	createMembershipTier,
	markStripeConnected,
	pickFreeOrgName,
	registerVerifiedUser,
	setOrgBilling
} from '../demos/arrange-lib.mjs';
import { subscribeByCard } from '../demos/stripe-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOT = process.env.SHOT_DIR || '';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---- Arrange -------------------------------------------------------------
const orgName = await pickFreeOrgName([
	'Kanalufer Rowing Club',
	'Alte Donau Rowing Club',
	'Ruderverein Kaisermühlen',
	'Handelskai Rowing Club',
	'Freudenau Rowing Club',
	'Donauinsel Rowing Club'
]);
const address = 'Am Kaisermühlendamm 10, 1220 Vienna, Austria';
const org = await createDressedOrg({
	name: orgName,
	description:
		'A rowing club on the Old Danube with forty boats, one coffee machine and members from eighteen to eighty. Dues keep the boathouse roof on and the coach paid. Beginners welcome from April to October.',
	address
});
log('org', org.slug, org.id, '| owner', org.owner.email);
if (!(await markStripeConnected(org.slug))) throw new Error('org not Stripe-connected');
await setOrgBilling(org.slug, org.owner.token, {
	billing_name: `${orgName} (Verein)`,
	billing_address: address,
	billing_email: org.owner.email
});
const tier = await createMembershipTier(
	org.slug,
	org.owner.token,
	'Supporter',
	'Full member: boat access, coaching on Tuesdays and Thursdays, a key to the boathouse, and a vote at the general meeting.'
);
log('tier', tier.id, tier.name);
const yearly = await createMembershipPlan(org.slug, org.owner.token, tier.id, {
	name: 'Supporter, yearly',
	price: '80.00',
	period_unit: 'year',
	payment_method: 'online',
	description: 'One payment a year, two months free compared to monthly dues.'
});
const cashPlan = await createMembershipPlan(org.slug, org.owner.token, tier.id, {
	name: 'Supporter, paid in person',
	price: '8.00',
	period_unit: 'month',
	payment_method: 'offline',
	description: 'Pay your dues at the boathouse, cash or transfer. We record it for you.'
});
log('plans', yearly.id, yearly.payment_method, '|', cashPlan.id, cashPlan.payment_method);
const member = await registerVerifiedUser('member', 'Noor', 'Haddad', { emailLocal: 'noor.haddad' });
const offliners = await Promise.all([
	registerVerifiedUser('m1', 'Paul', 'Steiner', { emailLocal: 'paul.steiner' }),
	registerVerifiedUser('m2', 'Greta', 'Lindner', { emailLocal: 'greta.lindner' })
]);
for (const u of offliners) {
	const me = await api('/api/account/me', { token: u.token });
	const sub = await api(`/api/organization-admin/${org.slug}/subscriptions`, {
		token: org.owner.token,
		body: {
			plan_id: cashPlan.id,
			user_id: me.id,
			initial_payment_amount: '8.00',
			initial_payment_currency: 'EUR',
			initial_payment_notes: 'Cash at the boathouse'
		}
	});
	log('offline member', u.email, '→', sub.status);
}
log('arrange: OK | member', member.email);

// ---- Browser --------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const shot = async (name) => SHOT && page.screenshot({ path: `${SHOT}/${name}.png` });
const vis = (loc) => loc.filter({ visible: true }).first();
const text = async (loc, n = 900) => (await loc.innerText()).replace(/\s*\n\s*/g, ' | ').slice(0, n);

async function uiLogin(email, password) {
	await page.goto(BASE + '/login');
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
	await page.waitForTimeout(800);
}
async function switchUser(email, password) {
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await side.close();
	await uiLogin(email, password);
}
async function gotoReady(path) {
	await page.goto(BASE + path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
	await page.waitForLoadState('networkidle').catch(() => undefined);
}

// ---- Persona A: owner creates the monthly card plan ------------------------
await uiLogin(org.owner.email, org.owner.password);
const membersPath = `/org/${org.slug}/admin/members`;
await gotoReady(membersPath);
log('owner: tabs =', JSON.stringify(await page.getByRole('tab').allInnerTexts()));
await page.getByRole('tab', { name: 'Tiers' }).click();
await page.waitForTimeout(1200);
const supporter = vis(page.getByRole('heading', { name: 'Supporter' }));
await supporter.waitFor({ timeout: 15000 });
log('owner: Supporter heading y =', (await supporter.boundingBox())?.y);
const tierCard = supporter.locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
log('owner: tier card text =', await text(tierCard, 700));
const addPlan = vis(tierCard.getByRole('button', { name: 'Add plan' }));
await addPlan.waitFor({ timeout: 10000 });
log('owner: Add plan box =', await addPlan.boundingBox());
await shot('a1-tiers-tab');
await addPlan.click();
const form = page.getByRole('dialog');
await form.locator('#plan-name').waitFor({ timeout: 10000 });
log('owner: plan form text =', await text(form, 1200));
await form.locator('#plan-name').pressSequentially('Supporter, monthly', { delay: 30 });
const radios = form.locator('input[type="radio"]');
log('owner: radios =', JSON.stringify(await radios.evaluateAll((els) => els.map((e) => `${e.value}:${e.disabled ? 'disabled' : 'ok'}`))));
const online = form.locator('input[type="radio"][value="online"]');
if (await online.isDisabled()) throw new Error('Online plan option disabled — org not seen as Stripe-connected by the frontend');
await online.check({ force: true });
await page.waitForTimeout(300);
await shot('a2-plan-form');
const desc = form.locator('#plan-desc');
if ((await desc.count()) > 0) await desc.pressSequentially('Monthly dues by card. Cancel whenever you like.', { delay: 10 });
const price = form.locator('#plan-price');
await price.click();
await price.fill('');
await price.pressSequentially('8', { delay: 60 });
log('owner: price =', await price.inputValue(), '| currency =', await form.locator('#plan-currency').inputValue().catch(() => 'n/a'));
const periodCount = form.locator('#plan-period-count');
log('owner: period count =', await periodCount.inputValue().catch(() => 'n/a'), '| unit =', await form.locator('#plan-period-unit').inputValue().catch(() => 'n/a'));
log('owner: dialog buttons =', JSON.stringify(await form.getByRole('button').allInnerTexts()));
await shot('a3-plan-form-filled');
await form.getByRole('button', { name: 'Create plan' }).click();
await form.waitFor({ state: 'hidden', timeout: 15000 });
const plans = await api(`/api/organization-admin/${org.slug}/plans`, { token: org.owner.token });
const list = plans.results ?? plans.items ?? plans;
const monthly = list.find((p) => p.name === 'Supporter, monthly');
log('verify: plans via API =', list.map((p) => `${p.name} ${p.price} ${p.currency}/${p.period_count}${p.period_unit} ${p.payment_method}`).join(' | '));
if (!monthly || monthly.payment_method !== 'online' || Number(monthly.price) !== 8) throw new Error('monthly plan did not persist as expected');
await vis(page.getByText('Supporter, monthly')).waitFor({ timeout: 10000 });
await shot('a4-plan-created');

// ---- Persona B: the member subscribes ---------------------------------------
await switchUser(member.email, member.password);
const membershipPath = `/org/${org.slug}/membership`;
await gotoReady(membershipPath);
log('member: page text =', await text(page.locator('main').last(), 1600));
const planHeading = vis(page.getByRole('heading', { name: 'Supporter, monthly' }));
await planHeading.waitFor({ timeout: 15000 });
log('member: plan heading y =', (await planHeading.boundingBox())?.y);
const planCard = planHeading.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-card ")][1]');
log('member: plan card text =', await text(planCard, 500));
await shot('b1-membership-page');
const subscribe = planCard.getByRole('button', { name: 'Subscribe' });
await subscribe.waitFor({ timeout: 10000 });
await subscribe.click();
const dialog = page.getByRole('dialog', { name: 'Subscribe to Supporter, monthly' });
await dialog.waitFor({ timeout: 10000 });
log('member: subscribe dialog =', await text(dialog, 1400));
await shot('b2-subscribe-dialog');
await page.keyboard.press('Escape');
await dialog.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
const sub = await subscribeByCard(context, member, org.id, monthly.id);
log('member: subscribed via Stripe →', sub.status, '| period end', sub.current_period_end);
await gotoReady(membershipPath);
log('member: after pay, page text =', await text(page.locator('main').last(), 900));
log('member: "Your plan" count =', await page.getByText('Your plan', { exact: true }).count(), '| Active badge =', await page.getByTestId('membership-subscription-status').filter({ hasText: 'Active' }).count());
await shot('b3-membership-active');
await gotoReady('/account/memberships');
const card = page.getByRole('region', { name: 'Memberships' }).getByRole('article').first();
await card.waitFor({ timeout: 15000 });
log('member: memberships card =', await text(card, 1400));
log('member: buttons =', JSON.stringify(await card.getByRole('button').allInnerTexts()));
const history = page.getByText('Payment history', { exact: true });
log('member: payment history count =', await history.count(), '| box =', await history.first().boundingBox().catch(() => null));
await shot('b4-account-memberships');

// ---- Persona A again: Subscriptions tab, record a cash payment --------------
await switchUser(org.owner.email, org.owner.password);
await gotoReady(membersPath);
await page.getByRole('tab', { name: /Subs/ }).click();
await page.waitForTimeout(1500);
log('owner: subscriptions tab text =', await text(page.locator('main').last(), 1600));
await shot('c1-subscriptions-tab');
const paulRow = vis(page.getByRole('button').filter({ hasText: 'Paul Steiner' }));
await paulRow.waitFor({ timeout: 15000 });
log('owner: Paul row =', await text(paulRow, 300), '| y =', (await paulRow.boundingBox())?.y);
await paulRow.click();
const drawer = page.getByRole('dialog').filter({ hasText: 'Paul Steiner' });
await drawer.waitFor({ timeout: 10000 });
log('owner: drawer text =', await text(drawer, 1400));
await shot('c2-drawer');
const record = drawer.getByRole('button', { name: 'Record payment' });
await record.waitFor({ timeout: 10000 });
await record.click();
const modal = page.getByRole('dialog').filter({ hasText: 'Payment date' }).first();
await modal.locator('#rp-amt').waitFor({ timeout: 10000 });
log('owner: record modal text =', await text(modal, 700));
await modal.locator('#rp-amt').fill('8');
const notes = modal.locator('#rp-notes');
if ((await notes.count()) > 0) await notes.fill('October dues, cash');
await shot('c3-record-payment');
await modal.getByRole('button', { name: 'Record payment' }).click();
await page.waitForTimeout(1500);
log('owner: after record, drawer text =', await text(drawer, 900).catch(() => 'drawer gone'));
await shot('c4-after-record');
const subs = await api(`/api/organization-admin/${org.slug}/subscriptions?page_size=20`, { token: org.owner.token });
const paul = (subs.results ?? subs.items ?? subs).find((s) => (s.user?.email ?? s.user_email) === offliners[0].email);
log('verify: Paul subscription =', JSON.stringify({ status: paul?.status, period_end: paul?.current_period_end }));
const payments = await api(`/api/organization-admin/${org.slug}/subscriptions/${paul.id}/payments`, { token: org.owner.token });
log('verify: Paul payments =', (payments.results ?? payments.items ?? payments).length);

await browser.close();
console.log('PROBE PASSED');
