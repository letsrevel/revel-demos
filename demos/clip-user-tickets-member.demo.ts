import { test, showOverlay, withOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { createDressedOrg, createEvent, createTier, deleteDefaultTier, registerVerifiedUser, makeMember, defaultMembershipTier } from './arrange-lib.mjs';
import { gotoClean, waitClientAuth, uiLogin, switchUser, showInterstitial, slowScroll } from './clip-helpers';

test.use({ bypassCSP: true });

test('clip-user-tickets-member', async ({ page, narration }) => {
	test.setTimeout(540_000);

	// ---- Arrange (not recorded): club org, event with a public + a members-only tier.
	const org = await createDressedOrg({
		name: 'The Velvet Cellar',
		description:
			'An independent club night in a basement that has seen things. Local DJs, cheap cloakroom, no guest-list politics — but members get treated right.'
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Basement Sessions: Live & Loud',
		description:
			'Our monthly late-night session: two local acts, one long DJ set, and the good speakers. Doors at eleven, music until we drop.'
	});
	await deleteDefaultTier(event.id, org.owner.token);
	await createTier(event.id, org.owner.token, {
		name: 'General Admission',
		payment_method: 'at_the_door',
		price: '15.00'
	});
	await createTier(event.id, org.owner.token, {
		name: 'Members — Free Entry',
		payment_method: 'free',
		price: '0.00',
		visibility: 'members-only',
		purchasable_by: 'members'
	});
	const [guest, member] = await Promise.all([
		registerVerifiedUser('guest', 'Sam', 'Visitor'),
		registerVerifiedUser('member', 'Noa', 'Member')
	]);
	const tier = await defaultMembershipTier(org.slug, org.owner.token);
	await makeMember(org.slug, member.token, org.owner.token, tier.id);

	// ---- Guest view
	await uiLogin(page, guest.email, guest.password);
	await gotoClean(page, event.path);
	await waitClientAuth(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);
	narration.mark('guest');
	await withOverlay(page, 'guest', async () => {
		await page.waitForTimeout(1200);
		const ticketHeading = page
			.getByRole('heading', { name: 'Ticket Options' })
			.filter({ visible: true })
			.first();
		await ticketHeading.scrollIntoViewIfNeeded();
		await slowScroll(page, 200, 1000);
		const ga = page.getByRole('heading', { name: 'General Admission' }).filter({ visible: true }).first();
		await ga.hover();
		await page.waitForTimeout(Math.max(1200, narration.durationFor('guest')));
	});

	// ---- Cut: member view of the same page
	await showInterstitial(page, 'Same event', 'Through a member’s eyes');
	narration.mark('member');
	await page.waitForTimeout(2000);
	await switchUser(page, member.email, member.password);
	await gotoClean(page, event.path);
	await showOverlay(page, 'member', narration.durationFor('member'));
	const memberTier = page
		.getByRole('heading', { name: 'Members — Free Entry' })
		.filter({ visible: true })
		.first();
	await memberTier.scrollIntoViewIfNeeded();
	await memberTier.hover();
	await page.waitForTimeout(Math.max(1500, narration.durationFor('member')));
	await page.waitForTimeout(600);
});
