# Node Runtime Implementation Status

Last updated: 2026-08-14

## Phase

Runtime Contract V2 — Phase 0 baseline plus Phase 1 (plan phases C0–C2).

## Status

DONE for the requested Runtime Contract V2 scope. Node-by-node reconciliation,
runtime services, rich media previews, and Short Video/Marketing backends are
not part of this phase.

## Contract changes

- Workflow JSON is normalized to `schemaVersion: 2` on save, load, and run.
- Edges preserve `sourceHandle` and `targetHandle` through React Flow, JSON,
  Rust deserialization, graph compilation, and scheduler input resolution.
- Legacy graphs without handles migrate only when a node side has exactly one
  declared compatible port. Ambiguous migrations fail explicitly; port order,
  map order, and upstream UUIDs are never used as input names.
- Executors receive typed `NodeInputs` keyed by target port and return
  `NodeExecutionResult` containing typed `NodeValue` outputs, `ArtifactRef`s,
  metadata, and warnings.
- Registry definitions now include node version and execution mode. Markdown
  Note (`annotation`) and Preview (`viewer`) remain persisted in the canvas but
  are excluded from the executable DAG.
- Backend emits `run-started`, `node-started`, `node-progress`, `node-result`,
  `node-failed`, `node-skipped`, terminal run events, and the consolidated
  authoritative `run-status` event.
- Frontend no longer infers run completion from the set of nodes seen so far.
  It filters events by run ID, stores real results, and renders them in Output
  and Preview surfaces.
- SQLite now stores serialized node results and queryable artifact references.

## Files changed

- Rust runtime: `src-tauri/src/workflow/{model,graph,executor,artifact}.rs`, node
  executors, registry wiring, Tauri commands, errors, and database migrations.
- Frontend contract/consumer: `src/nodes/{registry,runtimeContract}.ts`,
  `src/store/workflowStore.ts`, `src/hooks/useWorkflowController.ts`, and the
  generic Output/Preview components.
- Shared verification: `contracts/node-runtime-contract.json` and
  `tests/fixtures/workflow-v1/single-port.json`.

## Tests

Baseline before edits:

- `npm run build` — PASS.
- `cargo check` — PASS.
- `cargo test` — PASS (5 tests).

Runtime Contract V2 verification:

- `npm run build` — PASS.
- `cargo check` — PASS.
- `cargo test` — PASS (11 tests after migration/contract additions).
- Shared registry fixture is asserted by Rust tests and by the frontend module
  when the application initializes.

## Remaining gaps

- Backend validation still returns command errors rather than the planned
  structured Problems DTO.
- Per-executor invalid-config/failure/cancellation coverage is incomplete and
  belongs to the node reconciliation phases.
- Config aliases preserve existing graphs (`text`/`content`,
  `duration`/`seconds`, `file_path`/`path`, AI snake/camel case), but full config
  normalization and node-version migrations remain Phase 2+ work.
- Preview can show typed text/JSON/path/artifact data, but native media URL
  conversion and players remain later runtime-service work.
- No Short Video or Marketing backend was added.

## Discrepancy notes

Earlier MVP1 status documents described prototype/UI milestones as complete.
Those remain valid historical milestones, but they are not evidence that the
production runtime contract or every node backend is complete. Runtime Contract
V2 is the active architecture milestone.
