import { test, withOverlay } from '@argo-video/cli';
import type { Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { createDressedOrg, createEvent, createTier, deleteDefaultTier, registerVerifiedUser } from './arrange-lib.mjs';
import { glideScroll, uiLogin, switchUser, waitClientAuth } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 2 · "Tickets, your way". The organizer's three tiers on the event's
// Ticketing tab, then a fresh attendee buying the pay-what-you-can one and
// finding it in her dashboard with the QR code and the wallet passes.
const CARD = { episode: 2, title: 'Tickets, your way', pov: 'the organizer, then an attendee' };

/** The account chrome, bounded — a screen that never arrives is worse than a flash. */
async function settleAuth(page: Page, ms: number): Promise<void> {
	await page
		.getByRole('button', { name: 'Open notifications' })
		.waitFor({ timeout: ms })
		.catch(() => undefined);
}

const visible = (page: Page, role: Parameters<Page['getByRole']>[0], name: string) =>
	page.getByRole(role, { name }).filter({ visible: true }).first();

test('ep-tickets-your-way', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a listening room, one night, three tiers.
	const org = await createDressedOrg({
		name: 'Nightjar Listening Room',
		description:
			'A forty-seat listening room above a bakery in Neubau. Quiet songs, one good piano, and a bar that closes when the music starts. Run by three friends since 2019.',
		address: 'Neubaugasse 36, 1070 Vienna, Austria'
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Autumn Session: Quiet Songs',
		description:
			'Two songwriters, one piano, no amplification. Doors at seven, first set at half past. Bring a friend and a low voice.',
		address: 'Neubaugasse 36, 1070 Vienna, Austria',
		max_attendees: 40,
		// The checkout sheet otherwise asks for a holder name before "Reserve"
		// enables — one more field to type on camera, for no story.
		require_ticket_names: false
	});
	await deleteDefaultTier(event.id, org.owner.token);
	await createTier(event.id, org.owner.token, {
		name: 'Early bird',
		description: 'The first twenty seats, at a friendlier price. Pay by bank transfer within three days.',
		payment_method: 'offline',
		price: '12.00',
		total_quantity: 20,
		manual_payment_instructions:
			'Bank transfer to Nightjar Listening Room, IBAN AT61 1904 3002 3457 3201, reference your name. We confirm within a day.'
	});
	await createTier(event.id, org.owner.token, {
		name: 'Pay what you can',
		description: 'Pick a number between five and thirty euros and pay it at the door. Nobody asks why.',
		payment_method: 'at_the_door',
		price_type: 'pwyc',
		pwyc_min: '5.00',
		pwyc_max: '30.00',
		total_quantity: 15
	});
	await createTier(event.id, org.owner.token, {
		name: 'Volunteers',
		description: 'Free entry for the door and bar crew. Show up an hour early.',
		payment_method: 'free',
		price: '0.00',
		total_quantity: 5
	});
	const attendee = await registerVerifiedUser('attendee', 'Mara', 'Lindqvist', { emailLocal: 'mara.lindqvist' });

	const adminPath = `/org/${org.slug}/admin/events/${event.id}/edit?tab=ticketing`;

	// ---- Setup (not recorded): log in as the owner so the first page carries auth,
	// and prime the admin bundle so hydration lands sooner under the cover.
	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	const primer = await page.context().newPage();
	await primer.goto(adminPath).catch(() => undefined);
	await primer.waitForLoadState('networkidle').catch(() => undefined);
	await primer.close();

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: the organizer's tiers.
	await titleCardCutTo(page, CARD, adminPath);
	await settleAuth(page, 4000);
	await visible(page, 'heading', 'Ticket Tiers').waitFor({ timeout: 10_000 }).catch(() => undefined);
	await page.mouse.move(1500, 600);
	narration.mark('tiers');
	await withOverlay(page, 'tiers', async () => {
		await page.waitForTimeout(1500);
		// The three cards run about a screen and a half below the heading —
		// drift through them so each one gets its moment as the line names it.
		const early = visible(page, 'heading', 'Early bird');
		if (await early.isVisible().catch(() => false)) await early.hover().catch(() => undefined);
		await glideScroll(page, 520, 3500);
		const pwyc = visible(page, 'heading', 'Pay what you can');
		if (await pwyc.isVisible().catch(() => false)) await pwyc.hover().catch(() => undefined);
		await page.waitForTimeout(1200);
		await glideScroll(page, 360, 3500);
		const vol = visible(page, 'heading', 'Volunteers');
		if (await vol.isVisible().catch(() => false)) await vol.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(800, narration.durationFor('tiers')));
	});

	// ---- Cut: the attendee on the public event page.
	await episodeCut(page, 'The other side', 'Buying a ticket', event.path, {
		during: () => switchUser(page, attendee.email, attendee.password)
	});
	await settleAuth(page, 4000);
	await page.getByRole('region', { name: 'Ticket Options' }).waitFor({ timeout: 10_000 }).catch(() => undefined);
	await page.mouse.move(1500, 700);
	narration.mark('choose');
	await withOverlay(page, 'choose', async () => {
		await page.waitForTimeout(900);
		// Ticket Options sits about a screen down — glide it up under the header.
		const heading = visible(page, 'heading', 'Ticket Options');
		const box = await heading.boundingBox().catch(() => null);
		const target = box ? Math.max(0, box.y - 430) : 650;
		await glideScroll(page, target, 2200);
		const pwycCard = visible(page, 'heading', 'Pay what you can');
		if (await pwycCard.isVisible().catch(() => false)) await pwycCard.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(800, narration.durationFor('choose')));
	});

	// ---- Scene: pay what you can → cart → checkout → reserve → the ticket.
	narration.mark('pwyc');
	await withOverlay(page, 'pwyc', async () => {
		const addOne = visible(page, 'button', 'Add one Pay what you can');
		if (await addOne.isVisible().catch(() => false)) {
			await addOne.hover();
			await page.waitForTimeout(400);
			await addOne.click();
		}
		const cartBar = page.getByRole('region', { name: 'Cart summary' });
		await cartBar.waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(900);
		const buy = cartBar.getByRole('button', { name: 'Buy' });
		if (await buy.isVisible().catch(() => false)) {
			await buy.hover();
			await page.waitForTimeout(400);
			await buy.click();
		}
		const dialog = page.getByRole('dialog');
		const amount = dialog.locator('input[id$="-pwyc-amount"]');
		await amount.waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(900);
		if (await amount.isVisible().catch(() => false)) {
			await amount.click();
			await page.waitForTimeout(300);
			await amount.pressSequentially('15', { delay: 160 });
			await page.waitForTimeout(900);
			const reserve = dialog.getByRole('button', { name: 'Reserve' });
			await reserve.hover();
			await page.waitForTimeout(500);
			if (await reserve.isEnabled().catch(() => false)) await reserve.click();
		}
		// The ticket modal opens by itself once the reservation lands.
		await page.locator('img[alt="Ticket QR Code"]').waitFor({ timeout: 20_000 }).catch(() => undefined);
		await page.mouse.move(1500, 300);
		await page.waitForTimeout(Math.max(2600, narration.durationFor('pwyc')));
	});

	// ---- Scene: the ticket in the dashboard. A client-side navigation via the
	// header link, so there is no white frame between the two pages.
	await page.keyboard.press('Escape');
	await page.waitForTimeout(500);
	const myTickets = visible(page, 'link', 'My Tickets');
	if (await myTickets.isVisible().catch(() => false)) {
		await myTickets.hover();
		await page.waitForTimeout(300);
		await myTickets.click();
	} else {
		await page.goto('/dashboard/tickets');
	}
	await page.waitForURL(/\/dashboard\/tickets/, { timeout: 15_000 }).catch(() => undefined);
	await page
		.getByText('Autumn Session: Quiet Songs')
		.filter({ visible: true })
		.first()
		.waitFor({ timeout: 15_000 })
		.catch(() => undefined);
	await page.waitForTimeout(600);
	narration.mark('ticket');
	await withOverlay(page, 'ticket', async () => {
		const apple = page.locator('[aria-label="Add to Apple Wallet"]').first();
		if (await apple.isVisible().catch(() => false)) await apple.hover().catch(() => undefined);
		await page.waitForTimeout(1600);
		const view = visible(page, 'button', 'View ticket and QR code');
		if (await view.isVisible().catch(() => false)) {
			await view.hover();
			await page.waitForTimeout(400);
			await view.click();
			await page.locator('img[alt="Ticket QR Code"]').waitFor({ timeout: 15_000 }).catch(() => undefined);
			await page.waitForTimeout(700);
			const walletInModal = page.getByRole('dialog').locator('[aria-label="Add to Google Wallet"]').first();
			if (await walletInModal.isVisible().catch(() => false)) await walletInModal.hover().catch(() => undefined);
		}
		await page.waitForTimeout(Math.max(2200, narration.durationFor('ticket')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
