# Lumen

**An AI tutor you can interrupt.**

Lumen ingests course material — a textbook, a slide deck, a recorded lecture — and turns it
into a course taught out loud by a voice tutor that can be stopped mid-sentence, asked a
question, and then picks up exactly where it left off.

> *Not document chat. Not a video course. A lesson that reacts.*

> **Status: specification and dimensioning.** No code yet. The two documents below define
> what is being built and how big each part of it is. Every number in them is an engineering
> estimate to be falsified by the first real lesson, not a measurement.

## Docs

| Doc | What's in it |
|---|---|
| [00 — Specification v0.1](docs/00-spec-v0.1.md) | The source spec: capabilities, components, functional and non-functional requirements, the session state machine, the data model |
| [01 — Dimensioning](docs/01-dimensioning.md) | **Read this one.** The six open questions closed, the latency and cost budgets, what a document actually becomes, and the one test that should happen before anything is built |

## The short version

- **The differentiator is the interruption, not the voice.** Plenty of things can read a
  textbook aloud. The product is what happens in the three seconds after a student says
  "wait" — it stops, understands, answers from the lesson, and resumes at the right point.
- **The teaching path and the interruption path are opposites, and get different machinery.**
  The tutor knows what it is about to say for most of a lesson, because it is reading a script
  we generated. That speech is synthesised once at publish time and cached; only the
  unpredictable part runs through a realtime provider. This removes most of the runtime cost,
  most of the latency, and makes the teaching path survive the voice provider being down.
- **The resume pointer is the product.** Script node, audio offset *within* the utterance, and
  canvas state — persisted, not inferred from conversation history. Resuming the speech but not
  the diagram is still a wrong resume.
- **Programming first, one course.** Not for the market — because it is the only domain where
  scoring an answer is running a test rather than making a judgement call, and every adaptive
  decision in the system is only as good as that evidence.
- **Course production is gated by human review, not compute.** Ingesting a 300-page book costs
  single-digit dollars of inference. The instructor hour spent reviewing the lesson graph is
  the real unit cost, so the review gate is on the *graph* — concepts, ordering, prerequisites —
  never on the prose.
- **Multi-tenant from the first migration.** A column and a query filter now; a migration
  through every table later, with an institutional customer watching.

## What is built

| | |
|---|---|
| `projects/domain` | The rules the client and server both hold: the resume pointer, where an interrupted utterance re-enters, the session state machine, the register ladder |
| `projects/tutor-voice` | The client half of the tutor: the microphone gate that decides to stop, speech output that knows where it got to, and the session that holds the pointer |
| `src/app/auth` | The door: the in-memory access token, the interceptor that attaches and refreshes it, and the screen in front of both |
| `src/app/layouts` | The chrome: the shell every page is routed inside, the top bar, and the lesson sidebar |
| `src/app/library` | Every course you have made, so finishing a lesson is not the same as losing it |
| `src/app/upload` | Hand over a document and watch it become a lesson |
| `src/app/tutor` | Being taught: the voice orb, the animated concept canvas, captions, and interrupting |
| `prototypes/corridor-test` | The original single-file rig. Kept because it is the cheapest way to re-ask the only question that matters |

The backend is a separate repository: **[WilliamsEnabulele/Lumen-BE](https://github.com/WilliamsEnabulele/Lumen-BE)**.

The access token is held in memory and never in storage. Losing it on reload is the point:
the refresh token that survives the reload is HttpOnly precisely so that a script on the page
cannot read it, and keeping the short-lived half somewhere a script *can* read gives most of
that back. A silent refresh at boot is what makes the cost invisible.

Two rules are implemented twice on purpose — `snapBack` and the session state machine exist in
both TypeScript and C#. Not an oversight: the client has to decide where to resume inside the
barge-in budget, and a round trip to ask the server spends that budget before anything has been
decided. The duplication is kept honest by holding both to the same test cases.

## Running

```bash
npm install
npm run build:libs   # libraries first; the app consumes them from dist
npm start            # the student app on :4200, proxying /api to the backend on :5299
npm test             # domain, tutor-voice, then the app
```

Run the backend from [Lumen-BE](https://github.com/WilliamsEnabulele/Lumen-BE) alongside it —
`dotnet run --project Lumen.Api`. Tests run in headless Chromium.

## The lesson screen

Three zones, and a deliberate omission in each.

**The plan**, down the left: every concept in teaching order, what is being taught now, and a
tick against the ones this student has actually demonstrated. It has no previous and next.
The lesson leaves a concept on evidence, and a button that walks past one nobody has shown
undoes the thing the whole progression exists to do.

**The room**: the tutor's state, the canvas it is drawing on, and one control — *say it another
way*, which goes to the server as a turn rather than as a mode, because a student saying they
did not follow is the same kind of event as anything else they say. A separate switch would be
a second way into the reteach path, and a reteach path nothing could reach is a bug this
project has already shipped once.

There is no transport. No scrubber, no skip, no playback speed: none of it is pre-recorded, and
a progress bar you can drag implies a lesson that has already happened.

**Transcript, key points and notes**, along the bottom, with the ask-anything box under all
three so cutting in is never more than one click away. The transcript is this sitting. What
outlives it is what the student chose to keep, which goes to the server.

The bar over the plan is **position through the plan, never belief**. What the tutor believes
somebody knows is rendered in words, by `standing` in `projects/domain` — a belief drawn as a
filled bar gets read as a score out of a hundred, and arguing with it as though it were one is
the wrong argument. `throughPlan` is beside it and says so.

## The flow

1. **Hand over a document.** Markdown, plain text, DOCX or PPTX. It goes to the backend, which
   reads it, works out what it teaches, and writes the script.
2. **Wait, honestly.** Stages, not an invented percentage: reading the document, working out
   what it teaches, writing the lesson.
3. **Be taught.** The tutor speaks. The orb shows whether it is talking, listening or working
   something out. The canvas animates against the speech — code with the line being discussed
   lit, points arriving as they are said.
4. **Cut in whenever.** Start talking and it stops. Ask, and the answer comes from the lesson
   with the passage it came from named — or is declared out of scope rather than guessed at.
   Then it picks up where it left off, mid-sentence, with the canvas at the same frame.

Without a microphone, typing reaches exactly the same path. Without a speech voice installed,
the lesson still runs as paced captions rather than racing past.

## Stack

ASP.NET Core on PostgreSQL. Object storage for source documents and the pre-synthesised audio
cache. A vector + keyword index for grounded retrieval. A bought realtime voice provider behind
an interface with two implementations, never a self-hosted one.

The Tutor Session Engine is **stateful and long-lived** — sessions pin to a node and checkpoint
their resume pointer on every script node boundary. It is the one tier in the system that must
not be deployed as a request/response service.

## The two numbers that decide everything

> **Interruption success rate.** At 95% it feels like a tutor. At 80% the student learns that
> interrupting is a gamble, stops doing it, and we have shipped a talking video with a much
> larger bill.
>
> **Cost per student-hour.** A voice session burns money continuously, unlike every other kind
> of software. If a student-hour costs more than a student pays for it, growth makes it worse.

## Next step

**The corridor test**, in [01 §10](docs/01-dimensioning.md#10-the-riskiest-assumption-and-the-test-that-settles-it):
one 15-minute hand-written lesson, a hard-coded resume pointer, a voice API wired straight to
it — no ingestion pipeline, no abstractions. Put a real student in front of it and count how
many times they interrupt, and whether they keep doing it.

If they stop interrupting, none of the rest matters yet.
