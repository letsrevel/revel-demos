import { test, withOverlay } from '@argo-video/cli';
import type { Locator, Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import {
	api,
	createDressedOrg,
	createEvent,
	createTier,
	deleteDefaultTier,
	markStripeConnected,
	pickFreeOrgName,
	registerVerifiedUser,
	setOrgBilling
} from './arrange-lib.mjs';
// @ts-expect-error plain JS shared with probes
import { buyTicketByCard } from './stripe-lib.mjs';
import { glideScroll, uiLogin, switchUser, waitClientAuth } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 16 · "When plans change". The organizer puts a refund policy on a
// card-paid tier ON CAMERA; a buyer sees the terms in the checkout sheet, pays
// (on Stripe, off camera, under a cut card), then cancels the ticket and is
// quoted the refund; the organizer's list shows the refunded row and the
// cancel-event dialog previews refunding every ticket. Two personas, three
// cuts (one of them the Stripe hand-off, same persona).
//
// Needs the Stripe test stack: STRIPE_* + CONNECTED_TEST_STRIPE_ID in .env and
// `stripe listen --forward-to localhost:8000/api/stripe/webhook` on the host.
const CARD = {
	episode: 16,
	title: 'When plans change',
	pov: 'the organizer, then an attendee'
};

// Demo mode prints a "Demo Payment Test Card" hint box under the ticket tiers.
// Hide it the way the demo banner is hidden — on every document this page loads.
const DEMO_CARD_HINT_CSS = '.bg-info\\/10.border-info\\/30{display:none!important}';

/** The account chrome, bounded — a screen that never arrives is worse than a flash. */
async function settleAuth(page: Page, ms: number): Promise<void> {
	await page
		.getByRole('button', { name: 'Open notifications' })
		.waitFor({ timeout: ms })
		.catch(() => undefined);
}

const visible = (page: Page, role: Parameters<Page['getByRole']>[0], name: string | RegExp) =>
	page.getByRole(role, { name }).filter({ visible: true }).first();

/** Smooth-scroll a field into the middle of a scrollable dialog. */
async function glideIntoDialog(page: Page, target: Locator, ms = 600): Promise<void> {
	await target
		.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
		.catch(() => undefined);
	await page.waitForTimeout(ms);
}

/** Type into a field with a visible cursor, replacing what is there. */
async function typeInto(field: Locator, value: string, delay = 70): Promise<void> {
	await field.click();
	await field.fill('');
	await field.pressSequentially(value, { delay });
}

/**
 * A DurationInput is a number box plus a unit picker button right after it.
 * Fresh bracket rows can show "Days" yet convert as hours, so pick the unit
 * explicitly, then type in that unit.
 */
async function setDuration(page: Page, input: Locator, hours: number, unit: 'Hours' | 'Days'): Promise<void> {
	const trigger = input.locator('xpath=following::button[1]');
	const current = (await trigger.innerText().catch(() => '')).trim();
	if (!new RegExp(unit, 'i').test(current)) {
		await trigger.click();
		const opt = page.getByRole('option', { name: unit });
		if (await opt.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) await opt.click();
		else await page.keyboard.press('Escape');
		await page.waitForTimeout(250);
	}
	await typeInto(input, String(unit === 'Days' ? hours / 24 : hours));
}

test('ep-when-plans-change', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a film club, Stripe-connected, one double
	// feature with a card-paid tier — no refund policy yet, that is the scene.
	const orgName = await pickFreeOrgName([
		'Lichtspiel Film Club',
		'Kinoklub Ottakring',
		'Nachtvorstellung Film Club',
		'Projektor Film Club',
		'Zelluloid Film Club',
		'Filmklub Gürtel',
		'Kino im Eck',
		'Vorstadt Film Club',
		'Flimmern Film Club',
		'Filmclub Yppenplatz',
		'Leinwand Film Club',
		'Sechzehn Film Club'
	]);
	const address = 'Thaliastraße 46, 1160 Vienna, Austria';
	const org = await createDressedOrg({
		name: orgName,
		description:
			'A film club in a former corner shop in Ottakring. One screening a month, 35 millimetre when we can get it, and a discussion afterwards that usually outlasts the film. Run by five volunteers since 2016.',
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
	// Ten days out, so the "a week before" bracket is comfortably in force when
	// the buyer cancels a minute after paying.
	const start = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
	start.setUTCHours(18, 30, 0, 0);
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Double Feature: Wings of Desire & Paris, Texas',
		description:
			'Two Wim Wenders films back to back, with a short break for coffee and cake between them. Doors at six, first film at half past. Numbered seats are not a thing here — come early for the good chairs.',
		address,
		start: start.toISOString(),
		end: new Date(start.getTime() + 4 * 60 * 60 * 1000).toISOString(),
		max_attendees: 40,
		// The checkout sheet (where the terms live) only opens when names are
		// required or the cart spans tiers.
		require_ticket_names: true
	});
	await deleteDefaultTier(event.id, org.owner.token);
	const tier = await createTier(event.id, org.owner.token, {
		name: 'Standard',
		description: 'One seat for both films, coffee and cake included.',
		payment_method: 'online',
		price: '18.00',
		total_quantity: 40
	});
	const buyer = await registerVerifiedUser('buyer', 'Mara', 'Lindqvist', { emailLocal: 'mara.lindqvist' });
	const others = await Promise.all([
		registerVerifiedUser('a1', 'Tobias', 'Reiter', { emailLocal: 'tobias.reiter' }),
		registerVerifiedUser('a2', 'Ines', 'Kovač', { emailLocal: 'ines.kovac' })
	]);
	const context = page.context();
	for (const u of others) await buyTicketByCard(context, u, event.id, tier.id);

	const adminPath = `/org/${org.slug}/admin/events/${event.id}/edit?tab=ticketing`;
	const ticketsPath = `/org/${org.slug}/admin/events/${event.id}/tickets`;

	// ---- Setup (not recorded): hide the demo card hint on every document,
	// log in as the owner, prime the admin bundles.
	await page.addInitScript((css: string) => {
		const install = (): void => {
			const style = document.createElement('style');
			style.textContent = css;
			document.head.append(style);
		};
		if (document.head) install();
		else document.addEventListener('DOMContentLoaded', install, { once: true });
	}, DEMO_CARD_HINT_CSS);
	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	const primer = await context.newPage();
	for (const path of [adminPath, ticketsPath]) {
		await primer.goto(path).catch(() => undefined);
		await primer.waitForLoadState('networkidle').catch(() => undefined);
	}
	await primer.close();

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: the tier's edit form, "Cancellation & refunds" — toggle + deadline.
	await titleCardCutTo(page, CARD, adminPath);
	await settleAuth(page, 4000);
	await visible(page, 'heading', 'Ticket Tiers').waitFor({ timeout: 10_000 }).catch(() => undefined);
	const standard = visible(page, 'heading', 'Standard');
	await standard.waitFor({ timeout: 10_000 }).catch(() => undefined);
	const card = standard.locator('xpath=ancestor::*[self::article or self::li or contains(@class,"rounded")][1]');
	const editBtn = card.getByRole('button', { name: /Edit/ }).filter({ visible: true }).first();
	await editBtn.waitFor({ timeout: 8000 }).catch(() => undefined);
	await page.waitForTimeout(400);
	narration.mark('policy');
	const form = page.getByRole('dialog');
	await withOverlay(page, 'policy', async () => {
		if (await editBtn.isVisible().catch(() => false)) {
			await editBtn.hover();
			await page.waitForTimeout(400);
			await editBtn.click();
		}
		await form.getByRole('heading', { name: 'Edit Ticket Tier' }).waitFor({ timeout: 10_000 }).catch(() => undefined);
		const section = form.getByText('Cancellation & refunds', { exact: true });
		await section.waitFor({ timeout: 10_000 }).catch(() => undefined);
		await glideIntoDialog(page, section, 900);
		const toggle = form.getByLabel('Allow attendees to cancel their tickets');
		if (await toggle.isVisible().catch(() => false)) {
			await toggle.hover();
			await page.waitForTimeout(500);
			await toggle.click();
		}
		await page.waitForTimeout(600);
		const deadline = form.locator('#cancellation-deadline-hours');
		if (await deadline.waitFor({ timeout: 6000 }).then(() => true).catch(() => false)) {
			await glideIntoDialog(page, deadline, 500);
			await setDuration(page, deadline, 24, 'Days');
		}
		await page.waitForTimeout(Math.max(600, narration.durationFor('policy')));
	});

	// ---- Scene: the brackets, then save. Same dialog.
	narration.mark('brackets');
	await withOverlay(page, 'brackets', async () => {
		const bracketsTitle = form.getByText('Refund brackets', { exact: true });
		await glideIntoDialog(page, bracketsTitle, 500);
		const addBracket = form.getByRole('button', { name: 'Add another bracket' }).first();
		if (await addBracket.isVisible().catch(() => false)) {
			await addBracket.hover();
			await page.waitForTimeout(300);
			await addBracket.click();
		}
		const h0 = form.locator('#refund-hours-0');
		if (await h0.waitFor({ timeout: 6000 }).then(() => true).catch(() => false)) {
			await setDuration(page, h0, 168, 'Hours');
			await typeInto(form.locator('#refund-pct-0'), '100');
		}
		await page.waitForTimeout(400);
		if (await addBracket.isVisible().catch(() => false)) await addBracket.click();
		const h1 = form.locator('#refund-hours-1');
		if (await h1.waitFor({ timeout: 6000 }).then(() => true).catch(() => false)) {
			await glideIntoDialog(page, h1, 400);
			await setDuration(page, h1, 48, 'Hours');
			await typeInto(form.locator('#refund-pct-1'), '50');
		}
		await page.waitForTimeout(900);
		const save = form.getByRole('button', { name: 'Save Changes' });
		await glideIntoDialog(page, save, 500);
		if (await save.isEnabled().catch(() => false)) {
			await save.hover();
			await page.waitForTimeout(400);
			await save.click();
			await form.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
		}
		// Self-healing: whatever the form did, the rest of the episode needs the
		// policy on the tier. Verify, and set it through the API if it is missing.
		const tiers = await api(`/api/event-admin/${event.id}/ticket-tiers`, { token: org.owner.token });
		const saved = (tiers.results ?? tiers.items ?? tiers).find((t: { id: string }) => t.id === tier.id);
		if (!saved?.allow_user_cancellation || (saved.refund_policy?.tiers ?? []).length !== 2) {
			console.warn('policy did not save from the form — setting it through the API');
			// The tier endpoint is a full PUT — send the saved tier back with the policy on it.
			await api(`/api/event-admin/${event.id}/ticket-tier/${tier.id}`, {
				method: 'PUT',
				token: org.owner.token,
				body: {
					...saved,
					allow_user_cancellation: true,
					cancellation_deadline_hours: 24,
					refund_policy: {
						tiers: [
							{ hours_before_event: 168, refund_percentage: '100' },
							{ hours_before_event: 48, refund_percentage: '50' }
						],
						flat_fee: '0'
					}
				}
			}).catch((e: Error) => console.warn('API fallback failed too:', e.message));
		}
		await page.waitForTimeout(Math.max(1200, narration.durationFor('brackets')));
	});

	// ---- Cut: the buyer on the event page — the terms in the checkout sheet.
	await episodeCut(page, 'The other side', 'Buying a ticket', event.path, {
		during: () => switchUser(page, buyer.email, buyer.password)
	});
	await settleAuth(page, 4000);
	await page.getByRole('region', { name: 'Ticket Options' }).waitFor({ timeout: 10_000 }).catch(() => undefined);
	const optionsHeading = visible(page, 'heading', 'Ticket Options');
	const optBox = await optionsHeading.boundingBox().catch(() => null);
	await glideScroll(page, optBox ? Math.max(0, optBox.y - 160) : 900, 1400);
	// Add the ticket and open the sheet silently (sped up), so the line lands on the terms.
	const addOne = visible(page, 'button', 'Add one Standard');
	if (await addOne.isVisible().catch(() => false)) {
		await addOne.hover();
		await page.waitForTimeout(300);
		await addOne.click();
	}
	const cartBar = page.getByRole('region', { name: 'Cart summary' });
	await cartBar.waitFor({ timeout: 10_000 }).catch(() => undefined);
	await page.waitForTimeout(500);
	const buy = cartBar.getByRole('button', { name: 'Buy' });
	if (await buy.isVisible().catch(() => false)) {
		await buy.hover();
		await page.waitForTimeout(300);
		await buy.click();
	}
	const sheet = page.getByRole('dialog');
	await sheet.getByText('Cancellation policy', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);
	await page.waitForTimeout(500);
	narration.mark('terms');
	await withOverlay(page, 'terms', async () => {
		const nameField = sheet.getByPlaceholder('Name for ticket 1').first();
		if (await nameField.isVisible().catch(() => false)) {
			await nameField.click();
			await nameField.pressSequentially('Mara Lindqvist', { delay: 60 });
		}
		await page.waitForTimeout(400);
		const policy = sheet.getByText('Cancellation policy', { exact: true });
		if (await policy.isVisible().catch(() => false)) await policy.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(2500, narration.durationFor('terms')));
	});

	// ---- Cut: Stripe's hosted checkout happens on a side page under the card;
	// the recorded page comes back on the dashboard with the ticket Active.
	await episodeCut(page, 'On Stripe', 'Paying by card', '/dashboard/tickets', {
		holdMs: 600,
		during: async () => {
			await buyTicketByCard(context, buyer, event.id, tier.id).catch((e: Error) =>
				console.warn('card payment did not complete:', e.message)
			);
		}
	});
	await settleAuth(page, 4000);
	const myCard = page
		.locator('article, li, div')
		.filter({ hasText: event.name })
		.filter({ hasText: /Active/i })
		.first();
	await myCard.waitFor({ timeout: 20_000 }).catch(() => undefined);
	await page.waitForTimeout(500);
	narration.mark('cancel');
	await withOverlay(page, 'cancel', async () => {
		const view = myCard.getByRole('button', { name: 'View Ticket' }).filter({ visible: true }).first();
		if (await view.isVisible().catch(() => false)) {
			await view.hover();
			await page.waitForTimeout(400);
			await view.click();
		}
		const modal = page.getByRole('dialog', { name: 'Your Ticket', exact: true });
		await modal.waitFor({ timeout: 15_000 }).catch(() => undefined);
		await page.waitForTimeout(900);
		const cancelBtn = modal.getByRole('button', { name: 'Cancel ticket' });
		if (await cancelBtn.isVisible().catch(() => false)) {
			await cancelBtn.hover();
			await page.waitForTimeout(400);
			await cancelBtn.click();
		}
		const dialog = page.getByRole('dialog', { name: 'Cancel your ticket' });
		await dialog.getByTestId('refund-summary').getByText("You'll receive").waitFor({ timeout: 20_000 }).catch(() => undefined);
		await page.waitForTimeout(1200);
		const schedule = dialog.getByText('Refund schedule', { exact: true });
		if (await schedule.isVisible().catch(() => false)) {
			await schedule.hover();
			await page.waitForTimeout(300);
			await schedule.click();
			await page.waitForTimeout(1200);
		}
		const reason = dialog.getByLabel('Reason (optional)');
		if (await reason.isVisible().catch(() => false)) {
			await reason.click();
			await reason.pressSequentially("Can't make it that weekend after all — sorry!", { delay: 22 });
		}
		await page.waitForTimeout(400);
		const confirm = dialog.getByRole('button', { name: 'Confirm cancellation' });
		if (await confirm.isVisible().catch(() => false)) {
			await confirm.hover();
			await page.waitForTimeout(400);
			await confirm.click();
		}
		await page.getByText('Ticket cancelled').first().waitFor({ timeout: 30_000 }).catch(() => undefined);
		await page.waitForTimeout(Math.max(2500, narration.durationFor('cancel')));
	});

	// ---- Cut: the organizer on the event's ticket list.
	await episodeCut(page, 'Back at the club', 'The ticket list', ticketsPath, {
		during: () => switchUser(page, org.owner.email, org.owner.password)
	});
	await settleAuth(page, 4000);
	await visible(page, 'heading', 'Manage Tickets').waitFor({ timeout: 10_000 }).catch(() => undefined);
	const row = page.locator('table tbody tr').filter({ visible: true }).filter({ hasText: 'Mara Lindqvist' }).first();
	await row.waitFor({ timeout: 15_000 }).catch(() => undefined);
	// Frame the earnings card, the counters and the rows together (silent).
	const earned = page.getByText('Total earned').first();
	const earnedBox = await earned.boundingBox().catch(() => null);
	if (earnedBox) await glideScroll(page, Math.max(0, earnedBox.y - 120), 1500);
	await page.mouse.move(1500, 600);
	await page.waitForTimeout(300);
	narration.mark('list');
	await withOverlay(page, 'list', async () => {
		const refunds = page.getByText('Refunds', { exact: true }).filter({ visible: true }).first();
		if (await refunds.isVisible().catch(() => false)) await refunds.hover().catch(() => undefined);
		await page.waitForTimeout(1600);
		const cancelledStat = page.getByText('Cancelled', { exact: true }).filter({ visible: true }).last();
		if (await cancelledStat.isVisible().catch(() => false)) await cancelledStat.hover().catch(() => undefined);
		await page.waitForTimeout(1200);
		if (await row.isVisible().catch(() => false)) {
			const rowBox = await row.boundingBox().catch(() => null);
			if (rowBox && rowBox.y > 900) await glideScroll(page, rowBox.y - 700, 1200);
			const refunded = row.getByText('Refunded', { exact: true }).first();
			if (await refunded.isVisible().catch(() => false)) await refunded.hover().catch(() => undefined);
			else await row.hover().catch(() => undefined);
		}
		await page.waitForTimeout(Math.max(1500, narration.durationFor('list')));
	});

	// ---- Scene: the Cancel event dialog, reached by an in-app click.
	const editEvent = page.getByRole('link', { name: 'Edit Event' }).or(page.getByRole('button', { name: 'Edit Event' })).filter({ visible: true }).first();
	await editEvent.scrollIntoViewIfNeeded().catch(() => undefined);
	if (await editEvent.isVisible().catch(() => false)) {
		await editEvent.hover();
		await page.waitForTimeout(300);
		await editEvent.click();
	}
	const cancelEventBtn = visible(page, 'button', 'Cancel event');
	await cancelEventBtn.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await settleAuth(page, 3000);
	await page.waitForTimeout(400);
	narration.mark('whole-night');
	await withOverlay(page, 'whole-night', async () => {
		if (await cancelEventBtn.isVisible().catch(() => false)) {
			await cancelEventBtn.hover();
			await page.waitForTimeout(500);
			await cancelEventBtn.click();
		}
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('heading', { name: 'Cancel this event' }).waitFor({ timeout: 10_000 }).catch(() => undefined);
		const preview = dialog.getByText(/to refund/).first();
		await preview.waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(800);
		const reason = dialog.getByLabel('Reason (optional)');
		if (await reason.isVisible().catch(() => false)) await reason.hover().catch(() => undefined);
		await page.waitForTimeout(1200);
		const refundAll = dialog.getByText('Refund all tickets', { exact: true });
		if (await refundAll.isVisible().catch(() => false)) await refundAll.hover().catch(() => undefined);
		await page.waitForTimeout(1000);
		if (await preview.isVisible().catch(() => false)) await preview.hover().catch(() => undefined);
		// Hold on the dialog for the rest of the line, then keep the event.
		await page.waitForTimeout(Math.max(800, narration.durationFor('whole-night') - 1200));
		const keep = dialog.getByRole('button', { name: 'Keep event' });
		if (await keep.isVisible().catch(() => false)) {
			await keep.hover();
			await page.waitForTimeout(300);
			await keep.click();
		}
		await page.waitForTimeout(Math.max(500, narration.durationFor('whole-night')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
