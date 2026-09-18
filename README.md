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
