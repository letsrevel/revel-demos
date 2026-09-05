import { test, showOverlay, withOverlay, demoType } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { createDressedOrg, registerVerifiedUser, makeMember, defaultMembershipTier, getMyMembership } from './arrange-lib.mjs';
import { gotoClean, waitClientAuth, uiLogin, switchUser, showInterstitial } from './clip-helpers';

test.use({ bypassCSP: true });

// Two devices, one credential: the member's QR card, then the door scanner
// resolving the same payload to a named person.
test('clip-membership-card-verify', async ({ page, narration }) => {
	test.setTimeout(540_000);

	// ---- Arrange (not recorded)
	const org = await createDressedOrg({
		name: 'Northside Climbing Collective',
		description:
			'A member-run climbing gym co-op. Membership gets you in the door, onto the walls, and into the group chat where the real beta lives.'
	});
	const member = await registerVerifiedUser('climber', 'Noa', 'Vertical');
	const tier = await defaultMembershipTier(org.slug, org.owner.token);
	await makeMember(org.slug, member.token, org.owner.token, tier.id);
	const membership = await getMyMembership(org.slug, member.token);

	// ---- Scene 1: the member's card
	await uiLogin(page, member.email, member.password);
	await gotoClean(page, '/account/memberships');
	await waitClientAuth(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);
	narration.mark('card');
	await withOverlay(page, 'card', async () => {
		await page.waitForTimeout(1200);
		const show = page.getByRole('button', { name: 'Show card' }).filter({ visible: true }).first();
		await show.scrollIntoViewIfNeeded();
		await show.hover();
		await page.waitForTimeout(600);
		await show.click();
		await page
			.getByRole('img', { name: 'Membership card QR code' })
			.waitFor({ timeout: 10_000 })
			.catch(() => undefined);
		await page.waitForTimeout(Math.max(2000, narration.durationFor('card')));
	});

	// ---- Scene 2: the door check
	await showInterstitial(page, 'Meanwhile, at the door', 'The organizer scans it');
	narration.mark('verify');
	await page.waitForTimeout(2000);
	await switchUser(page, org.owner.email, org.owner.password);
	await gotoClean(page, `/org/${org.slug}/admin/members/verify`);
	await withOverlay(page, 'verify', async () => {
		const input = page.getByLabel('Enter a card code');
		await input.waitFor({ timeout: 15_000 });
		await input.click();
		await demoType(page, input, membership.qr_payload, 12);
		const verify = page.getByRole('button', { name: 'Verify' });
		await verify.hover();
		await page.waitForTimeout(400);
		await verify.click();
		await page
			.getByRole('region', { name: 'Scan result' })
			.waitFor({ timeout: 10_000 })
			.catch(() => undefined);
		await page.waitForTimeout(Math.max(2500, narration.durationFor('verify')));
	});
	await page.waitForTimeout(600);
});
