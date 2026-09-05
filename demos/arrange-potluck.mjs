// Backend arrange for the potluck demo: fresh verified owner → supper-club
// org → free, non-ticketed event with the potluck open → five suggested
// items, one already claimed by a second seeded guest (Ivan) so the list
// reads as lived-in. Shared by the demo script and probes/potluck.mjs.

import { api, registerVerifiedUser } from './arrange-qgate.mjs';

export const ORG_NAME = 'Sunday Supper Club';
export const EVENT_NAME = 'Late Summer Garden Potluck';
export const GUEST = { email: 'hannah.attendee@example.com', password: 'password123' };
export const OTHER_GUEST = { email: 'ivan.attendee@example.com', password: 'password123' };

export const SUGGESTED = [
	{ name: 'Big pot of goulash', item_type: 'main_course', quantity: 'for 20' },
	{ name: 'Plates, cups and forks', item_type: 'supplies', quantity: 'for 30' },
	{ name: 'Bluetooth speaker and a playlist', item_type: 'entertainment' },
	{ name: 'Lemonade', item_type: 'non_alcoholic', quantity: '5 litres' },
	{ name: 'Something sweet', item_type: 'dessert', quantity: '1 tray' }
];
/** Index into SUGGESTED that Ivan pre-claims. */
const PRECLAIMED = 4;

async function login(user) {
	const { access } = await api('/api/auth/token/pair', {
		body: { username: user.email, password: user.password }
	});
	return access;
}

/** Idempotent: seeded personas persist across takes, so "already exists" is fine. */
async function ensureDietary(token, { preferences, restrictions }) {
	const all = await api('/api/dietary/preferences', { token });
	for (const name of preferences) {
		const pref = all.find((p) => p.name === name);
		if (!pref) throw new Error(`Unknown dietary preference: ${name}`);
		await api('/api/dietary/my-preferences', {
			token,
			body: { preference_id: pref.id, is_public: true }
		}).catch(() => undefined);
	}
	for (const r of restrictions) {
		await api('/api/dietary/restrictions', {
			token,
			body: { is_public: true, notes: '', ...r }
		}).catch(() => undefined);
	}
}

/** Full arrange. Returns { eventPath, eventId, orgSlug, owner, items }. */
export async function arrange() {
	const owner = await registerVerifiedUser('supperhost');
	const token = await login(owner);

	const candidates = [
		ORG_NAME,
		`${ORG_NAME} Vienna`,
		...['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].map((n) => `${ORG_NAME} ${n}`),
		`${ORG_NAME} ${Date.now().toString(36)}`
	];
	let org;
	for (const name of candidates) {
		try {
			org = await api('/api/organizations/', { token, body: { name, contact_email: owner.email } });
			break;
		} catch {
			// name taken — next candidate
		}
	}
	if (!org) throw new Error('Could not create org: all name candidates failed');
	await api(`/api/organization-admin/${org.slug}`, {
		method: 'PUT',
		token,
		body: { visibility: 'public', accept_membership_requests: false }
	});

	const dayMs = 24 * 60 * 60 * 1000;
	const start = new Date(Date.now() + 9 * dayMs);
	start.setHours(17, 0, 0, 0);
	const end = new Date(start.getTime() + 5 * 60 * 60 * 1000);
	const event = await api(`/api/organization-admin/${org.slug}/create-event`, {
		token,
		body: {
			name: EVENT_NAME,
			start: start.toISOString(),
			end: end.toISOString(),
			status: 'open',
			event_type: 'public',
			visibility: 'public',
			requires_ticket: false,
			max_attendees: 40,
			potluck_open: true,
			address: 'Gemeinschaftsgarten Augarten, Obere Augartenstraße 1, 1020 Wien',
			description:
				'Long tables under the trees, everyone brings one thing. We put the list right here so nobody has to ask "what should I bring?" — pick something that\'s still needed, or add your own. Kids and dogs welcome.'
		}
	});

	const items = [];
	for (const item of SUGGESTED) {
		items.push(
			await api(`/api/events/${event.id}/potluck/`, {
				token,
				body: { ...item, claim: false }
			})
		);
	}

	// Ivan RSVPs and claims the dessert so the list opens with one card covered.
	const ivanToken = await login(OTHER_GUEST);
	await api(`/api/events/${event.id}/rsvp/yes`, { token: ivanToken, body: {} });
	await api(`/api/events/${event.id}/potluck/${items[PRECLAIMED].id}/claim`, {
		token: ivanToken,
		body: {}
	});

	// Dietary profiles (public) so the host's aggregated summary has something to say:
	// Vegetarian ×2, one severe peanut allergy, one lactose intolerance.
	const hannahToken = await login(GUEST);
	await ensureDietary(ivanToken, {
		preferences: ['Vegetarian'],
		restrictions: [{ food_item_name: 'Peanuts', restriction_type: 'severe_allergy', notes: 'Please keep nuts off the shared table.' }]
	});
	await ensureDietary(hannahToken, {
		preferences: ['Vegetarian'],
		restrictions: [{ food_item_name: 'Milk', restriction_type: 'intolerant' }]
	});

	return {
		eventPath: `/events/${org.slug}/${event.slug}`,
		eventId: event.id,
		orgSlug: org.slug,
		owner,
		items
	};
}
