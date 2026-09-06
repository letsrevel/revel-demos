// Probe the Tiers tab filmed by clip-org-membership.
//
// On camera the three tier cards used to read "Plans — No plans yet." above
// half a screen of whitespace, which says the opposite of the line about
// membership having levels. This arranges the tiers exactly as the clip does —
// blurb + priced plans — and reports what the card actually renders.
//
// It also answers the question that blocked the fix: the frontend refuses to
// create a plan on a tier carrying requires_membership_approval or a
// membership questionnaire (400). Neither is set here, and members are still
// approved into the tiers normally, so both can coexist.
import { chromium } from 'playwright';
import {
	createDressedOrg,
	createMembershipTier,
	createMembershipPlan,
	describeMembershipTier,
	defaultMembershipTier,
	registerVerifiedUser,
	makeMember
} from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const TIERS = [
	{
		name: 'General membership',
		blurb: 'A seat at the table. Members’ nights, and a vote at the annual meeting.',
		plans: [
			{ name: 'Monthly', price: '8.00' },
			{ name: 'Yearly', price: '80.00', period_unit: 'year' }
		]
	},
	{
		name: 'Supporters',
		blurb: 'Pays for the small gigs that never sell out. Brings a guest for free, once a month.',
		plans: [
			{ name: 'Monthly', price: '15.00' },
			{ name: 'Yearly', price: '150.00', period_unit: 'year' }
		]
	},
	{
		name: 'Founders',
		blurb: 'The people who bought the sound system. Free entry to everything, forever.',
		plans: [
			{ name: 'Yearly', price: '250.00', period_unit: 'year' },
			{ name: 'Lifetime', price: '800.00', period_unit: 'lifetime' }
		]
	}
];

const org = await createDressedOrg({
	name: 'Plans Probe Club',
	description: 'A small members club above the old harbour.',
	address: 'Praterstraße 42, 1020 Vienna, Austria'
});
const general = await defaultMembershipTier(org.slug, org.owner.token);
await describeMembershipTier(org.slug, org.owner.token, general, TIERS[0].blurb);
const supporters = await createMembershipTier(org.slug, org.owner.token, 'Supporters', TIERS[1].blurb);
const founders = await createMembershipTier(org.slug, org.owner.token, 'Founders', TIERS[2].blurb);

for (const [tier, spec] of [[general, TIERS[0]], [supporters, TIERS[1]], [founders, TIERS[2]]]) {
	for (const plan of spec.plans) {
		const made = await createMembershipPlan(org.slug, org.owner.token, tier.id, plan);
		console.log(`  ✓ ${tier.name} → ${made.name} ${made.price} ${made.currency} / ${made.period_unit}`);
	}
}

// One approved member per tier, so the cards also carry a member count.
for (const [first, last, tier] of [
	['Marta', 'Ferreira', founders],
	['Ines', 'Bauer', supporters],
	['Tomas', 'Novak', general]
]) {
	const user = await registerVerifiedUser(
		`plans-${first.toLowerCase()}`,
		first,
		last,
		{ emailLocal: `${first}.${last}`.toLowerCase() }
	);
	await makeMember(org.slug, user.token, org.owner.token, tier.id);
}
console.log('  ✓ members approved into tiers that carry plans');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
context.setDefaultTimeout(30_000);

await page.goto(BASE + '/login');
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const reveal = page.getByRole('button', { name: 'Show login form' });
if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
await page.getByLabel('Email address').fill(org.owner.email);
await page.getByLabel('Password', { exact: true }).fill(org.owner.password);
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 });
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 30_000 });

await page.goto(`${BASE}/org/${org.slug}/admin/members`);
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.addStyleTag({ content: 'div[role="alert"]:has(a[href*="mailpit"]){display:none!important}' });
// The Tiers tab is client-rendered off the access token: click it before the
// auth bootstrap lands and it paints "No membership tiers" on camera.
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 30_000 });
await page.waitForLoadState('networkidle').catch(() => undefined);

const tiers = page
	.getByRole('button', { name: /Tiers/ })
	.or(page.getByRole('tab', { name: /Tiers/ }))
	.filter({ visible: true })
	.first();
await tiers.click();
await page.waitForTimeout(2500);

console.log('\n"No plans yet." on screen :', await page.getByText('No plans yet.').count(), '(want 0)');
for (const t of TIERS) {
	console.log(`  ${t.name.padEnd(19)} blurb ${(await page.getByText(t.blurb.slice(0, 40)).count()) ? 'yes' : 'NO '} · plans ${(await page.getByText(t.plans[0].name, { exact: true }).count()) ? 'yes' : 'NO '}`);
}
for (const price of ['€8.00', '€80.00', '€15.00', '€150.00', '€250.00', '€800.00']) {
	process.stdout.write(`${price}:${(await page.getByText(price).count()) ? 'yes' : 'NO'}  `);
}
console.log();

const dir = process.env.SHOT_DIR || '/tmp';
await page.screenshot({ path: `${dir}/membership-plans.png` });
console.log('shot:', `${dir}/membership-plans.png`);
console.log('org :', `${BASE}/org/${org.slug}/admin/members`);
await browser.close();
