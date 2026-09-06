import { test, withOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import {
	createDressedOrg,
	createMembershipTier,
	createMembershipPlan,
	describeMembershipTier,
	defaultMembershipTier,
	registerVerifiedUser,
	makeMember
} from './arrange-lib.mjs';
import { gotoClean, waitClientAuth, uiLogin, glideScroll } from './clip-helpers';

test.use({ bypassCSP: true });

// A real club has more than one member and more than one kind of member. The
// seeded orgs have either one member (The Velvet Cellar) or the standard seed's
// QA fixtures, so this clip builds its own cast — which also means it survives
// a reseed.
// What each tier is for, and what it costs. Without these the Tiers tab films
// as three boxes reading "No plans yet." above half a screen of whitespace —
// which says the opposite of the line about membership having levels. Prices
// are a small club's real prices, not enterprise numbers.
const TIERS: Array<{ name: string; blurb: string; plans: Array<{ name: string; price: string; period_unit?: string }> }> = [
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

const CAST: Array<[string, string, 'Supporters' | 'Founders' | null]> = [
	['Marta', 'Ferreira', 'Founders'],
	['Jonah', 'Adeyemi', 'Founders'],
	['Ines', 'Bauer', 'Supporters'],
	['Kwame', 'Osei', 'Supporters'],
	['Sanne', 'de Vries', null],
	['Tomas', 'Novak', null]
];

test('clip-org-membership', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a club with tiers and six members.
	const org = await createDressedOrg({
		name: 'Hafenklang Social Club',
		description:
			'A small members club above the old harbour. Live music on Fridays, records and cheap beer the rest of the week. Run by the people who show up.',
		address: 'Praterstraße 42, 1020 Vienna, Austria'
	});
	// "General membership" is created with the org, so it is described rather
	// than created; the other two are new. Then every tier gets its prices.
	const general = await defaultMembershipTier(org.slug, org.owner.token);
	await describeMembershipTier(org.slug, org.owner.token, general, TIERS[0].blurb);
	const supporters = await createMembershipTier(
		org.slug,
		org.owner.token,
		'Supporters',
		TIERS[1].blurb
	);
	const founders = await createMembershipTier(
		org.slug,
		org.owner.token,
		'Founders',
		TIERS[2].blurb
	);
	const tierByName: Record<string, { id: string }> = {
		Supporters: supporters,
		Founders: founders
	};
	for (const [tier, spec] of [
		[general, TIERS[0]],
		[supporters, TIERS[1]],
		[founders, TIERS[2]]
	] as const) {
		for (const plan of spec.plans) {
			await createMembershipPlan(org.slug, org.owner.token, tier.id, plan);
		}
	}
	for (const [first, last, tierName] of CAST) {
		// These addresses are on camera in the members list, so give them a
		// human shape rather than the default demo-<label>-<stamp> form.
		const emailLocal = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '');
		const user = await registerVerifiedUser(`member-${first.toLowerCase()}`, first, last, {
			emailLocal
		});
		const tier = tierName ? tierByName[tierName] : general;
		await makeMember(org.slug, user.token, org.owner.token, tier.id);
	}

	// ---- Setup (not recorded).
	await uiLogin(page, org.owner.email, org.owner.password);
	// Auth bootstrap waits here, on the dashboard; every page after this waits
	// for its own content instead. Re-waiting for the bell on a heavy admin page
	// races and has cost takes.
	await waitClientAuth(page);
	await gotoClean(page, `/org/${org.slug}/admin/events/new`);
	// Two radio groups on this form carry a "members-only" value; the first is
	// the Visibility group, which is the one on camera.
	await page
		.locator('input[type=radio][value="members-only"]')
		.first()
		.waitFor({ state: 'attached', timeout: 20_000 });
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// ---- Scene 1: the event form, and the choice of who an event is for.
	narration.mark('rules');
	await withOverlay(page, 'rules', async () => {
		await page.waitForTimeout(1000);
		const membersOnly = page.locator('input[type=radio][value="members-only"]').first();
		await glideScroll(page, 620, 2000);
		await membersOnly.scrollIntoViewIfNeeded();
		await page.waitForTimeout(700);
		// The input is visually replaced by its card, so force the click through.
		await membersOnly.click({ force: true });
		await page.waitForTimeout(1400);
		await page.waitForTimeout(Math.max(0, narration.durationFor('rules')));
	});

	// ---- Scene 2: where membership actually lives.
	//
	// The navigation happens AFTER the mark, and as an in-app click rather than
	// a full load. Navigating before the mark put the members page on screen
	// during the OUTGOING fade, so it faded to black and back to the very same
	// page — which reads as a stutter, not a cut.
	narration.mark('members');
	const membersLink = page
		.getByRole('link', { name: 'Members', exact: true })
		.filter({ visible: true })
		.first();
	if (await membersLink.count()) {
		await membersLink.click();
	} else {
		await gotoClean(page, `/org/${org.slug}/admin/members`);
	}
	await page
		.getByText(`${CAST[0][0]} ${CAST[0][1]}`)
		.filter({ visible: true })
		.first()
		.waitFor({ timeout: 20_000 })
		.catch(() => undefined);

	await withOverlay(page, 'members', async () => {
		await page.waitForTimeout(1400);
		await glideScroll(page, 320, 1800);
		// Tiers is the tab that makes the point: membership is not one flat list.
		const tiers = page
			.getByRole('button', { name: /Tiers/ })
			.or(page.getByRole('tab', { name: /Tiers/ }))
			.filter({ visible: true })
			.first();
		if (await tiers.count()) {
			await tiers.hover();
			await page.waitForTimeout(400);
			await tiers.click();
			await page.waitForTimeout(1800);
		}
		await page.waitForTimeout(Math.max(0, narration.durationFor('members')));
	});
});
