// Backend arrange for the questionnaire-gate demo: fresh verified owner →
// shibari org → questionnaire-gated free event. Shared by the demo script and
// probes/questionnaire-gate.mjs so the two can never drift.

const API = process.env.API_URL || 'http://localhost:8000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';

export const ORG_NAME = 'Shibari Circle Vienna';
export const EVENT_NAME = 'Intro to Shibari — Rope & Trust';

export async function api(path, options = {}) {
	const res = await fetch(`${API}${path}`, {
		method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
		headers: {
			'Content-Type': 'application/json',
			...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body)
	});
	if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
	return res.headers.get('content-type')?.includes('json') ? res.json() : {};
}

/** Register + email-verify a fresh user via Mailpit (backend intercepts recipients). */
export async function registerVerifiedUser(label) {
	const email = `demo-${label}-${Date.now().toString(36)}@example.com`;
	const password = 'Demo-video-Pass!123';
	await api('/api/account/register', {
		body: {
			email,
			password1: password,
			password2: password,
			first_name: 'Ren',
			last_name: 'Okabe',
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
	if (!token) throw new Error('Verification link/token not found in email');
	await api('/api/account/verify', { body: { token } });
	return { email, password };
}

/** Full arrange. Returns { eventPath, questionnaireId, orgSlug, owner }. */
export async function arrange() {
	const owner = await registerVerifiedUser('ropeowner');
	const { access: token } = await api('/api/auth/token/pair', {
		body: { username: owner.email, password: owner.password }
	});

	// Org names are unique-constrained and every run creates a fresh org —
	// walk natural-looking candidates before a timestamp last resort.
	const candidates = [
		ORG_NAME,
		`${ORG_NAME} Studio`,
		...['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].map((n) => `${ORG_NAME} ${n}`),
		`${ORG_NAME} ${Date.now().toString(36)}`
	];
	let org;
	for (const name of candidates) {
		try {
			org = await api('/api/organizations/', {
				token,
				body: { name, contact_email: owner.email }
			});
			break;
		} catch {
			// name taken — try the next candidate
		}
	}
	if (!org) throw new Error('Could not create org: all name candidates failed');
	await api(`/api/organization-admin/${org.slug}`, {
		method: 'PUT',
		token,
		body: { visibility: 'public', accept_membership_requests: false }
	});

	const dayMs = 24 * 60 * 60 * 1000;
	const start = new Date(Date.now() + 7 * dayMs);
	const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
	const eventBody = {
		name: EVENT_NAME,
		start: start.toISOString(),
		end: end.toISOString(),
		status: 'open',
		event_type: 'public',
		visibility: 'public',
		requires_ticket: true,
		max_attendees: 24,
		description:
			'A beginner-friendly evening of rope, consent, and connection. We keep the group small and the space safe — every guest is vetted, and experienced instructors guide you through the fundamentals of shibari step by step. Bring curiosity; we provide the rope.'
	};
	let event;
	try {
		event = await api(`/api/organization-admin/${org.slug}/create-event`, {
			token,
			body: eventBody
		});
	} catch {
		delete eventBody.description;
		event = await api(`/api/organization-admin/${org.slug}/create-event`, {
			token,
			body: eventBody
		});
	}

	await api(`/api/event-admin/${event.id}/ticket-tier`, {
		token,
		body: {
			name: 'Workshop Spot',
			payment_method: 'free',
			price: '0.00',
			price_type: 'fixed',
			total_quantity: 24,
			sales_start_at: new Date(Date.now() - dayMs).toISOString(),
			sales_end_at: end.toISOString()
		}
	});

	const questionnaire = await api(`/api/questionnaires/${org.id}/create-questionnaire`, {
		token,
		body: {
			name: 'Workshop Application',
			min_score: 0,
			evaluation_mode: 'manual',
			status: 'published',
			freetextquestion_questions: [
				{
					question: 'Tell us about your experience with rope and what you hope to learn.',
					is_mandatory: true
				}
			]
		}
	});
	await api(`/api/questionnaires/${questionnaire.id}/events/${event.id}`, {
		method: 'POST',
		token,
		body: {}
	});

	return {
		eventPath: `/events/${org.slug}/${event.slug}`,
		questionnaireId: questionnaire.id,
		orgSlug: org.slug,
		owner
	};
}
