// Shared backend-arrange primitives for demo CLIPS. Every clip arranges its
// own state from scratch through these (no seeded data dependencies), so the
// library is rebuildable after any reseed.

const API = process.env.API_URL || 'http://localhost:8000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';

export async function api(path, options = {}) {
	const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
	const res = await fetch(`${API}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body)
	});
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
	const text = await res.text();
	if (!text || !res.headers.get('content-type')?.includes('json')) return {};
	return JSON.parse(text);
}

export async function login(email, password) {
	const { access } = await api('/api/auth/token/pair', { body: { username: email, password } });
	return access;
}

/** Register + email-verify a fresh user via Mailpit. */
/**
 * Register a user and click through its Mailpit verification link.
 *
 * `options.emailLocal` overrides the generated local-part for people whose
 * address ends up ON CAMERA — a members list full of
 * "demo-member-tomas-mtpof2zr@example.com" reads as test data. A short
 * uniqueness suffix is still appended, because clips get re-run and the
 * address must stay free.
 */
export async function registerVerifiedUser(label, firstName = 'Alex', lastName = 'Demo', options = {}) {
	const stamp = Date.now().toString(36);
	const local = options.emailLocal
		? `${options.emailLocal}.${stamp.slice(-4)}`
		: `demo-${label}-${stamp}`;
	const email = `${local}@example.com`;
	const password = 'Demo-video-Pass!123';
	await api('/api/account/register', {
		body: {
			email,
			password1: password,
			password2: password,
			first_name: firstName,
			last_name: lastName,
			accept_toc_and_privacy: true
		}
	});
	const intercepted = `+${email.replace('@', '_at_').replaceAll('.', '_dot_')}@`;
	const deadline = Date.now() + 20_000;
	let messageId;
	while (!messageId) {
		for (const q of [`to:"${email}"`, `to:"${intercepted}"`]) {
			const data = await (
				await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(q)}&limit=5`)
			).json();
			if (data.messages?.[0]) {
				messageId = data.messages[0].ID;
				break;
			}
		}
		if (!messageId) {
			if (Date.now() > deadline) throw new Error(`No verification email for ${email}`);
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	const message = await (await fetch(`${MAILPIT}/api/v1/message/${messageId}`)).json();
	const link = message.Text.match(/https?:\/\/\S*token=\S+/)?.[0];
	const token = link ? new URL(link).searchParams.get('token') : null;
	if (!token) throw new Error('Verification link/token not found');
	await api('/api/account/verify', { body: { token } });
	const access = await login(email, password);
	return { email, password, token: access, firstName, lastName };
}

/**
 * Create a PUBLIC org with a fresh owner, dressed for camera (description,
 * address). Org names are unique-constrained → walk suffix candidates.
 */
export async function createDressedOrg({ name, description, address = 'Museumsquartier, Vienna, Austria' }) {
	const owner = await registerVerifiedUser('owner', 'Ren', 'Okabe');
	const candidates = [
		name,
		`${name} Studio`,
		...['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].map((n) => `${name} ${n}`),
		`${name} ${Date.now().toString(36)}`
	];
	let org;
	for (const candidate of candidates) {
		try {
			org = await api('/api/organizations/', {
				token: owner.token,
				body: { name: candidate, contact_email: owner.email }
			});
			break;
		} catch {
			/* name taken */
		}
	}
	if (!org) throw new Error('createDressedOrg: all name candidates taken');
	await api(`/api/organization-admin/${org.slug}`, {
		method: 'PUT',
		token: owner.token,
		body: { visibility: 'public', accept_membership_requests: true, description, address }
	});
	return { ...org, owner };
}

/** Create an OPEN public event, dressed (description + address). */
export async function createEvent(orgSlug, token, overrides = {}) {
	const dayMs = 24 * 60 * 60 * 1000;
	const start = new Date(Date.now() + 7 * dayMs);
	start.setUTCHours(18, 30, 0, 0); // evening events read better on camera
	const event = await api(`/api/organization-admin/${orgSlug}/create-event`, {
		token,
		body: {
			name: 'Demo Event',
			start: start.toISOString(),
			end: new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString(),
			status: 'open',
			event_type: 'public',
			visibility: 'public',
			requires_ticket: true,
			max_attendees: 80,
			address: 'Museumsquartier, Vienna, Austria',
			...overrides
		}
	});
	return { ...event, path: `/events/${orgSlug}/${event.slug}` };
}

export async function createTier(eventId, token, overrides = {}) {
	const dayMs = 24 * 60 * 60 * 1000;
	return api(`/api/event-admin/${eventId}/ticket-tier`, {
		token,
		body: {
			name: 'General Admission',
			payment_method: 'free',
			price: '0.00',
			price_type: 'fixed',
			total_quantity: 80,
			sales_start_at: new Date(Date.now() - dayMs).toISOString(),
			sales_end_at: new Date(Date.now() + 30 * dayMs).toISOString(),
			...overrides
		}
	});
}

export async function createMembershipTier(orgSlug, token, name, description = null) {
	return api(`/api/organization-admin/${orgSlug}/membership-tiers`, {
		token,
		body: { name, description }
	});
}

/** Describe an already-existing tier (the auto-created default one). */
export async function describeMembershipTier(orgSlug, token, tier, description) {
	// PUT, not PATCH — send the name back or it is cleared. Deliberately does
	// NOT send requires_membership_approval / membership_questionnaire_id:
	// setting either of those makes the tier refuse priced plans (400).
	return api(`/api/organization-admin/${orgSlug}/membership-tiers/${tier.id}`, {
		method: 'PUT',
		token,
		body: { name: tier.name, description }
	});
}

/**
 * Price a membership tier.
 *
 * A tier with no plan renders as "Plans — No plans yet." on the organizer's
 * Tiers tab: three empty boxes where the whole point of the screen is that
 * membership has levels and levels have prices. `payment_method` stays
 * `offline` because the demo stack has no Stripe account behind it — the card
 * then reads "Offline · manual", which is what a small club does anyway.
 */
export async function createMembershipPlan(orgSlug, token, tierId, { name, price, currency = 'EUR', period_unit = 'month', description }) {
	return api(`/api/organization-admin/${orgSlug}/tiers/${tierId}/plans`, {
		token,
		body: {
			name,
			price,
			currency,
			period_unit,
			payment_method: 'offline',
			// `description` is a plain string on this endpoint, not a nullable
			// one: sending null is a 422, so the key is omitted when unset.
			...(description === undefined ? {} : { description })
		}
	});
}

/** Potluck: create an item as `token`'s user (claim: false → open suggestion). */
export async function createPotluckItem(eventId, token, { name, item_type = 'food', quantity = null, note = null, claim = false }) {
	return api(`/api/events/${eventId}/potluck/`, {
		token,
		body: { name, item_type, quantity, note, claim }
	});
}

export async function rsvpYes(eventId, token) {
	return api(`/api/events/${eventId}/rsvp/yes`, { method: 'POST', token, body: {} });
}

/** Create + publish a questionnaire on the org and attach it to the event. */
export async function attachQuestionnaire(orgId, eventId, token, payload) {
	const q = await api(`/api/questionnaires/${orgId}/create-questionnaire`, { token, body: payload });
	await api(`/api/questionnaires/${q.id}/events/${eventId}`, { method: 'POST', token, body: {} });
	return q;
}

/** Submit questionnaire answers as a user (API-side, for bulk arranging). */
export async function submitQuestionnaire(eventId, questionnaireId, token, { freeText = [], multipleChoice = [] }) {
	return api(`/api/events/${eventId}/questionnaire/${questionnaireId}/submit`, {
		token,
		body: {
			questionnaire_id: questionnaireId,
			free_text_answers: freeText,
			multiple_choice_answers: multipleChoice,
			file_upload_answers: [],
			status: 'ready'
		}
	});
}

/** Membership: request as user, approve as owner → user becomes member of tier. */
export async function makeMember(orgSlug, userToken, ownerToken, tierId) {
	const req = await api(`/api/organizations/${orgSlug}/membership-requests`, {
		token: userToken,
		body: {}
	});
	await api(`/api/organization-admin/${orgSlug}/membership-requests/${req.id}/approve`, {
		token: ownerToken,
		body: { tier_id: tierId }
	});
	return req;
}

/** The auto-created default membership tier of a fresh org. */
export async function defaultMembershipTier(orgSlug, ownerToken) {
	const tiers = await api(`/api/organization-admin/${orgSlug}/membership-tiers`, { token: ownerToken });
	const list = Array.isArray(tiers) ? tiers : tiers.items ?? [];
	const tier = list.find((t) => t.name === 'General membership') ?? list[0];
	if (!tier) throw new Error(`No membership tiers on ${orgSlug}`);
	return tier;
}

/** Remove the auto-created "General Admission" default tier (full control). */
export async function deleteDefaultTier(eventId, token) {
	const tiers = await api(`/api/event-admin/${eventId}/ticket-tiers`, { token });
	const list = tiers.results ?? tiers.items ?? tiers;
	const def = (Array.isArray(list) ? list : []).find((t) => t.name === 'General Admission');
	if (def) await api(`/api/event-admin/${eventId}/ticket-tier/${def.id}`, { method: 'DELETE', token });
}

/** Invite emails to an event, optionally waiving gates. */
export async function inviteToEvent(eventId, token, emails, waivers = {}) {
	return api(`/api/event-admin/${eventId}/invitations`, {
		token,
		body: { emails, ...waivers }
	});
}

/** The caller's membership row for an org (includes qr_payload). */
export async function getMyMembership(orgSlug, token) {
	const page = await api('/api/me/memberships?page_size=50', { token });
	const row = (page.results ?? []).find((m) => m.organization_slug === orgSlug);
	if (!row) throw new Error(`No membership of ${orgSlug}`);
	return row;
}

/** The inner questionnaire id (user-facing fill routes) for a wrapper id. */
export async function innerQuestionnaireId(wrapperId, token) {
	const detail = await api(`/api/questionnaires/${wrapperId}`, { token });
	return detail.questionnaire.id;
}
