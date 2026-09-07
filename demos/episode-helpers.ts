// Shared shape for the "Revel, in depth" episode series. Every episode opens
// on the same painted title card, cuts between personas on the same soft
// interstitial, and closes on the same brand end card — so the series reads as
// one series, whoever wrote the individual episode.
//
// Import alongside clip-helpers; this file only adds the episode framing.
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoClean, showEndCard } from './clip-helpers';

export interface EpisodeCard {
	/** Episode number, shown in the kicker ("Episode 3"). */
	episode: number;
	/** The episode title — short, a noun phrase, ≤ 5 words. */
	title: string;
	/** Whose eyes we see through: "the organizer", "an attendee", "door staff"… */
	pov: string;
}

const SURFACE =
	'linear-gradient(165deg,hsl(268 60% 96%) 0%,hsl(268 55% 94%) 55%,hsl(226 100% 93%) 100%)';
const FONT = "-apple-system,'Nata Sans',sans-serif";

function rMarkDataUri(): string {
	const b64 = readFileSync(
		new URL('../assets/revel-R-gradient-padded.png.b64', import.meta.url),
		'utf8'
	).replace(/\s/g, '');
	return `data:image/png;base64,${b64}`;
}

/**
 * The title card's markup. Returned as a string so the SAME card can be painted
 * on about:blank (the recorded open) and as a document-start cover on the first
 * app page (so the cut off the card is a dissolve, not a white flash).
 *
 * The slow drift on the mark is not decoration: the CDP screencast only emits
 * a frame when something changes, and a static card starves the recording.
 */
function titleCardHtml(card: EpisodeCard, logo: string, animate: boolean): string {
	const anim = animate
		? `<style>
				@keyframes ep-breathe { from { transform: scale(1); } to { transform: scale(1.05); } }
				@keyframes ep-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
			</style>`
		: '';
	const rise = (delay: string) => (animate ? `animation:ep-rise .9s ease-out ${delay} both;` : '');
	const breathe = animate ? 'animation:ep-breathe 14s ease-out forwards;' : '';
	return `${anim}
		<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;background:${SURFACE};font-family:${FONT};">
			<img src="${logo}" alt="" style="width:132px;height:132px;${breathe}" />
			<div style="color:#8C3CDD;font-size:1rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;margin-top:.6rem;${rise('.15s')}">Revel, in depth &middot; Episode ${card.episode}</div>
			<div style="color:#0D1E1C;font-size:3.4rem;font-weight:900;line-height:1.1;text-align:center;max-width:60rem;${rise('.3s')}">${card.title}</div>
			<div style="color:#4b5563;font-size:1.25rem;font-weight:500;letter-spacing:.01em;${rise('.5s')}">Seen through the eyes of ${card.pov}</div>
			<div style="position:absolute;left:0;right:0;bottom:7%;text-align:center;color:#6b7280;font-size:.95rem;font-weight:500;${rise('.8s')}">The free, open-source event platform for communities, clubs and independent venues.</div>
		</div>`;
}

/** Paint the episode title card on about:blank (call BEFORE startRecording). */
export async function showTitleCard(page: Page, card: EpisodeCard): Promise<void> {
	await page.goto('about:blank');
	await page.evaluate((html) => {
		document.body.style.margin = '0';
		document.body.innerHTML = html;
	}, titleCardHtml(card, rMarkDataUri(), true));
	// Let the data URI decode before the recorder starts.
	await page.waitForTimeout(400);
}

let cutNonce = 0;

/**
 * Cut from whatever is painted on the recorded page to `path`, keeping an
 * identical `html` cover on the destination from its very first frame, then
 * dissolving it once the page has loaded. Unlike clip-helpers'
 * `interstitialCutTo`, this can be used any number of times per clip — each
 * call gets its own nonce, so earlier init scripts never repaint.
 */
async function coveredGoto(page: Page, html: string, path: string, fadeMs: number): Promise<void> {
	const id = `revel-ep-cover-${++cutNonce}-${Date.now().toString(36)}`;
	await page.addInitScript(
		([markup, coverId, target]) => {
			// Only the document this cut is heading for gets the cover. The
			// sessionStorage guard below is per ORIGIN, so without this check a
			// later hop to another origin (Mailpit, say) would repaint the card
			// on its first document and never dissolve it (cost ep-no-account
			// two takes).
			try {
				const want = new URL(target as string, location.href);
				if (location.pathname !== want.pathname) return;
			} catch {
				return;
			}
			try {
				if (sessionStorage.getItem(coverId)) return;
				sessionStorage.setItem(coverId, '1');
			} catch {
				/* about:blank — fall through */
			}
			const paint = (): boolean => {
				try {
					if (document.getElementById(coverId)) return true;
					const root = document.documentElement;
					if (!root) return false;
					const el = document.createElement('div');
					el.id = coverId;
					el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
					el.innerHTML = markup;
					root.appendChild(el);
					return true;
				} catch {
					return false;
				}
			};
			if (!paint()) {
				const poll = setInterval(() => {
					if (paint()) clearInterval(poll);
				}, 4);
				setTimeout(() => clearInterval(poll), 5000);
			}
			document.addEventListener('DOMContentLoaded', paint);
		},
		[html, id, path]
	);
	await gotoClean(page, path);
	await page.evaluate(
		([coverId, ms]) => {
			const el = document.getElementById(coverId as string);
			if (!el) return;
			const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: ms as number,
				easing: 'ease',
				fill: 'forwards'
			});
			anim.finished.then(() => el.remove()).catch(() => el.remove());
		},
		[id, fadeMs]
	);
	await page.waitForTimeout(fadeMs + 150);
}

/**
 * Leave the title card for the first app page with a dissolve. Call this
 * AFTER `narration.mark('title')` has had its line spoken.
 *
 * Any auth or client bootstrap the destination needs must already be in the
 * browser context (log in on the recorded page before `showTitleCard`, or on
 * a side page) — the cover hides the load, it does not wait for auth.
 */
export async function titleCardCutTo(page: Page, card: EpisodeCard, path: string): Promise<void> {
	await coveredGoto(page, titleCardHtml(card, rMarkDataUri(), false), path, 800);
}

function interstitialHtml(kicker: string, title: string): string {
	return `<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;background:linear-gradient(165deg,#f3eefc 0%,#e7defa 55%,#dbe4ff 100%);font-family:${FONT};">
			<div style="color:#8C3CDD;font-size:1.05rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">${kicker}</div>
			<div style="color:#0D1E1C;font-size:3rem;font-weight:900;line-height:1.12;text-align:center;max-width:58rem;">${title}</div>
		</div>`;
}

/**
 * Persona / place cut inside an episode. Paints the soft interstitial as an
 * OVERLAY on the current page (no white frame), holds it, runs `during` (the
 * unrecorded account switch, typically), then cuts to `path` under the same
 * card and dissolves it away.
 *
 *   await episodeCut(page, 'Meanwhile', 'The organizer’s side', adminPath, {
 *     during: () => switchUser(page, owner.email, owner.password)
 *   });
 */
export async function episodeCut(
	page: Page,
	kicker: string,
	title: string,
	path: string,
	{ holdMs = 1500, during }: { holdMs?: number; during?: () => Promise<void> } = {}
): Promise<void> {
	const html = interstitialHtml(kicker, title);
	await page.evaluate((markup) => {
		const el = document.createElement('div');
		el.id = 'revel-ep-interstitial';
		el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
		el.innerHTML = markup;
		document.documentElement.appendChild(el);
	}, html);
	if (during) await during();
	await page.waitForTimeout(holdMs);
	await coveredGoto(page, html, path, 700);
}

/**
 * The close: the brand end card, narrated. Mark the close scene FIRST (the
 * export fades through black at scene boundaries, so the swap lands inside the
 * black), then call this, then wait out the line.
 */
export async function closeEpisode(page: Page, remainingMs: number): Promise<void> {
	await showEndCard(page);
	await page.waitForTimeout(Math.max(0, remainingMs) + 600);
}
