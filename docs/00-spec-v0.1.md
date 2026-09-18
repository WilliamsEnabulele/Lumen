# AI Conversational Tutor Platform — Technical Specification

**Version:** 0.1 (Draft)
**Purpose of this document:** A build-ready specification intended for an engineering team or an AI coding agent to implement the platform described. It expands the original architecture sketch into functional requirements, component responsibilities, data model, APIs, and non-functional requirements.

> This document is the **source specification**, kept as received. It is not edited in place
> as decisions are made. Where a decision has been taken against an open question or a
> requirement has been sized, it is recorded in [`01-dimensioning.md`](01-dimensioning.md),
> which takes precedence where the two disagree.

---

## 1. Product Overview

An AI-powered conversational learning platform that ingests course materials in multiple formats (PDF, DOCX, PPTX, video, raw text) and transforms them into structured, interactive courses delivered by a realtime voice tutor.

**Primary differentiator:** interactive, voice-first teaching — not document chat, and not a static video course. The tutor behaves like a live instructor: it can be interrupted, it reacts, it shows things, it checks understanding, and it resumes correctly.

### 1.1 Core Capabilities
The tutor must be able to:
- Speak naturally with the student (low-latency, natural-sounding TTS)
- Be interrupted mid-sentence and stop audio immediately (barge-in)
- Understand the student's question in the context of the current lesson
- Answer using the current lesson content and broader course materials (grounded, not hallucinated)
- Display diagrams, tables, equations, examples, and animations synchronized to speech
- Run simulations and code playgrounds live during the lesson
- Ask questions and assess understanding (formative checks, not just final quizzes)
- Resume teaching from the correct point in the lesson after a detour or interruption
- Adapt explanations and pacing based on the student's demonstrated performance

### 1.2 Explicit Non-Goals (for this version)
- Not a general-purpose chatbot / open-domain Q&A tool
- Not a video-lecture platform (no passive playback as the primary mode)
- Not a full LMS replacement (grading/rostering/compliance are out of scope unless stated otherwise)

---

## 2. System Architecture

```text
                    ┌────────────────────────┐
                    │       Student App      │
                    │ Web / Mobile / Desktop │
                    └────────────┬───────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
        Realtime Voice                       Application API
        WebRTC / WebSocket                   HTTPS / SignalR
                │                                 │
                └────────────────┬────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      ASP.NET Core       │
                    │    Application Layer    │
                    └────────────┬────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
┌──────▼─────────┐      ┌────────▼─────────┐      ┌────────▼─────────┐
│ Tutor Session  │      │ Course Processing │      │ Learning Engine  │
│ Engine         │      │ Orchestrator      │      │                  │
└──────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
       │                         │                         │
┌──────▼─────────┐      ┌────────▼─────────┐      ┌────────▼─────────┐
│ Realtime Voice │      │ Document AI      │      │ Progress and     │
│ Provider       │      │ Services         │      │ Assessment       │
└────────────────┘      └────────┬─────────┘      └──────────────────┘
                                 │
                 ┌───────────────┼────────────────┐
                 │               │                │
          ┌──────▼─────┐ ┌───────▼──────┐ ┌───────▼────────┐
          │ PostgreSQL │ │ Object       │ │ Search /       │
          │            │ │ Storage      │ │ Knowledge Index│
          └────────────┘ └──────────────┘ └────────────────┘
```

### 2.1 Component Responsibilities

**Student App (Web / Mobile / Desktop)**
- Renders the lesson canvas (diagrams, code playgrounds, simulations)
- Captures microphone input, plays back tutor audio
- Handles barge-in UX (mic activity indicator, instant audio stop)
- Displays lesson progress, transcript, and session controls

**Application API (ASP.NET Core)**
- AuthN/AuthZ, course/session CRUD, billing hooks
- Routes realtime traffic (WebRTC/WebSocket signaling) to the Tutor Session Engine
- Exposes REST/GraphQL endpoints for non-realtime operations (course upload, progress queries)

**Tutor Session Engine**
- Owns the live session state machine (see Section 4)
- Mediates between the Realtime Voice Provider, the Learning Engine, and the lesson script
- Decides when to interrupt/resume, when to trigger a visual, when to ask a check-for-understanding question
- Maintains a "resume pointer" into the lesson graph so teaching can continue correctly after any detour

**Realtime Voice Provider**
- ASR (speech-to-text) with low-latency partial transcripts (for interruption detection)
- TTS with streaming synthesis and immediate cancellation support
- VAD (voice activity detection) for barge-in

**Course Processing Orchestrator**
- Coordinates ingestion pipeline: upload → parse → chunk → structure → generate lesson graph
- Tracks processing job status per course/document

**Document AI Services**
- Format-specific extraction (PDF, DOCX, PPTX, video transcript extraction, raw text)
- Structuring: converts raw extracted content into a hierarchical lesson graph (modules → lessons → concepts → assessment items)
- Asset generation: diagrams, equations, example problems, simulation/code-playground scaffolds

**Learning Engine**
- Student model: mastery estimates per concept, misconceptions observed, pacing preference
- Assessment generation and scoring (in-lesson checks + end-of-lesson quizzes)
- Adaptive logic: decides what to reteach, skip, or go deeper on

**Progress and Assessment**
- Persists attempt history, scores, time-on-task, mastery over time
- Feeds the Learning Engine's adaptive decisions and produces student/instructor-facing reports

**Storage Layer**
- PostgreSQL: relational data (users, courses, sessions, progress, assessment results)
- Object Storage: raw uploaded files, generated media assets (images, audio cache, video)
- Search / Knowledge Index: vector + keyword index over course content for grounded retrieval during Q&A

---

## 3. Functional Requirements

### 3.1 Course Ingestion
| ID | Requirement |
|----|-------------|
| FR-1 | System accepts PDF, DOCX, PPTX, plain text, and video (with transcript extraction) as source material. |
| FR-2 | System extracts structure (headings, sections, slides, timestamps) and content (text, images, tables, equations, code) from source material. |
| FR-3 | System generates a hierarchical lesson graph: Course → Module → Lesson → Concept → Assessment Item, with explicit prerequisite edges between concepts. |
| FR-4 | System generates a teaching script per lesson: what the tutor says, when it shows which visual, and where check-for-understanding prompts are inserted. |
| FR-5 | Content authors/instructors can review and edit the generated lesson graph and script before publishing. |
| FR-6 | Reprocessing a changed source document updates the lesson graph without discarding student progress tied to unaffected concepts. |

### 3.2 Realtime Voice Tutoring
| ID | Requirement |
|----|-------------|
| FR-7 | Tutor speaks lesson content via streaming TTS with natural prosody. |
| FR-8 | Student can interrupt at any point; tutor audio stops within a target latency (see NFR-1). |
| FR-9 | Tutor interprets the interruption as a question, a request to repeat/slow down, or a topic change, and responds appropriately. |
| FR-10 | Tutor answers questions using the current lesson content first, then broader course materials, and is explicit when something is outside course scope. |
| FR-11 | After handling an interruption, tutor resumes teaching from the correct point — not from the beginning of the lesson or a wrong point. |
| FR-12 | Tutor can proactively pause to ask a comprehension check and adapt the next step based on the answer. |

### 3.3 Visual & Interactive Content
| ID | Requirement |
|----|-------------|
| FR-13 | Tutor can display diagrams, tables, equations, and worked examples synchronized with speech. |
| FR-14 | Tutor can launch and narrate a live simulation relevant to the concept being taught. |
| FR-15 | Tutor can open a code playground, write/explain code, run it, and interpret output aloud. |
| FR-16 | All visuals are keyed to specific points in the lesson script and can be re-triggered if the student asks to see something again. |

### 3.4 Assessment & Adaptation
| ID | Requirement |
|----|-------------|
| FR-17 | System runs in-lesson comprehension checks (not just end-of-module quizzes). |
| FR-18 | System scores responses (multiple choice, short answer, code correctness) and updates a per-concept mastery estimate. |
| FR-19 | System adapts: reteaches a concept with a different explanation strategy on failure, skips ahead on demonstrated mastery, adjusts pacing. |
| FR-20 | Instructors/admins can view student and cohort progress reports. |

### 3.5 Session Continuity
| ID | Requirement |
|----|-------------|
| FR-21 | A session can be paused and resumed later (different device, different day) from the exact point of departure. |
| FR-22 | Session transcript and any generated artifacts (answers, code run, notes) are persisted and viewable after the session ends. |

---

## 4. Tutor Session State Machine (high-level)

```text
IDLE → LOADING_LESSON → TEACHING
TEACHING ⇄ LISTENING (barge-in detected)
LISTENING → ANSWERING → TEACHING (resume pointer restored)
TEACHING → CHECKING_UNDERSTANDING → (ADAPTING) → TEACHING
TEACHING → LESSON_COMPLETE → (next lesson) LOADING_LESSON
Any state → PAUSED → (resume) restores exact state + resume pointer
```

Key design requirement: the **resume pointer** must be a first-class, persisted object (lesson ID + script node ID + any partial-utterance offset), not inferred from conversation history, so resumption is reliable across interruptions, pauses, and even device changes.

---

## 5. Data Model (core entities)

- **User** (student, instructor, admin roles)
- **Course** → **Module** → **Lesson** → **Concept** (with prerequisite edges) → **AssessmentItem**
- **SourceDocument** (raw upload, processing status, linked to generated Lessons)
- **LessonScript** (ordered script nodes: speech segment, visual trigger, check-for-understanding, simulation/code trigger)
- **Session** (student, course, current resume pointer, status, start/end timestamps)
- **SessionTranscriptEvent** (turn-by-turn: speaker, text/audio ref, timestamp, linked script node)
- **MasteryRecord** (student, concept, mastery score, last updated, evidence trail)
- **AssessmentAttempt** (student, assessment item, response, score, timestamp)

---

## 6. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Barge-in audio stop latency: target < 300ms from VAD detection to audio silence. |
| NFR-2 | End-to-end response latency for a simple interruption (stop → understand → begin responding): target < 1.5s. |
| NFR-3 | System supports concurrent realtime sessions scaling horizontally (target initial scale to be defined with the business). |
| NFR-4 | All student data and session recordings/transcripts are encrypted at rest and in transit. |
| NFR-5 | Course processing pipeline is idempotent and resumable on failure (no silent data loss on a crashed ingestion job). |
| NFR-6 | Generated teaching content is traceable back to source material (for accuracy review and takedown/correction). |
| NFR-7 | System degrades gracefully if the Realtime Voice Provider is unavailable (e.g. falls back to text-based tutoring). |

---

## 7. Open Questions / Decisions Needed

1. Which realtime voice provider(s) — build vs. buy (e.g. managed ASR/TTS APIs vs. self-hosted)?
2. Target initial content domains (STEM/code-heavy vs. general) — affects simulation/code-playground investment.
3. Multi-tenant vs. single-tenant deployment model for institutional customers?
4. Data retention policy for session recordings/transcripts, especially for minors if K-12 is in scope.
5. Initial concurrency/scale target to size infrastructure (Section NFR-3).
6. Instructor authoring workflow: how much manual review/edit is required before a generated course is published?

---

## 8. Suggested Build Phases

1. **Foundation:** Application API, auth, course upload + basic Document AI extraction (text/PDF only), static lesson viewer (no voice).
2. **Voice MVP:** Realtime Voice Provider integration, basic Tutor Session Engine (teach → listen → answer → resume), no adaptive logic yet.
3. **Visuals & Interactivity:** Diagram/equation rendering, code playground, simulation triggers synced to script.
4. **Assessment & Adaptation:** In-lesson checks, mastery model, adaptive reteach/skip logic.
5. **Scale & Polish:** Multi-format ingestion (DOCX/PPTX/video), session pause/resume across devices, instructor reporting, performance hardening against NFRs.
