import { test, showOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { createDressedOrg, createEvent, attachQuestionnaire, registerVerifiedUser, makeMember, defaultMembershipTier, inviteToEvent } from './arrange-lib.mjs';
import { gotoClean, waitClientAuth, uiLogin, switchUser, showInterstitial } from './clip-helpers';

test.use({ bypassCSP: true });

// One members-only RSVP event; three viewers hit three different gates.
test('clip-eligibility-gates', async ({ page, narration }) => {
	test.setTimeout(540_000);

	// ---- Arrange (not recorded)
	const org = await createDressedOrg({
		name: 'Paper Hearts Book Club',
		description:
			'A cosy queer book club that meets once a month over tea and biscuits. New faces welcome — we just like to know who is coming.'
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Monthly Reading Circle',
		event_type: 'members-only',
		requires_ticket: false,
		max_attendees: 20,
		description:
			'This month we are reading short stories and arguing gently about them. Bring the book if you have it, bring yourself either way.'
	});
	await attachQuestionnaire(org.id, event.id, org.owner.token, {
		name: 'Reading Circle Intro',
		min_score: 0,
		evaluation_mode: 'manual',
		status: 'published',
		freetextquestion_questions: [
			{ question: 'What was the last book you loved?', is_mandatory: true }
		]
	});
	const [outsider, member, invitee] = await Promise.all([
		registerVerifiedUser('outsider', 'Sam', 'Curious'),
		registerVerifiedUser('member', 'Noa', 'Reader'),
		registerVerifiedUser('invitee', 'Kim', 'Guest')
	]);
	const tier = await defaultMembershipTier(org.slug, org.owner.token);
	await makeMember(org.slug, member.token, org.owner.token, tier.id);
	await inviteToEvent(event.id, org.owner.token, [invitee.email], {
		waives_questionnaire: true,
		waives_membership_required: true
	});

	// ---- Viewer 1: outsider → "Members only"
	await uiLogin(page, outsider.email, outsider.password);
	await gotoClean(page, event.path);
	await waitClientAuth(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);
	narration.mark('blocked');
	await showOverlay(page, 'blocked', narration.durationFor('blocked'));
	const membersOnly = page.getByText('Members only').filter({ visible: true }).first();
	await membersOnly.scrollIntoViewIfNeeded().catch(() => undefined);
	await page
		.getByRole('button', { name: 'Join Organization' })
		.filter({ visible: true })
		.first()
		.hover()
		.catch(() => undefined);
	await page.waitForTimeout(Math.max(1500, narration.durationFor('blocked')));

	// ---- Viewer 2: member without questionnaire → "Questionnaire required"
	await showInterstitial(page, 'Same event', 'As a member who hasn’t applied yet');
	narration.mark('questionnaire');
	await page.waitForTimeout(2000);
	await switchUser(page, member.email, member.password);
	await gotoClean(page, event.path);
	await showOverlay(page, 'questionnaire', narration.durationFor('questionnaire'));
	await page
		.getByRole('button', { name: 'Complete Questionnaire' })
		.filter({ visible: true })
		.first()
		.hover()
		.catch(() => undefined);
	await page.waitForTimeout(Math.max(1500, narration.durationFor('questionnaire')));

	// ---- Viewer 3: invited guest with waivers → "Will you attend?"
	await showInterstitial(page, 'Same event', 'As an invited guest');
	narration.mark('invited');
	await page.waitForTimeout(2000);
	await switchUser(page, invitee.email, invitee.password);
	await gotoClean(page, event.path);
	await showOverlay(page, 'invited', narration.durationFor('invited'));
	const rsvp = page.getByText('Will you attend?').filter({ visible: true }).first();
	await rsvp.scrollIntoViewIfNeeded().catch(() => undefined);
	await page.waitForTimeout(Math.max(1500, narration.durationFor('invited')));
	await page.waitForTimeout(600);
});
