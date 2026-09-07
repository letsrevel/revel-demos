# Revel, in depth — the episode series

Fifteen short episodes, one feature each, each told through a different pair of
eyes. Same frame every time, so they read as a series:

```
title card (painted, narrated)        ~7 s   scene "title"
3–5 scenes on real pages              ~50–65 s
[persona cut on the soft card]
brand end card (narrated)             ~7 s   scene "close"
                                      ------
                                      60–80 s per episode
```

Files: `demos/ep-<slug>.demo.ts` + `demos/ep-<slug>.scenes.json`, probe in
`probes/ep-<slug>.mjs`. Render with `npm run episode -- ep-<slug>` — it gates
concurrency and writes to `videos/in-depth/`. `demos/ep-format-check.*` is the
empty skeleton to copy; `demos/episode-helpers.ts` paints the cards.

## House rules for every episode

- **Open**: `showTitleCard` → `startRecording` → `mark('title')` → wait the
  line out → `titleCardCutTo(page, CARD, firstPath)`. The title line names the
  episode and whose eyes we're using.
- **Cuts** between personas or places: `episodeCut(page, kicker, title, path,
  { during: () => switchUser(...) })`. Mark the next scene AFTER the cut.
- **Close**: `narration.mark('close')` → `closeEpisode(page,
  narration.durationFor('close'))`. The close line is one sentence of recap,
  then always: *"Revel is free and open source. Find it at lets revel dot io."*
- **Voice**: warm, plain, spoken. Short sentences. What it does, why you'd care.
  No superlatives. Product nouns spelled for the engine where needed
  ("R S V P", "lets revel dot io"). Draft on Kokoro only.
- **Arrange everything through the API** (`demos/arrange-lib.mjs`), dressed:
  real addresses, descriptions a community would write, human names and
  human-shaped emails for anyone on camera. Fresh state every run.
- **Two personas maximum** per episode. One cut is normal, two is the ceiling.
- **Overlays**: one lower-third or callout per app scene, four words or fewer.
  None on the title or close.
- **Probe first**, render second, look at frames third, report last.

---

## 1 · Publish your first event — *the organizer*
Journeys 10.1, 10.2. Org arranged via API (a fresh club); the event is created
**on camera** in the form.

1. **title** — "Episode one. Publishing your first event. We're the organizer of a small club, and tonight we're putting our next night on the calendar."
2. **form** (`/org/<slug>/admin/events/new`) — type the name, pick the date, paste the address, choose *Public*, leave tickets off so it's a free R S V P, set a capacity. "The event form asks the questions a real night needs answered: what, when, where, and who it's for. Public, unlisted, invitation only, or members only."
3. **draft** (event admin page after save) — "It saves as a draft. Nothing is public yet, so you can add a cover, a description, a potluck list, and get it right first."
4. **open** (click *Open* → public page `/events/<org>/<slug>`) — "One click opens it. This is what your people see: the details, the map, and a button to say they're coming."
5. **close** — "From a blank form to a live page, in a couple of minutes. Revel is free and open source. Find it at lets revel dot io."

## 2 · Tickets, your way — *the organizer, then an attendee*
Journeys 6.2–6.6, 10.4. Arrange: event with three tiers — *Early bird* €12
offline (bank transfer, with payment instructions), *Pay what you can* €5–€30
at the door, *Volunteers* free. A fresh attendee with no ticket.

1. **title** — "Episode two. Tickets, your way. First as the organizer setting the prices, then as someone buying one."
2. **tiers** (event admin → tickets / tiers list) — "A tier is a way in. This night has three: an early-bird price paid by bank transfer, pay-what-you-can at the door, and a free tier for volunteers. Each has its own quantity, sales window, and who can see it."
3. cut → **choose** (attendee on the event page, ticket options) — "Here's the same night from the other side. The tiers you're allowed to see, with the price and what's left."
4. **pwyc** (pick pay what you can, set an amount, confirm) — "Pay what you can means exactly that: pick a number between the floor and the ceiling, and you're in. No card needed for a door ticket."
5. **ticket** (`/dashboard/tickets` → the ticket with QR and wallet buttons) — "The ticket lives in your dashboard, with a Q R code for the door and a pass for your phone's wallet."
6. **close** — "Card, cash, transfer, or free, and every ticket tracked the same way. Revel is free and open source. Find it at lets revel dot io."

## 3 · Pick your seat — *the organizer's venue, then an attendee*
Journey 19. Use the seeded org `revel-events-collective` (owner
`alice.owner@example.com`) whose venue has a layout with seats; arrange a NEW
event on that org linked to the venue, with an **at-the-door, user-choice**
tier on the seated sector. A fresh attendee.

1. **title** — "Episode three. Pick your seat. A venue with real rows, first from the organizer's layout designer, then from the seat map a buyer sees."
2. **designer** (`/org/revel-events-collective/admin/venues/<id>/designer`) — "A venue is drawn once and reused for every show: sectors, rows, seats, and which ones are accessible. Ticket tiers then sell from a sector."
3. cut → **map** (attendee on event page → seat map) — "As a buyer, the map is the ticket page. Sold seats are greyed out, and what you're holding is yours for ten minutes."
4. **pick** (click two adjacent seats → checkout → confirm) — "Pick two seats together, and check out. The price is resolved seat by seat, so a front row can cost more than the back without a separate tier."
5. **ticket** (dashboard ticket shows row and seat) — "The ticket names the row and the seat, and so does the door scanner."
6. **close** — "Reserved seating, without a box-office contract. Revel is free and open source. Find it at lets revel dot io."

## 4 · Invite links — *the organizer, then an invited guest*
Journey 12.3. Arrange: an **invitation-only** event (event_type private or
"invitation only"), a token created on camera in the event's invitations admin
(or arranged and shown), and a fresh user who is not invited.

1. **title** — "Episode four. Invite links. An invitation-only night, and the link that gets a friend through the door."
2. **token** (event admin → invitations → create shareable link, max uses, expiry) — "For a private night, you don't publish, you invite. A shareable link carries the invitation: how many times it can be used, and until when."
3. cut → **preview** (logged-out or fresh user opens `/join/event/<token>`) — "Whoever gets the link sees exactly what it grants before they claim it, so nobody joins something by accident."
4. **claim** (log in / claim → lands on the event page, now able to R S V P) — "Claim it, and the event opens up. The invitation can also waive a questionnaire or a capacity limit, if you say so."
5. **close** — "Private events, invited people, one link. Revel is free and open source. Find it at lets revel dot io."

## 5 · The waitlist — *an attendee, with a peek at the organizer's list*
Journey 5.5, 10.10. Arrange: RSVP event with capacity 2 already full (two
arranged attendees), `waitlist_open` on. A fresh attendee. After they join, an
API call as the owner raises capacity (or removes an RSVP) so the spot opens
and the notification arrives — the worker is running.

1. **title** — "Episode five. The waitlist. A full event, from the point of view of the person who got there too late."
2. **full** (event page: full, *Join waitlist*) — "It's full. Instead of a dead end there's a waitlist — one click, and you're in the queue."
3. **queued** (after joining: the "you're on the waitlist" state, then organizer raises capacity off screen) — "Behind the scenes the organizer can see the queue, and manage it. When a spot opens, the next person is told."
4. **spot** (notification bell → open → back on event with R S V P available → click Yes) — "There it is. A spot opened, the notification came, and now the R S V P is yours to take."
5. cut (optional, if time allows) → **list** (`/org/<slug>/admin/events/<id>/waitlist`) — "And on the organizer's side, the list stays honest: who's waiting, since when."
6. **close** — "Full doesn't have to mean no. Revel is free and open source. Find it at lets revel dot io."

## 6 · Announcements — *the organizer, then an attendee*
Journeys 10.11, 15.4. Arrange: event with 5–6 arranged attendees (human
names). Announcement drafted on camera in `/org/<slug>/admin/announcements`.

1. **title** — "Episode six. Announcements. Telling everyone who's coming that the venue changed — once."
2. **draft** (new announcement: title, body, target = attendees of the event) — "Write it once, choose who it's for: everyone coming to this event, all members, one membership tier, or just staff."
3. **count** (recipient count preview → send) — "Before it goes out, it tells you how many people that is. Then send — or schedule it for the morning of."
4. cut → **inbox** (attendee: notification bell → the announcement; then the event page's announcements section) — "For the people coming, it lands in their notifications, by email if they want it, and stays on the event page for anyone who joins later."
5. **close** — "One message, the right people, no group chat. Revel is free and open source. Find it at lets revel dot io."

## 7 · Staff and permissions — *the owner, then a staff member*
Journeys 8.5, 9.1. Arrange: org with an event and a member (human name). On
camera the owner promotes the member to staff with **only** "check in
attendees" and "manage tickets". Then the staff member's own admin view.

1. **title** — "Episode seven. Staff and permissions. Handing someone the door, without handing them the keys."
2. **promote** (members → staff → add, tick two permissions) — "Staff get exactly the permissions you tick: check people in, manage tickets, send announcements, edit the org, and so on. Nothing else."
3. cut → **limited** (staff member's admin: the sidebar or pages they can reach; tickets page works) — "Signed in as that staff member, the admin only shows what they're allowed to touch. The door list, yes."
4. **denied** (try settings or members → blocked or hidden) — "Settings and members, no. And the permissions can differ per event, so the volunteer running Friday isn't running everything."
5. **close** — "Trust in small, specific pieces. Revel is free and open source. Find it at lets revel dot io."

## 8 · Safer spaces — *the organizer, then someone on the list*
Journey 13.1–13.3. Arrange: org + event; on camera the owner adds a
**name-only** blacklist entry (a made-up name, e.g. "Jordan Vale", with a
short reason). Then a fresh user registered as "Jordan Vale" opens the event:
the fuzzy match shows the restricted-list message and a whitelist request
form; they submit a message. End on the organizer's whitelist-requests queue.

Keep the tone careful: this is about care for a space, not about punishment.
No real names; nothing that reads as an accusation.

1. **title** — "Episode eight. Safer spaces. What happens when a name that shouldn't be there tries to come in."
2. **entry** (`/org/<slug>/admin/blacklist` → add by name, with a note) — "Some spaces need to keep certain people out. An entry can be an email, a phone number, or just a name — and a name matches even when it's spelled a little differently."
3. cut → **blocked** (the user on the event page: restricted-list message) — "Someone whose name matches doesn't get the R S V P button. They get an honest message, and a way to say 'that's not me'."
4. **request** (submit whitelist request with a message) — "A whitelist request goes to the organizer with whatever they want to say."
5. cut → **queue** (owner's whitelist requests page) — "And the organizer decides, with the context in front of them. Members of the community skip the fuzzy check entirely — they're already trusted."
6. **close** — "Tools for care, not just for tickets. Revel is free and open source. Find it at lets revel dot io."

## 9 · Recurring events — *the organizer, then a follower*
Journey 18. Arrange: org. On camera: `/org/<slug>/admin/event-series/new-recurring`
— a weekly Thursday session, generated for the coming weeks. Then the public
series page and, as a fresh user, *Follow*.

1. **title** — "Episode nine. Recurring events. A weekly session, set up once."
2. **rule** (the recurring-series form: template event, weekly on Thursdays) — "Describe the night once — name, place, time — and the rule: every Thursday, say. Revel generates the coming weeks."
3. **occurrences** (series admin page listing generated events) — "Each occurrence is a real event with its own tickets and its own capacity. Change the template and the changes carry forward; cancel one week without touching the rest."
4. cut → **follow** (fresh user on `/events/<org>/series/<series>`: the list, then *Follow*) — "For your people, the series has a page of its own. Follow it, and every new date shows up in their notifications."
5. **close** — "Set it up once, run it every week. Revel is free and open source. Find it at lets revel dot io."

## 10 · Polls — *the organizer, then a member*
Journey 24. Arrange: org with a few members (human names). On camera:
`/org/<slug>/admin/polls/new` — "Which night for the summer social?" with
three options, members only, open it. Then a member votes on
`/org/<slug>/polls/<id>`, and results (arrange a couple of API votes first so
the results show a spread).

1. **title** — "Episode ten. Polls. Asking the members instead of guessing."
2. **create** (new poll: question, options, who can vote) — "A poll is a question, a few options, and an audience: everyone, members, or one tier. Anonymous or not, your call."
3. **open** (open it; the admin view of the live poll) — "Open it, and it's live on your organization's page."
4. cut → **vote** (member votes) — "As a member, one tap. You can change your mind if the organizer allows it."
5. **results** (results view) — "Results, live, when you've chosen to show them."
6. **close** — "Decisions with the people they affect. Revel is free and open source. Find it at lets revel dot io."

## 11 · No account needed — *a visitor with no account*
Journey 7.1. Arrange: public RSVP event with `can_attend_without_login`. On
camera, logged out: event page → *R S V P as guest* → name and email → the
confirmation email (open the email's HTML in Mailpit: `http://localhost:8025`
— frame the email, not Mailpit's chrome) → the confirm link → confirmed.

1. **title** — "Episode eleven. No account needed. Coming to something without signing up for anything."
2. **guest** (event page logged out; the guest R S V P button, name + email) — "If the organizer allows it, you can R S V P with just a name and an email. No password, no profile."
3. **email** (the branded email) — "You get one email, to confirm it's you."
4. **confirmed** (confirm-action page → the event page in the confirmed state) — "And that's it. If you make an account later with the same email, this R S V P is already there."
5. **close** — "Low friction for guests, no spam for anyone. Revel is free and open source. Find it at lets revel dot io."

## 12 · Your account, your data — *a regular user*
Journeys 3.2–3.5, 17. Arrange: a fresh user who attends one event. On camera,
a montage through `/account/profile` (preferred name, pronouns, language),
dietary restrictions, `/account/notifications` (digest), `/account/security`
(the two-factor setup with the Q R code on screen — don't complete it),
`/account/privacy` (export my data, delete my account).

1. **title** — "Episode twelve. Your account, your data. The settings a person actually gets to keep."
2. **profile** — "Your name the way you want it said, your pronouns, your language. Organizers see what you choose to share."
3. **dietary** — "Dietary needs, once, in your profile — every potluck and dinner you join can use them."
4. **notifications** — "Notifications on your terms: what, through which channel, and whether it's now or a daily digest."
5. **security** — "Two-factor sign-in with any authenticator app."
6. **privacy** — "And the two buttons every platform should have: export everything about me, and delete my account. Both are real, and both are yours."
7. **close** — "Privacy-first is a setting you can see. Revel is free and open source. Find it at lets revel dot io."

## 13 · The questionnaire gate — *an applicant, then the organizer*
Journey 11.3–11.5, on the seeded flagship **Shibari Circle Vienna**. Do not
modify the seeded event or its "Workshop Application" questionnaire (other
clips depend on them). Instead duplicate the seeded event through
`POST /api/event-admin/{id}/duplicate` (it copies cover art, description and
the questionnaire links) as an open "October edition", detach the seeded
one-question questionnaire from the copy, and attach a NEW manually-reviewed
questionnaire with **two sections and four or five questions**: multiple
choice ("How much rope experience do you have?" none / a few workshops /
regular practice; "Are you coming with a partner?" yes / no), a free text on
what they hope to learn, a free text on injuries or limits the instructors
should know, and a multiple choice consent line ("Have you read the house
rules on consent and aftercare?" yes). A fresh applicant per run (human name,
e.g. Noa Beckmann-style) who has not applied.

1. **title** — "Episode thirteen. The questionnaire gate. A rope workshop that asks a few questions before it says yes — first as someone applying, then as the organizer reading the answers."
2. **gate** (applicant on the event page: the ticket tier is there but locked behind "complete the questionnaire") — "Some events shouldn't be first come, first served. This workshop has one free tier, and a gate in front of it: a short application, read by a person."
3. **fill** (the questionnaire page: answer every question on camera, typing the free text visibly) — "Sections, multiple choice, free text. The organizer wrote these; Revel just asks them. Submit, and it goes to review."
4. **pending** (back on the event page: application pending) — "Nothing to buy yet. The page says it's being reviewed, and that's honest."
5. cut → **review** (organizer opens the submissions list, then this submission: every answer, the reviewer notes, Approve) — "On the other side, the answers arrive as they were written. The organizer reads them, and approves — or doesn't, with a note."
6. cut → **unlocked** (applicant's event page: tier unlocked, claim the free spot) — "Approved. The tier unlocks, and the spot is theirs."
7. **close** — "Screening that feels like care, not a bouncer. Revel is free and open source. Find it at lets revel dot io."

Two personas, two cuts. Because the fill scene carries five questions, this
episode may run to **80–90 s**; keep the review scene tight.

## 14 · Who can see it, who can come — *the organizer, an outsider, then a member*
Two separate dials on every event, and people mix them up: **visibility**
(who can find and view the page) and **event type / eligibility** (who is
allowed to attend). The event form's "What's the difference?" box says exactly
this; the episode shows it. Arrange a dressed club with one member (Persona C)
and one non-member (Persona B), and three open RSVP events:

| event | `visibility` | `event_type` | what it proves |
| --- | --- | --- | --- |
| "Open Rehearsal" | public | public | anyone sees it, anyone can come |
| "Members' Night" | public | members-only | **everyone sees it; only members can R S V P** |
| "Committee Meeting" | members-only | members-only | non-members don't even see it |

(Check the exact enum values in openapi.json — `EventCreateSchema.visibility`
and `event_type`. Verify with the API as each persona what `/api/events/` lists
and what `my-status` says.) Three personas is an approved exception for this
episode: organizer → outsider → member, two cuts.

1. **title** — "Episode fourteen. Who can see it, and who can come. Two different questions, and Revel asks them separately."
2. **dials** (organizer, event form or edit page: the Visibility cards, then the Event Type cards, with the "What's the difference?" box in frame) — "On the form, visibility is who can find the page: everyone, people with the link, or only members. Event type is who's allowed in: anyone, invited people, or members. You can set them independently."
3. cut → **outsider** (non-member on the org page / events list: sees Open Rehearsal and Members' Night, not Committee Meeting; opens Members' Night: the members-only eligibility message and the join/request-membership call to action) — "Someone who isn't a member sees the members' night — it's public — but can't R S V P. The page says why, and offers the way in: join. The committee meeting isn't on their list at all."
4. cut → **member** (member on the same org page: all three; opens Members' Night and R S V Ps yes) — "A member sees all three, and the members' night just works."
5. **close** — "Visible isn't the same as open, and you get to choose both. Revel is free and open source. Find it at lets revel dot io."

## 15 · Selling a ticket, start to finish — *the organizer, then a buyer, then the organizer*
Ticketing on its own: tiers, payment methods, and confirming a payment.
Different from episode 2, which is the buyer's side of pay-what-you-can. Two
personas, two cuts. Arrange a dressed org and an open ticketed event with a
free "Volunteers" tier and an at-the-door tier already there via API; the
**offline** tier is created ON CAMERA.

1. **title** — "Episode fifteen. Selling a ticket, start to finish. Setting the price, taking the money, and confirming it came in."
2. **tier** (organizer, event edit → Ticketing tab → new tier: name "Early bird", price 12, payment method = offline / bank transfer with typed instructions — show the other payment methods in the picker while the line names them: card online through Stripe, bank transfer, at the door, free — and the fixed vs pay-what-you-can choice; quantity; save) — "A tier is a price and a way to pay. Card online, through Stripe. Bank transfer, with your instructions on the ticket. Cash at the door. Or free. Fixed price, or pay what you can, with a floor and a ceiling."
3. cut → **buy** (buyer on the event page: picks Early bird → checkout → the ticket comes back **Pending**, with the bank-transfer instructions on it, in the ticket modal and/or dashboard) — "The buyer picks it, and gets a pending ticket with your instructions on it. It counts toward capacity, but it's not valid at the door yet."
4. cut → **confirm** (organizer on the event's ticket list: the Pending row, the action that confirms payment — find it: "Confirm payment" / mark as paid / status → Active — then the row reads Active and the counts update) — "When the transfer lands, one click confirms it. The ticket goes active, the buyer is told, and the numbers at the top follow."
5. **close** — "Every payment method, one ticket list. Revel is free and open source. Find it at lets revel dot io."
