# DGBN Video Pipeline

Production engine for Diajem Global Black News (DGBN), with DSN support planned through the same manifest and rendering contracts.

## Phase 1 proof

The first milestone renders one verified production pack into:

- DGBN 16:9 bulletin
- DGBN 9:16 news flash
- DGBN 9:16 animated news card
- presenter/B-roll composition slots
- a stable interface for an open-source avatar service

## Core stack

- **Remotion** — final compositor, timeline, captions, presenter/B-roll sequencing and renders.
- **Hyperframes** — motion graphics, animated cards, web/product-to-video and specialist visual sequences.
- **FFmpeg** — media normalization, audio extraction, resizing and packaging.
- **Whisper-compatible transcription** — captions and long-video-to-short workflows.
- **Avatar service** — pluggable open-source lip-sync/body-motion backend. The first benchmark target will be selected after testing Peet/Aisha/Denise assets.

## Repository layout

```text
jobs/                     Machine-readable production jobs
schemas/                  Production-manifest contract
docs/                     Architecture and implementation notes
presenters/               Presenter asset conventions (no heavy media committed)
video-studio/remotion/    Master video compositor
video-studio/hyperframes/ Motion-graphics workspace
avatar-service/           Adapter boundary for lip-sync/avatar engines
scripts/                  Validation and pipeline utilities
```

## Local prerequisites

- Node.js 22+
- npm
- FFmpeg
- Python environment appropriate for the selected avatar engine
- GPU recommended for avatar generation

## First commands

```bash
npm install
npm run validate:manifest
npm run remotion:studio
npm run render:bulletin
npm run render:flash
npm run render:card
```

Hyperframes skills and environment:

```bash
npm run hyperframes:skills
npm run hyperframes:doctor
```

## Editorial principle

The renderer does **not** decide whether a story is true. It accepts a production manifest that already contains verification state, sources, risk flags and approval policy. Sensitive or insufficiently verified jobs must remain draft-only.
