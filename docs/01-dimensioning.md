# Dimensioning

Companion to [`00-spec-v0.1.md`](00-spec-v0.1.md). The spec says *what* to build. This says
**how big each part is, what it costs, where the time goes, and which of the spec's open
questions are now closed.** Where the two disagree, this document wins.

> **How to read the numbers.** Everything here is an engineering estimate derived from the
> shape of the system, not a measurement — nothing has been built yet. Each one is stated so
> it can be *falsified* by the first real lesson. A number that survives the corridor test
> (§10) becomes a budget; one that doesn't sends us back to this document, not to a
> workaround in the code. Vendor prices are bands, deliberately — re-price them the week we
> commit, not from this file.

---

## 1. The two numbers that decide the product

Everything below serves these. If a design choice doesn't move one of them, it is a detail.

> **Interruption success rate.** Of all barge-ins, the share where the tutor stops cleanly,
> answers the actual question, and resumes at the *right* point. This is the product. At 95%
> it feels like a tutor. At 80% the student learns that interrupting is a gamble, stops
> doing it, and we have shipped a talking video with extra steps and a much larger bill.
>
> **Cost per student-hour.** A realtime voice session burns money continuously, unlike every
> other kind of software. If a student-hour costs more than a student pays for it, no amount
> of growth fixes it — growth makes it worse. This number must be known before the pricing
> page, not after.

The second number is the one most voice-AI products get wrong, and it is the reason for the
single biggest architectural decision in this document (§4.1).

---

## 2. Decisions taken

The spec's §7 questions, closed. Each says what was chosen, why, and what would reverse it.

### 2.1 Realtime voice — buy, and split the path in two

**Decision.** Buy, never build. And do not run one pipeline: **the teaching path and the
interruption path have opposite requirements and get different machinery.**

| | Teaching path | Interruption path |
|---|---|---|
| What is said | Known at publish time | Unknowable until it happens |
| Latency need | None — it is a playback | Brutal — §4 |
| Therefore | **Pre-synthesised at publish, cached in object storage** | Realtime provider, live |
| Runtime cost | Bandwidth only | ASR + LLM + TTS per second |
| Share of session | 80–90% | 10–20% |

This is the highest-leverage decision available. The tutor knows what it is about to say for
most of a lesson, because it is reading a script we generated. Synthesising that once, at
publish time, and serving it as cached audio:

- removes 80–90% of runtime TTS cost (§7),
- removes TTS latency from the common path entirely,
- allows a slower, better, more expensive voice than a realtime budget could afford,
- makes the teaching path *survive the voice provider being down* — which is NFR-7 satisfied
  by construction rather than by a fallback mode nobody tests,
- and makes prosody reviewable by the instructor before a student ever hears it.

The cost is a publish step that takes minutes and a cache to invalidate when a script node
is edited. That is a good trade.

**Provider.** One `IRealtimeVoiceProvider` interface, two implementations from day one. Not
for portability theatre — for NFR-7, and because the second implementation is what proves
the first one's abstraction isn't just its SDK wearing a hat. Pick on measured
time-to-first-audio and interrupt-cancellation behaviour, not on demo quality.

*Reversed if:* pre-synthesis proves unable to carry adaptive rewording (§2.4) — i.e. if the
adaptive logic ends up rewriting so much of the script at runtime that the cache never hits.
Watch cache hit rate from the first adaptive release.

### 2.2 Initial domain — programming and CS, one course

**Decision.** Ship one domain first: **introductory programming / computer science.**

Not because the market is best, but because **it is the only domain where FR-18 is honest.**
Scoring a short answer in history is a judgement call we would be asking an LLM to make and
a student to accept. Scoring code is a test run. The mastery estimate that drives every
adaptive decision in §3.4 of the spec is only as good as its evidence, and in this domain the
evidence is a green test, not a vibe.

It also means the code playground (FR-15) stops being a costly side feature and becomes the
primary visual surface — one investment doing double duty as the assessment substrate.

*Reversed if:* we find a buyer who needs a different domain badly enough to fund the fuzzier
assessment work. That is a commercial decision, not a technical one.

### 2.3 Tenancy — multi-tenant from the first migration

**Decision.** `tenant_id` on every row that isn't reference data, from the first migration.
Single-tenant institutional deployment is a *configuration*, not a fork.

This is not a feature, it is a one-way door. Retrofitting tenancy means a migration through
every table, every query, and every index in the system, at exactly the moment the first
institutional customer is watching. The cost of doing it now is a column and a query filter.

### 2.4 Retention — transcripts yes, audio no, no minors in v1

**Decision.**

| Data | Retained | For | Why |
|---|---|---|---|
| Session transcript (text) | Yes | 24 months | Feeds mastery evidence trails (FR-18) and instructor reports (FR-20) |
| Raw session audio | **No, by default** | 30 days, explicit opt-in only | See below |
| Generated artifacts (code run, notes) | Yes | 24 months | Student-visible under FR-22 |
| Mastery + attempts | Yes | Life of account | It *is* the student model |

Raw audio is the expensive, dangerous one: roughly 15 MB per lesson-hour per student (§8),
it is biometric-adjacent in several jurisdictions, and **almost nothing in the spec needs
it.** Every requirement that looks like it wants audio actually wants the transcript.
Retaining it by default buys storage cost and regulatory exposure in exchange for a debugging
convenience.

**K-12 is out of scope for v1.** Higher-ed and adult learners only. Minors bring COPPA/FERPA
and their equivalents, parental consent flows, and a different retention posture — that is a
market entry, not a toggle, and it should not be absorbed silently while the core is being
proven.

### 2.5 Initial scale — 200 concurrent sessions

**Decision.** Dimension the launch for **200 concurrent realtime sessions**, on an
architecture that scales horizontally past it without redesign (§6).

200 is chosen to be honestly reachable and structurally interesting: it is past the point
where a single process is fine, so it forces sticky routing and session checkpointing to be
solved for real, and well short of the point where we would be optimising for a load we don't
have. The constraint that binds first is almost certainly the **voice provider's concurrency
quota**, not our compute — which is a procurement lead time, so it gets asked about in week
one, not month six.

### 2.6 Authoring — mandatory review gate, on the graph not the script

**Decision.** Nothing reaches a student unreviewed. But the reviewer's unit of work is the
**lesson graph** — concepts, ordering, prerequisite edges, assessment items — not the prose.

Reviewing generated prose line by line is unbounded work and the wrong work; an instructor
reading 3,000 words of script per lesson is slower than writing it. Reviewing the *structure*
is bounded, is where the pedagogical judgement actually lives, and is where a generation error
does real damage (a wrong prerequisite edge mis-teaches every student who hits it; an awkward
sentence does not).

**The metric to hold: under 1 hour of instructor time per finished lesson-hour.** If review
runs above that, generation quality is the problem to fix — not the review gate to remove.

---

## 3. What the spec understates

Three things that read as one line in the spec and are not one line of work.

**The resume pointer is the whole product, and it is three-dimensional.** The spec correctly
insists it be first-class and persisted. It is more than a bookmark: resuming needs the script
node, the audio offset *within* that node's utterance, and the **canvas state** — which
diagram was up, what was in the playground, what had been run. Resuming the speech but not the
canvas puts the tutor back mid-sentence in front of the wrong picture, which reads as a bug to
a student even though the pointer "worked". Model all three from the start; retrofitting canvas
state into a pointer that already has persisted rows is a migration.

**Barge-in has a false-positive path, and it needs a resume-mid-utterance.** A cough, a
sibling, a door. Stopping instantly on *any* voice (§4.1 requires it) guarantees we will
sometimes stop for nothing. The recovery must be: stop instantly, wait for the endpoint, and
if nothing intelligible arrived, resume from the exact audio offset — not from the top of the
node, which makes the tutor sound like it is stuttering. This is the reason the pointer carries
a sub-utterance offset, and the reason pre-synthesised audio (§2.1) is such a good fit: seeking
to an offset in a cached file is trivial, whereas re-synthesising from the middle of an
utterance is not.

**Reprocessing (FR-6) is a diffing problem, not a regeneration problem.** "Updates the lesson
graph without discarding student progress" means concept identity has to survive a re-run over
an edited source. That requires concepts to have stable identity derived from their content,
not from their position or a fresh GUID per run — decided at the schema, cheap now, very
expensive after the first cohort has mastery records pointing at the old ids.

---

## 4. Latency dimensioning

### 4.1 NFR-1 — barge-in stop, budget 300ms

**The only way to make this budget is to not involve the server.** A round trip to decide
whether to stop spends the entire budget before anything has been decided.

| Step | Where | Budget |
|---|---|---|
| VAD fires on student speech | **Client** | 20–50 ms |
| Stop playback, flush local audio buffer | **Client** | 5–20 ms |
| *(async, off the critical path)* notify server, cancel any in-flight synthesis | Server | — |
| **Total to silence** | | **25–70 ms** |

Comfortably inside 300ms, with one condition: **the client must never buffer more tutor audio
than it can discard.** A generous pre-buffer — the obvious thing to do for smooth playback —
is exactly what breaks this, because audio already in the OS buffer keeps playing after we
decide to stop. Cap the client-side buffer and treat that cap as a hard constraint, not a
tuning knob.

The real risk here is not latency. It is false positives, handled in §3.

### 4.2 NFR-2 — stop to responding, budget 1500ms

| Step | Budget | Notes |
|---|---|---|
| Barge-in stop (§4.1) | 50 ms | |
| **Endpoint detection** (student finished) | **300–500 ms** | The largest single item. Standard trailing-silence detection. Semantic endpointing can cut it, at the cost of cutting people off — do not attempt in v1 |
| Final ASR transcript | 100–200 ms | After endpoint; partials already streaming |
| Intent classification + retrieval | **30–80 ms** | Only because of the preload below |
| LLM first token | 200–400 ms | |
| TTS first audio chunk | 100–250 ms | |
| **Total** | **780–1480 ms** | |

**It fits, with no slack.** Two consequences:

**Preload the lesson into the session's working set at `LOADING_LESSON`.** A lesson is small
(§5) — its chunks and their embeddings fit in single-digit MB. Holding them in the session's
memory turns the common retrieval case into an in-process vector scan over a few hundred
chunks, which is the 30–80ms above. Going to the index over the network for the *common* case
spends 150–300ms we do not have. The index is then only consulted for the rarer
"broader course materials" tier of FR-10 — which is also the tier where a slightly slower
answer is acceptable, because the student has asked something off-lesson.

**Budget for a filler, and be honest with it.** At the top of the range we are at 1.5s of
silence after the student stops talking, which feels like a hang. A short acknowledgement
("Good question —") covers it. It must be selected *after* intent classification, never
before, or the tutor will say "Good question" to "can you slow down", which is worse than the
silence it was hiding.

---

## 5. Content dimensioning

What one source document actually becomes. Anchored on a 300-page textbook.

| | Estimate |
|---|---|
| Source | ~300 pages ≈ 150,000 words |
| → Concepts | ~250 (at ~600 words of source per concept) |
| → Lessons | 40–60 (4–6 concepts each) |
| → Modules | 8–12 |
| One lesson, spoken | 12–20 min ≈ 1,800–3,000 words |
| One lesson, in script nodes | **40–80 nodes** |
| Whole course, in script nodes | ~2,500–5,000 |

**The number that matters is 40–80 script nodes per lesson.** It sets the resolution of the
resume pointer, and therefore how wrong a wrong resume feels. At 40–80 nodes a lesson, a node
is 15–30 seconds — so resuming to the *wrong* node drops the student up to half a minute off,
which is recoverable. If nodes were 3 minutes each, every resume would be visibly wrong and
§1's first number would never reach 95% no matter how good the retrieval was.

It also sets pre-synthesis volume: ~5,000 nodes per course, a few seconds each, is a
publish-time batch measured in tens of minutes — fine as a background job, not fine as a
blocking request. Size the publish pipeline accordingly.

---

## 6. Concurrency and infrastructure dimensioning

**The Tutor Session Engine is stateful and long-lived, which is the atypical thing about this
system.** It is not a request/response tier and must not be deployed as one.

| | Per session |
|---|---|
| Connections | 1 realtime (WebRTC/WS) + 1 control |
| Memory: lesson working set (§4.2 preload) | 2–5 MB |
| Memory: session state, pointer, buffers | ~5 MB |
| **Total memory** | **~10 MB** |
| CPU | Mostly idle — the session spends its life waiting on a provider or on a human |

At 200 concurrent sessions (§2.5): ~2 GB of working set. **Memory and CPU are not the
constraint.** What binds, in order:

1. **Voice provider concurrency quota** — a procurement question. Ask in week one.
2. **Sticky routing.** Sessions cannot be load-balanced per-request. They pin to a node.
3. **Checkpointing.** A pinned session dies with its node, so the resume pointer must be
   durable *before* the node is trusted. Checkpoint on every script node boundary — at 15–30s
   per node (§5) that is a trivial write rate and bounds worst-case loss to one node of
   progress, which is exactly the loss a student would forgive.

Two nodes at launch, then, not for throughput but so that losing one costs 100 students a
15-second rewind rather than costing 200 students their session.

---

## 7. Cost dimensioning

Per student-hour — §1's second number. Bands, not prices; re-price before committing.

| Component | Naive (all realtime) | With split path (§2.1) |
|---|---|---|
| TTS — teaching speech, ~45 min/hr | Charged per hour, every time, every student | **~0** — synthesised once per script node, ever |
| TTS — interruption answers, ~5 min/hr | Charged | Charged |
| ASR — student speech, ~10 min/hr | Charged | Charged |
| LLM — interruption handling | Charged | Charged |
| LLM — teaching | Charged per student | **~0** — generated once at publish |
| Bandwidth, storage, compute | Small | Small |

**The split path removes the two largest items, and it removes the two that scale with
*students* rather than with *courses*.** That is the distinction that decides the business:
after the split, the expensive work is per-course and amortises over every student who ever
takes it, while the per-student cost is bounded by how much the student actually talks.

Which yields the one runtime metric to instrument from day one: **spoken minutes per
student-hour on the interruption path.** It is the only meaningful driver of marginal cost,
and a curious student is a more expensive student — worth knowing early, because the naive
reaction (discourage interruption) destroys the product.

**Per course, one-off:** ingestion of a 300-page book is a structuring pass over ~150k words
plus generation of ~5,000 script nodes — order of single-to-low-double-digit dollars of
inference, plus the pre-synthesis batch. **Effectively free next to §2.6's instructor hour.**
Course production is gated by human review, not by compute, and should be planned and staffed
that way.

---

## 8. Data dimensioning

| Entity | Rate | 200 students × 1 hr/day, 1 year |
|---|---|---|
| `SessionTranscriptEvent` | ~40–100 rows/lesson-hour | ~5 M rows |
| Transcript text | ~10 KB/lesson-hour | ~0.5 GB |
| `AssessmentAttempt` | ~10–20/lesson-hour | ~1 M rows |
| `MasteryRecord` | 1 per student per concept, updated in place | ~50 K rows |
| Raw audio *(if retained — §2.4 says don't)* | **~15 MB/lesson-hour** | **~700 GB** |

Postgres is comfortable with all of it except the last row, which is 1,400× the size of
everything else combined and buys us nothing the transcript doesn't already give. That ratio
is the whole argument for §2.4.

Pre-synthesised teaching audio, by contrast, is bounded by *catalogue* size, not by usage:
~5,000 nodes per course at a few seconds each ≈ 1–2 GB per course, once, forever.

---

## 9. Build phases, re-cut

The spec's phases are right in order. Re-cut here by what each must *prove*, since a phase
that ships without proving its point has not finished.

| # | Phase | Must prove | Notes against spec |
|---|---|---|---|
| 0 | **Corridor test** (§10) | One lesson works end to end, badly | **Not in the spec. Do it first.** |
| 1 | Foundation — API, auth, tenancy, PDF ingestion, lesson graph, static viewer | A real book becomes a reviewable graph inside the §2.6 hour | Tenancy (§2.3) and stable concept identity (§3) land here or never |
| 2 | Voice MVP — split path, session engine, teach→listen→answer→resume | §1's first number, measured | Pre-synthesis (§2.1) is part of this phase, not an optimisation after it |
| 3 | Visuals & interactivity — playground, diagrams, canvas state in the pointer | A resume restores the *canvas*, not just the speech (§3) | Playground is load-bearing for phase 4 (§2.2) |
| 4 | Assessment & adaptation — checks, mastery, reteach/skip | Mastery estimates move on evidence, and adaptation doesn't destroy the §2.1 cache hit rate | |
| 5 | Scale & polish — DOCX/PPTX/video, cross-device resume, reporting, NFR hardening | The §4 budgets hold under the §2.5 load | |

---

## 10. The riskiest assumption, and the test that settles it

**Riskiest assumption:** that a generated script plus a resume pointer produces something a
student experiences as *being taught*, rather than as a synthesised voice reading at them with
a search box bolted on.

Nothing in this document proves that, and everything in it is wasted if it is false. It is
also cheap to test — and the test is not a prototype of the architecture, it is a prototype of
the *experience*:

> **The corridor test.** One 15-minute lesson. One hand-written script, no ingestion pipeline.
> Hard-coded resume pointer. A bought realtime voice API wired directly to it, no abstraction.
> Sit a real student in front of it and count: how many times did they interrupt, and how many
> of those did it handle well enough that they interrupted again?
>
> If they stop interrupting, the product is wrong and none of §§2–9 matters yet. **Build this
> before phase 1.**

Everything else in this document is recoverable. This is not.

---

## 11. What this does not dimension

Named so their absence is a decision rather than an oversight:

- **Billing and pricing** — §7 gives the cost floor, not the price
- **Live simulation authoring (FR-14)** — deliberately deferred behind the code playground (§2.2); simulations are a per-domain content investment and need a domain first
- **Mobile and desktop clients** — web first; §4.1's client-side VAD requirement is the part that will hurt to port, so it is worth knowing that now
- **K-12, and its compliance regime** — out of scope by §2.4
- **LMS integration (LTI, rostering, gradebook)** — explicitly a non-goal in spec §1.2, and the first thing an institutional buyer will ask for anyway. Expect to revisit; do not pre-build.
