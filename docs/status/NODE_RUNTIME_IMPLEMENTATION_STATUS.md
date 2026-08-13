# Node Runtime Implementation Status

Last updated: 2026-08-14

## Phase

Runtime Contract V2 and roadmap phases C0–C3, N1–N6, Short Video UI expansion,
and Marketing UI expansion.

## Status

DONE for every executable node and UI-only phase defined by the implementation
plan. Future Short Video and Marketing nodes intentionally remain design-only:
the product brief explicitly forbids adding their backend executors in this
milestone.

## Runtime and graph contract

- Workflow and node configs are versioned. Graph v1 nodes and their legacy
  handles/config keys migrate deterministically to graph/node v2.
- React Flow position and other editor metadata survive backend save/load
  normalization.
- Backend validation aggregates structured, actionable Problems for schema,
  node versions, missing executors, ports, types, cardinality, required inputs,
  planned nodes, and cycles.
- Typed `NodeValue`, target-port-keyed `NodeInputs`, `NodeExecutionResult`, and
  `ArtifactRef` flow through the scheduler, events, SQLite, Zustand, Preview,
  and the Artifacts dock.
- Run completion and cancellation are backend-owned; the frontend never infers
  terminal state from whichever node event happened to arrive first.
- Runtime concurrency is bounded by the configured semaphore and long-running
  network/media work is cancellation-aware.

## Runtime services

- Native Tauri file/folder dialog is wired into generic property rows.
- Runtime settings persist output directory, FFmpeg/FFprobe paths, and bounded
  concurrency. API keys are never written to settings JSON.
- Gemini credentials use the operating-system credential vault with an
  environment-variable fallback for development.
- Environment probes report backend, SQLite, storage, FFmpeg, FFprobe, and
  Gemini state with real details.
- Gemini requests live behind an `AiProvider` adapter with selected model,
  system instructions, temperature, timeout, cancellation, JSON response mode,
  basic required-field schema validation, and a structured error taxonomy.
- FFmpeg/FFprobe process ownership is centralized. The FFmpeg runner consumes
  machine-readable progress, kills the child on cancellation, and returns
  structured failures.
- Artifact destinations sanitize filenames and support deterministic rename,
  overwrite, and skip collision policies.

## Current nodes

- Text Input: canonical `content` config and `text` port.
- Text Transform: trim, uppercase, lowercase, and validated literal replace.
- Delay: bounded seconds, cancellation, and typed pass-through.
- Local File: native picker, canonical path, regular-file validation,
  canonical path, size, filename, and MIME hint.
- Media Info: centralized FFprobe plus normalized summary/video/audio/raw data,
  pass-through media, and frontend result views.
- Save Text / Save JSON: exact typed input, output directory, formatting,
  collision policy, artifact registration, and artifact output.
- Save Artifact: canonical copy executor with cancellation, collision policy,
  MIME/kind inference, registration, and artifact output.
- AI Script: canonical Gemini provider flow with typed text/JSON outputs.
- Media Merge: explicit `video` + optional `audio` inputs, replace/mix mapping,
  duration/resolution/FPS/codec/bitrate config, progress, cancellation, and
  typed video/artifact result.
- Preview: canonical capture executor; text/JSON/image/audio/video/path results
  render through the shared Preview UI using Tauri asset URLs.
- Markdown Note: persists as an annotation and never enters the runtime DAG.

## Expansion UI

- 19 Short Video and 15 Marketing nodes are searchable and grouped into Input,
  AI, Video, Audio, Captions, Marketing, and Output categories.
- Every expansion node has a compact schema, typed ports, `design-only`
  maturity, `planned` execution mode, and a visible “Later” marker.
- Planned nodes are saveable for design exploration but immediately produce a
  `PLANNED_NODE_UNAVAILABLE` Problem and cannot run. No fake executor exists.

## Tests

Baseline before Runtime Contract V2: frontend build passed; Rust 5 tests passed.

Current verification:

- `npm test` — PASS (contract, migration serialization, planned-node maturity,
  and media compatibility assertions).
- `npm run build` — PASS.
- `cargo check` — PASS.
- `cargo test` — PASS (graph migration/validation, contract parity, error
  payload, runtime settings, AI schema, FFmpeg progress, artifact collision,
  current node behavior, and v2 smoke fixtures).
- `cargo clippy --all-targets --all-features -- -D warnings` — PASS.
- Smoke fixtures cover Text → Transform → Preview, annotation-only safety, and
  explicit video/audio multi-port routing.

## Remaining product work

- Publishing integrations and executable Short Video/Marketing processors are
  deliberately deferred. They require provider credentials, platform review,
  upload resumability, and node-specific engines; the current milestone only
  authorizes their architecture/schema/UI.
- Full live-provider and real-media E2E tests remain environment-dependent.
  Deterministic request/argument/schema/parser tests cover the local contract.
