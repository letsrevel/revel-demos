// Stripe test-mode helpers for arranging PAID state before the camera starts.
//
// Card payments in Revel hand off to Stripe's HOSTED checkout page
// (checkout.stripe.com), which carries a TEST MODE badge — so nothing here is
// ever meant to be recorded. Drive it on an unrecorded side page, then poll the
// API for the webhook-driven effect (ticket Active, subscription Active).
//
// Needs: STRIPE_* in the containers (see docker-compose.yml), the organization
// stamped Stripe-connected (`markStripeConnected` in arrange-lib.mjs), and the
// forwarder running on the host:
//     stripe listen --forward-to localhost:8000/api/stripe/webhook
import { api } from './arrange-lib.mjs';

export const TEST_CARD = {
	number: '4242 4242 4242 4242',
	expiry: '12 / 34',
	cvc: '123',
	name: 'Demo Buyer'
};

/** Reserve one ticket on an online tier and return Stripe's hosted checkout URL. */
export async function startCardCheckout(token, eventId, tierId, { guestName } = {}) {
	const reserve = await api(`/api/events/${eventId}/tickets/${tierId}/checkout`, {
		token,
		body: { tickets: [guestName ? { guest_name: guestName } : {}] }
	});
	if (!reserve.requires_payment || !reserve.reservation_id) {
		throw new Error(`checkout on tier ${tierId} returned no reservation (not an online tier?): ${JSON.stringify(reserve).slice(0, 200)}`);
	}
	const session = await api(`/api/events/reservations/${reserve.reservation_id}/checkout-session`, { token, method: 'POST' });
	if (!session.checkout_url) throw new Error('checkout-session returned no checkout_url');
	return session.checkout_url;
}

/** Start an ONLINE membership plan subscription and return the hosted checkout URL. */
export async function startSubscriptionCheckout(token, orgId, planId) {
	const res = await api(`/api/me/organizations/${orgId}/subscribe`, { token, body: { plan_id: planId } });
	const url = res.checkout_url ?? res.url;
	if (!url) throw new Error(`subscribe returned no checkout url: ${JSON.stringify(res).slice(0, 300)}`);
	return url;
}

/**
 * Fill Stripe's hosted checkout with the test card on `page` (unrecorded!) and
 * wait until Stripe sends the browser back to the app.
 */
export async function payHostedCheckout(page, url, { email = 'demo-buyer@example.com', card = TEST_CARD } = {}) {
	await page.goto(url);
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
	const cardNumber = page.getByRole('textbox', { name: 'Card number' }).first();
	const deadline = Date.now() + 60_000;
	while (!(await cardNumber.isVisible().catch(() => false))) {
		if (Date.now() > deadline) throw new Error('Stripe checkout: card number field never appeared');
		const euro = page.getByRole('group', { name: /Choose a currency/ }).getByRole('button', { name: /€/, disabled: false });
		if ((await euro.count()) > 0) await euro.first().click().catch(() => undefined);
		const accordion = page.locator('[data-testid="card-accordion-item-button"]');
		if ((await accordion.count()) > 0) await accordion.dispatchEvent('click').catch(() => undefined);
		await page.waitForTimeout(500);
	}
	const emailField = page.getByLabel('Email');
	if ((await emailField.count()) > 0 && (await emailField.first().isEditable().catch(() => false))) {
		if ((await emailField.first().inputValue()) === '') await emailField.first().fill(email);
	}
	await cardNumber.fill(card.number);
	await page.getByRole('textbox', { name: 'Expiration' }).fill(card.expiry);
	await page.getByRole('textbox', { name: /CVC|Security code/ }).fill(card.cvc);
	const holder = page.getByRole('textbox', { name: /Cardholder name|Name on card/ });
	if ((await holder.count()) > 0) await holder.first().fill(card.name);
	const submit = page.getByTestId('hosted-payment-submit-button');
	if ((await submit.count()) > 0) await submit.click();
	else await page.getByRole('button', { name: 'Pay', exact: true }).click();
	await page.waitForURL(/localhost:5173/, { timeout: 60_000 });
}

/** Poll until `check()` returns truthy — the webhook may take a few seconds. */
export async function waitFor(label, check, { timeoutMs = 90_000, everyMs = 1500 } = {}) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await check().catch(() => null);
		if (value) return value;
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${label} — is \`stripe listen\` running?`);
		await new Promise((r) => setTimeout(r, everyMs));
	}
}

/** The buyer's ticket for `eventId`, once the webhook has flipped it Active. */
export function waitTicketActive(token, eventId, opts) {
	return waitFor('the ticket to go Active', async () => {
		const mine = await api('/api/dashboard/tickets?page_size=50', { token });
		const t = (mine.results ?? mine.items ?? mine).find((x) => (x.event?.id ?? x.event) === eventId && x.status === 'active');
		return t ?? null;
	}, opts);
}

/** The member's subscription in `orgId`, once the first invoice is paid. */
export function waitSubscriptionActive(token, orgId, opts) {
	return waitFor('the subscription to go Active', async () => {
		const sub = await api(`/api/me/organizations/${orgId}/subscription`, { token });
		return sub?.status === 'active' ? sub : null;
	}, opts);
}

/**
 * Whole arc on a fresh unrecorded page in `context`: reserve → pay → Active.
 * Returns the active ticket.
 */
export async function buyTicketByCard(context, buyer, eventId, tierId, opts = {}) {
	const url = await startCardCheckout(buyer.token, eventId, tierId, { guestName: `${buyer.firstName} ${buyer.lastName}` });
	const side = await context.newPage();
	try {
		await payHostedCheckout(side, url, { email: buyer.email, card: { ...TEST_CARD, name: `${buyer.firstName} ${buyer.lastName}` } });
	} finally {
		await side.close().catch(() => undefined);
	}
	return waitTicketActive(buyer.token, eventId, opts);
}

/** Same arc for a membership plan. Returns the active subscription. */
export async function subscribeByCard(context, member, orgId, planId, opts = {}) {
	const url = await startSubscriptionCheckout(member.token, orgId, planId);
	const side = await context.newPage();
	try {
		await payHostedCheckout(side, url, { email: member.email, card: { ...TEST_CARD, name: `${member.firstName} ${member.lastName}` } });
	} finally {
		await side.close().catch(() => undefined);
	}
	return waitSubscriptionActive(member.token, orgId, opts);
}
