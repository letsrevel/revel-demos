import { test, withOverlay } from '@argo-video/cli';
import type { Locator, Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import {
	api,
	createDressedOrg,
	createMembershipPlan,
	createMembershipTier,
	defaultMembershipTier,
	describeMembershipTier,
	markStripeConnected,
	pickFreeOrgName,
	registerVerifiedUser,
	setOrgBilling
} from './arrange-lib.mjs';
// @ts-expect-error plain JS shared with probes
import { subscribeByCard } from './stripe-lib.mjs';
import { glideScroll, uiLogin, switchUser, waitClientAuth } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 17 · "Paid memberships". The organizer creates a monthly card plan
// ON CAMERA; a member reads the plan cards and the subscribe dialog, pays on
// Stripe (off camera, under a cut card) and lands on their memberships page;
// the organizer's Subscriptions tab shows recurring revenue and a cash payment
// is recorded for an offline member. Two personas, three cuts (one of them
// the Stripe hand-off, same persona).
//
// Needs the Stripe test stack: STRIPE_* + CONNECTED_TEST_STRIPE_ID in .env and
// `stripe listen --forward-to localhost:8000/api/stripe/webhook` on the host.
const CARD = {
	episode: 17,
	title: 'Paid memberships',
	pov: 'the organizer, then a member'
};

/** The account chrome, bounded — a screen that never arrives is worse than a flash. */
async function settleAuth(page: Page, ms: number): Promise<void> {
	await page
		.getByRole('button', { name: 'Open notifications' })
		.waitFor({ timeout: ms })
		.catch(() => undefined);
}

const visible = (page: Page, role: Parameters<Page['getByRole']>[0], name: string | RegExp) =>
	page.getByRole(role, { name }).filter({ visible: true }).first();

async function hoverPause(page: Page, target: Locator, ms: number): Promise<void> {
	if (await target.isVisible().catch(() => false)) await target.hover().catch(() => undefined);
	await page.waitForTimeout(ms);
}

test('ep-paid-memberships', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a rowing club, Stripe-connected, a Supporter
	// tier with a yearly card plan and an offline plan that two members pay in
	// cash. The monthly card plan is created on camera.
	const orgName = await pickFreeOrgName([
		'Kanalufer Rowing Club',
		'Alte Donau Rowing Club',
		'Ruderverein Kaisermühlen',
		'Handelskai Rowing Club',
		'Freudenau Rowing Club',
		'Donauinsel Rowing Club',
		'Kaiserwasser Rowing Club',
		'Lobau Rowing Club',
		'Prater Rowing Club',
		'Reichsbrücke Rowing Club'
	]);
	const address = 'Am Kaisermühlendamm 10, 1220 Vienna, Austria';
	const org = await createDressedOrg({
		name: orgName,
		description:
			'A rowing club on the Old Danube with forty boats, one coffee machine and members from eighteen to eighty. Dues keep the boathouse roof on and the coach paid. Beginners welcome from April to October.',
		address
	});
	if (!(await markStripeConnected(org.slug))) {
		throw new Error('The organization could not be marked Stripe-connected — is CONNECTED_TEST_STRIPE_ID in .env?');
	}
	await setOrgBilling(org.slug, org.owner.token, {
		billing_name: `${orgName} (Verein)`,
		billing_address: address,
		billing_email: org.owner.email
	});
	// The default free tier renders as an empty column on the membership page
	// unless it says something.
	const general = await defaultMembershipTier(org.slug, org.owner.token);
	await describeMembershipTier(
		org.slug,
		org.owner.token,
		general,
		'Friends of the club: the newsletter, open days on the water, and first dibs on the summer regatta tickets.'
	).catch(() => undefined);
	const tier = await createMembershipTier(
		org.slug,
		org.owner.token,
		'Supporter',
		'Full member: boat access, coaching on Tuesdays and Thursdays, a key to the boathouse, and a vote at the general meeting.'
	);
	await createMembershipPlan(org.slug, org.owner.token, tier.id, {
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
	const member = await registerVerifiedUser('member', 'Noor', 'Haddad', { emailLocal: 'noor.haddad' });
	const offliners = await Promise.all([
		registerVerifiedUser('m1', 'Paul', 'Steiner', { emailLocal: 'paul.steiner' }),
		registerVerifiedUser('m2', 'Greta', 'Lindner', { emailLocal: 'greta.lindner' })
	]);
	for (const u of offliners) {
		const me = await api('/api/account/me', { token: u.token });
		await api(`/api/organization-admin/${org.slug}/subscriptions`, {
			token: org.owner.token,
			body: {
				plan_id: cashPlan.id,
				user_id: me.id,
				initial_payment_amount: '8.00',
				initial_payment_currency: 'EUR',
				initial_payment_notes: 'Cash at the boathouse'
			}
		});
	}
	const context = page.context();
	const membersPath = `/org/${org.slug}/admin/members`;
	const membershipPath = `/org/${org.slug}/membership`;

	// ---- Setup (not recorded): log in as the owner, prime the admin bundle.
	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	const primer = await context.newPage();
	await primer.goto(membersPath).catch(() => undefined);
	await primer.waitForLoadState('networkidle').catch(() => undefined);
	await primer.close();

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: Tiers tab → Add plan → the form's payment methods.
	await titleCardCutTo(page, CARD, membersPath);
	await settleAuth(page, 4000);
	const tiersTab = page.getByRole('tab', { name: 'Tiers' });
	await tiersTab.waitFor({ timeout: 10_000 }).catch(() => undefined);
	if (await tiersTab.isVisible().catch(() => false)) await tiersTab.click();
	const supporter = visible(page, 'heading', 'Supporter');
	await supporter.waitFor({ timeout: 10_000 }).catch(() => undefined);
	const tierCard = supporter.locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
	const addPlan = tierCard.getByRole('button', { name: 'Add plan' }).filter({ visible: true }).first();
	await addPlan.waitFor({ timeout: 8000 }).catch(() => undefined);
	const addBox = await addPlan.boundingBox().catch(() => null);
	if (addBox && addBox.y > 760) await glideScroll(page, addBox.y - 560, 1200);
	await page.waitForTimeout(400);
	narration.mark('plans');
	const form = page.getByRole('dialog');
	await withOverlay(page, 'plans', async () => {
		if (await addPlan.isVisible().catch(() => false)) {
			await addPlan.hover();
			await page.waitForTimeout(400);
			await addPlan.click();
		}
		await form.locator('#plan-name').waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(500);
		const name = form.locator('#plan-name');
		if (await name.isVisible().catch(() => false)) {
			await name.click();
			await name.pressSequentially('Supporter, monthly', { delay: 55 });
		}
		await page.waitForTimeout(400);
		// The three payment methods, pointed at while the line names them.
		const online = form.locator('input[type="radio"][value="online"]');
		const offline = form.locator('input[type="radio"][value="offline"]');
		const free = form.locator('input[type="radio"][value="free"]');
		await hoverPause(page, online, 1400);
		if (await online.isEnabled().catch(() => false)) await online.check({ force: true }).catch(() => undefined);
		await hoverPause(page, offline, 1600);
		await hoverPause(page, free, 1200);
		await hoverPause(page, online, 600);
		await page.waitForTimeout(Math.max(500, narration.durationFor('plans')));
	});

	// ---- Scene: description, price, create. Same dialog.
	narration.mark('price');
	await withOverlay(page, 'price', async () => {
		const desc = form.locator('#plan-desc');
		if (await desc.isVisible().catch(() => false)) {
			await desc.click();
			await desc.pressSequentially('Monthly dues by card. Cancel whenever you like.', { delay: 18 });
		}
		const price = form.locator('#plan-price');
		if (await price.isVisible().catch(() => false)) {
			await price.click();
			await price.fill('');
			await price.pressSequentially('8', { delay: 120 });
		}
		await page.waitForTimeout(600);
		const create = form.getByRole('button', { name: 'Create plan' });
		if (await create.isVisible().catch(() => false)) {
			await create.hover();
			await page.waitForTimeout(450);
			if (await create.isEnabled().catch(() => false)) await create.click();
		}
		await form.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
		const created = page.getByText('Supporter, monthly').filter({ visible: true }).first();
		await created.waitFor({ timeout: 15_000 }).catch(() => undefined);
		await hoverPause(page, created, 800);
		await page.waitForTimeout(Math.max(1200, narration.durationFor('price')));
	});
	// Self-healing: the member scene needs the monthly card plan to exist.
	const plans = await api(`/api/organization-admin/${org.slug}/plans`, { token: org.owner.token });
	let monthly = (plans.results ?? plans.items ?? plans).find((p: { name: string }) => p.name === 'Supporter, monthly');
	if (!monthly) {
		console.warn('monthly plan did not save from the form — creating it through the API');
		monthly = await createMembershipPlan(org.slug, org.owner.token, tier.id, {
			name: 'Supporter, monthly',
			price: '8.00',
			period_unit: 'month',
			payment_method: 'online',
			description: 'Monthly dues by card. Cancel whenever you like.'
		});
	}

	// ---- Cut: the member on the club's membership page.
	await episodeCut(page, 'The other side', 'Joining the club', membershipPath, {
		during: () => switchUser(page, member.email, member.password)
	});
	await settleAuth(page, 4000);
	const planHeading = visible(page, 'heading', 'Supporter, monthly');
	await planHeading.waitFor({ timeout: 10_000 }).catch(() => undefined);
	const planBox = await planHeading.boundingBox().catch(() => null);
	// Bring the Supporter tier's plan cards up under the header (silent).
	if (planBox && planBox.y > 640) await glideScroll(page, planBox.y - 420, 1400);
	await page.mouse.move(700, 600);
	await page.waitForTimeout(300);
	// Stripe's hosted checkout takes ~10 s on the side page. Start it NOW, under
	// the "join" line, so the "On Stripe" cut card only has to cover whatever is
	// left of it (a second or two) instead of the whole round trip.
	const paying = subscribeByCard(context, member, org.id, monthly.id).catch((e: Error) =>
		console.warn('card subscription did not complete:', e.message)
	);
	narration.mark('join');
	await withOverlay(page, 'join', async () => {
		const planCard = planHeading.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-card ")][1]');
		await hoverPause(page, planCard, 1500);
		const subscribe = planCard.getByRole('button', { name: 'Subscribe' });
		if (await subscribe.isVisible().catch(() => false)) {
			await subscribe.hover();
			await page.waitForTimeout(400);
			await subscribe.click();
		}
		const dialog = page.getByRole('dialog', { name: 'Subscribe to Supporter, monthly' });
		await dialog.waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(800);
		const billing = dialog.getByText('How billing works', { exact: true });
		if (await billing.isVisible().catch(() => false)) {
			await billing.hover();
			await page.waitForTimeout(300);
			await billing.click().catch(() => undefined);
			await page.waitForTimeout(1500);
		}
		const cta = dialog.getByRole('button', { name: 'Continue to payment' });
		await hoverPause(page, cta, 600);
		await page.waitForTimeout(Math.max(1500, narration.durationFor('join')));
	});

	// ---- Cut: Stripe's hosted checkout on a side page under the card; the
	// recorded page comes back on the member's own memberships page.
	await episodeCut(page, 'On Stripe', 'Paying by card', '/account/memberships', {
		holdMs: 400,
		during: () => paying
	});
	await settleAuth(page, 4000);
	const memberCard = page.getByRole('region', { name: 'Memberships' }).getByRole('article').first();
	await memberCard.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await memberCard.getByText('Active').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
	await page.waitForTimeout(500);
	narration.mark('mine');
	await withOverlay(page, 'mine', async () => {
		await hoverPause(page, memberCard.getByText(/Next renewal/).first(), 1600);
		const history = memberCard.getByRole('button', { name: 'Payment history' });
		if (await history.isVisible().catch(() => false)) {
			await history.hover();
			await page.waitForTimeout(300);
			await history.click();
			await page.waitForTimeout(1600);
		}
		await hoverPause(page, memberCard.getByRole('button', { name: 'Change plan' }), 1200);
		await hoverPause(page, memberCard.getByRole('button', { name: 'Cancel membership' }), 1200);
		await page.waitForTimeout(Math.max(1200, narration.durationFor('mine')));
	});

	// ---- Cut: the organizer's Subscriptions tab.
	await episodeCut(page, 'Back at the club', 'Who pays what', `${membersPath}`, {
		during: () => switchUser(page, org.owner.email, org.owner.password)
	});
	await settleAuth(page, 4000);
	const subsTab = page.getByRole('tab', { name: /Subs/ });
	await subsTab.waitFor({ timeout: 10_000 }).catch(() => undefined);
	if (await subsTab.isVisible().catch(() => false)) await subsTab.click();
	const mrr = page.getByText('Monthly recurring revenue').first();
	await mrr.waitFor({ timeout: 10_000 }).catch(() => undefined);
	const paulRow = page.getByRole('button').filter({ hasText: 'Paul Steiner' }).filter({ visible: true }).first();
	await paulRow.waitFor({ timeout: 15_000 }).catch(() => undefined);
	// Frame the metrics and the rows together (silent).
	const mrrBox = await mrr.boundingBox().catch(() => null);
	if (mrrBox && mrrBox.y > 300) await glideScroll(page, mrrBox.y - 220, 1300);
	await page.mouse.move(1500, 500);
	await page.waitForTimeout(300);
	narration.mark('dues');
	await withOverlay(page, 'dues', async () => {
		await hoverPause(page, mrr, 1800);
		await hoverPause(page, page.getByText('Active subscribers').first(), 1400);
		const noorRow = page.getByRole('button').filter({ hasText: 'Noor Haddad' }).filter({ visible: true }).first();
		await hoverPause(page, noorRow, 1400);
		await hoverPause(page, paulRow, 800);
		await page.waitForTimeout(Math.max(800, narration.durationFor('dues')));
	});

	// ---- Scene: Paul's drawer → Record payment.
	narration.mark('record');
	await withOverlay(page, 'record', async () => {
		if (await paulRow.isVisible().catch(() => false)) await paulRow.click();
		const drawer = page.getByRole('dialog').filter({ hasText: 'Paul Steiner' });
		await drawer.waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(1000);
		const record = drawer.getByRole('button', { name: 'Record payment' });
		if (await record.isVisible().catch(() => false)) {
			await record.hover();
			await page.waitForTimeout(400);
			await record.click();
		}
		const modal = page.getByRole('dialog').filter({ hasText: 'Payment date' }).first();
		const amount = modal.locator('#rp-amt');
		if (await amount.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) {
			await amount.click();
			await amount.fill('');
			await amount.pressSequentially('8', { delay: 120 });
			const notes = modal.locator('#rp-notes');
			if (await notes.isVisible().catch(() => false)) {
				await notes.click();
				await notes.pressSequentially('October dues, cash', { delay: 30 });
			}
			await page.waitForTimeout(500);
			const submit = modal.getByRole('button', { name: 'Record payment' });
			if (await submit.isVisible().catch(() => false)) {
				await submit.hover();
				await page.waitForTimeout(400);
				await submit.click();
			}
			await modal.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
		}
		await drawer.getByText(/Next renewal/).first().waitFor({ timeout: 8000 }).catch(() => undefined);
		await hoverPause(page, drawer.getByText(/Next renewal/).first(), 1200);
		await page.waitForTimeout(Math.max(1500, narration.durationFor('record')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
