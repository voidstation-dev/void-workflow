# VOID WORKFLOW — NODE IMPLEMENTATION & EXPANSION PLAN

> **Repository audited:** `voidstation-dev/void-workflow`
> **Audit snapshot:** `main` at commit `87cf3c19003db20fa7176f5c4c0f3459953c3281` (`Redesign workflow workspace UI`)
> **Audit date:** 2026-08-14 (Asia/Ho_Chi_Minh)
> **Scope of this document:** Deep implementation plan for every node that already exists in the repository, covering UI/UX + backend/runtime. Future short-video and marketing nodes are researched and specified as **UI-only roadmap**; they must not enter the executable backend until the core runtime contract is fixed.

---

## 1. Executive decision

The repository already has a strong frontend workspace foundation: React Flow, a single node registry, Zustand state, a generic node detail panel, typed-looking ports, run status UI, Tauri commands, a Rust DAG scheduler, SQLite run history, FFmpeg/FFprobe integration, cancellation, and a basic Gemini node.

However, the current implementation is **not ready to safely scale into many video/marketing nodes** because the frontend and backend disagree on several node contracts, and the Rust graph model discards React Flow handle IDs.

The recommended order is therefore:

1. **Freeze new executable node expansion.**
2. **Repair the workflow contract first**: graph versioning, port routing, typed values, validation, node results, run-level events.
3. **Reconcile every existing node UI field with its Rust executor.**
4. **Add shared runtime services**: file dialog, secrets, provider/tool health, artifact collision policy, FFmpeg progress.
5. **Finish all current nodes end-to-end.**
6. Only then start implementing the future short-video/marketing node backlog. Until then, those future nodes can exist as design/UX prototypes only.

This is the safest path to keep the codebase modular, maintainable, and compatible with future high-volume media workflows.

---

# 2. Repository architecture audit

## 2.1 Current frontend stack

- React 19
- TypeScript
- Vite
- `@xyflow/react` / React Flow
- Zustand
- Zod
- Radix UI primitives
- Tailwind CSS
- Tauri v2 JS API

Key frontend files:

```text
src/
├─ nodes/
│  ├─ registry.ts
│  ├─ nodeTypes.ts
│  └─ portCompat.ts
├─ components/
│  ├─ nodes/
│  │  ├─ BaseNode.tsx
│  │  └─ PortHandle.tsx
│  ├─ canvas/
│  │  ├─ WorkflowCanvas.tsx
│  │  ├─ NodeDetailPanel.tsx
│  │  ├─ NodeDetailBody.tsx
│  │  └─ PreviewViewer.tsx
│  ├─ shell/
│  │  ├─ NodeLibrary.tsx
│  │  ├─ Inspector.tsx
│  │  └─ BottomDock.tsx
│  └─ screens/
│     ├─ SettingsScreen.tsx
│     └─ EnvironmentScreen.tsx
├─ hooks/
│  └─ useWorkflowController.ts
└─ store/
   └─ workflowStore.ts
```

The frontend architecture is already moving in the correct direction:

- one central registry for node definitions;
- one generic card architecture;
- one generic detail panel;
- capability-gated tabs;
- configuration fields driven by `configSchema`;
- a unified Zustand store;
- a single controller as the imperative Tauri IPC boundary;
- no fake run results shown when the backend does not provide data.

**Keep these principles. Do not create one React component/panel architecture per node unless the node truly requires a specialized visual editor.**

---

## 2.2 Current backend stack

- Tauri v2
- Rust
- Tokio
- `async-trait`
- `reqwest`
- `rusqlite`
- `serde` / `serde_json`
- FFmpeg / FFprobe as local processes
- `CancellationToken`

Key backend files:

```text
src-tauri/src/
├─ lib.rs
├─ db/
│  └─ mod.rs
└─ workflow/
   ├─ mod.rs
   ├─ model.rs
   ├─ graph.rs
   ├─ executor.rs
   ├─ artifact.rs
   └─ nodes/
      ├─ text_input.rs
      ├─ text_transform.rs
      ├─ delay.rs
      ├─ ai_script.rs
      ├─ file_input.rs
      ├─ media_info.rs
      ├─ media_merge.rs
      ├─ save_text.rs
      └─ save_json.rs
```

The scheduler already provides valuable foundations:

- DAG validation with cycle detection;
- parallel execution for independent zero-in-degree branches;
- per-node state;
- cancellation token;
- downstream skip cascade after failure;
- run and node execution rows in SQLite;
- Tauri event emission;
- an artifact run directory.

These should be evolved, not replaced.

---

# 3. Existing node inventory and real implementation status

There are **12 nodes in the frontend registry**.

| Node | Frontend registry | Rust executor | Current real status |
|---|---:|---:|---|
| Text Input | Yes | Yes | Contract mismatch |
| Text Transform | Yes | Yes | Partially implemented |
| Delay | Yes | Yes | Unit/key mismatch |
| AI Script | Yes | Yes | Major frontend/backend drift |
| Local File Input | Yes | Yes | Key mismatch + missing picker |
| Media Info | Yes | Yes | Backend works, result bridge missing |
| Save Text | Yes | Yes | Partial config support |
| Save JSON | Yes | Yes | Partial config support |
| Media Merge | Yes | Yes | Semantics do not match UI |
| Save Artifact | Yes | No | Frontend-only |
| Preview | Yes | No | Frontend-only |
| Markdown Note | Yes | No | Non-executable in UI, but currently dangerous at runtime |

---

# 4. Critical blockers discovered in the current code

## 4.1 Frontend configuration keys do not match Rust keys

### Text Input

Frontend:

```ts
data.content
```

Rust:

```rust
node.data.extra.get("text")
```

Result: a correctly configured Text Input can execute as empty text.

### Delay

Frontend:

```ts
seconds
```

Rust:

```rust
duration // u64 milliseconds
```

Frontend semantics are seconds; backend semantics are milliseconds.

### Local File Input

Frontend:

```ts
path
```

Rust:

```rust
file_path
```

Result: a file selected/configured in the UI is not the field the executor expects.

### AI Script

Frontend uses:

```text
provider
model
prompt
systemInstructions
outputFormat
temperature
timeout
schema
```

Backend reads:

```text
system_prompt
user_prompt
```

and ignores most of the frontend configuration.

**Decision:** Use one canonical persisted naming convention. Since the current frontend registry and saved graphs are camelCase, use camelCase as the graph contract and deserialize into typed Rust config structs with `serde(rename_all = "camelCase")`. During migration, add aliases for legacy snake_case keys where required.

---

## 4.2 Rust edges discard port/handle routing

React Flow edges can contain:

```ts
{
  source,
  sourceHandle,
  target,
  targetHandle
}
```

But Rust currently deserializes only:

```rust
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
}
```

Then the scheduler builds a node's inputs as:

```text
input key = upstream node ID
input value = entire upstream output
```

This makes a graph with multiple input ports fundamentally ambiguous.

### Why this must be fixed now

Future video nodes need explicit inputs such as:

```text
Video
Audio
Overlay
Subtitle
Mask
Background
Metadata
```

It is unsafe to infer those from:

- connection order;
- upstream node type;
- upstream node ID;
- first available input.

### Target Edge V2

```ts
type WorkflowEdgeV2 = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};
```

Rust:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub source_handle: String,
    pub target: String,
    pub target_handle: String,
}
```

Legacy edges with missing handles should be normalized during graph migration if a node side has exactly one compatible port.

---

## 4.3 Runtime outputs are not bridged back to the frontend

The backend currently emits status events but does not emit each executor's returned value.

Consequences:

- Media Info has real FFprobe output, but the frontend cannot populate Summary / Video / Audio / Raw.
- Preview cannot display a real result.
- Output tabs cannot show text/JSON.
- Artifact list cannot reliably display generated media.
- Node-by-node debugging is weak.
- The frontend has to infer run completion from node status events.

### Required event model

```ts
type RunEvent =
  | {
      type: "run-status";
      runId: number;
      status: "starting" | "running" | "completed" | "failed" | "cancelled";
      message?: string;
    }
  | {
      type: "node-status";
      runId: number;
      nodeId: string;
      status: "queued" | "running" | "success" | "failed" | "skipped" | "cancelled";
      progress?: number;
      message?: string;
    }
  | {
      type: "node-result";
      runId: number;
      nodeId: string;
      outputs: Record<string, NodeValue>;
      artifacts: ArtifactRef[];
      durationMs: number;
    }
  | {
      type: "workflow-log";
      runId: number;
      nodeId?: string;
      level: "debug" | "info" | "warn" | "error";
      message: string;
    };
```

Frontend should stop guessing that a run is complete. The backend owns the run lifecycle and must emit the final run state.

---

## 4.4 The current generic `serde_json::Value` contract is too loose

Current executor signature:

```rust
execute(
    node,
    inputs: &HashMap<String, serde_json::Value>,
    ...
) -> Result<serde_json::Value>
```

Target:

```rust
pub struct NodeExecutionContext {
    pub run_id: i64,
    pub node_id: String,
    pub inputs: NodeInputs,
    pub cancel: CancellationToken,
    pub artifacts: ArtifactManager,
    pub services: RuntimeServices,
}

pub struct NodeExecutionResult {
    pub outputs: HashMap<String, NodeValue>,
    pub artifacts: Vec<ArtifactRef>,
    pub logs: Vec<NodeLog>,
}
```

Suggested value envelope:

```rust
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum NodeValue {
    Text(String),
    Number(f64),
    Boolean(bool),
    Json(serde_json::Value),
    File(FileRef),
    Media(MediaRef),
    Audio(MediaRef),
    Video(MediaRef),
    Artifact(ArtifactRef),
}
```

Do not pass binary media through JSON. Pass stable file/artifact references and metadata.

---

## 4.5 `Markdown Note` can currently fail a run

Frontend marks:

```text
executable = false
registryState = frontend-only
```

The controller correctly does not block a run because it is a note.

But the note remains in the graph JSON sent to Rust. The Rust scheduler does not know that it is an annotation node. It has no executor, so a zero-dependency Markdown Note can reach:

```text
No executor for markdownNote
```

and fail the workflow.

### Fix

Add execution behavior to node metadata:

```ts
executionMode: "execute" | "annotation"
```

The backend graph compiler must exclude annotation nodes from the executable DAG.

Do not add a fake Markdown executor simply to hide this modeling issue.

---

# 5. Target node contract

## 5.1 Version every saved graph

```json
{
  "schemaVersion": 2,
  "nodes": [],
  "edges": []
}
```

Provide:

```rust
migrate_graph_v1_to_v2(...)
validate_graph_v2(...)
compile_executable_graph(...)
```

Never rely on ad-hoc compatibility forever.

---

## 5.2 Node specification should describe behavior, not just visuals

Target shared conceptual schema:

```ts
interface NodeSpec {
  type: string;
  version: number;
  label: string;
  category: NodeCategory;
  executionMode: "execute" | "annotation";

  ports: {
    in: PortSpec[];
    out: PortSpec[];
  };

  config: ConfigFieldSpec[];
  capabilities: {
    preview: boolean;
    cancellable: boolean;
    producesArtifacts: boolean;
    network: boolean;
  };
}
```

Eventually, avoid independently maintaining an increasingly complex frontend registry and backend registry with manual synchronization.

Recommended implementation options:

### Preferred

Maintain a versioned `node-specs/*.json` schema validated at build/test time, and load/generate definitions for both sides.

### Acceptable intermediate step

Keep `registry.ts` + Rust registry, but add an automated parity test that fails CI when:

- node types differ;
- port IDs differ;
- config field names differ;
- executor presence differs from `executionMode`.

---

# 6. Backend module boundaries

Avoid making every node talk directly to OS/process/network code.

Target structure:

```text
workflow/
├─ contract/
│  ├─ graph.rs
│  ├─ value.rs
│  ├─ node_spec.rs
│  └─ migration.rs
├─ runtime/
│  ├─ scheduler.rs
│  ├─ validator.rs
│  ├─ events.rs
│  ├─ context.rs
│  └─ registry.rs
├─ services/
│  ├─ artifacts.rs
│  ├─ ffmpeg.rs
│  ├─ ffprobe.rs
│  ├─ secrets.rs
│  ├─ providers/
│  │  └─ gemini.rs
│  └─ health.rs
└─ nodes/
   ├─ text_input.rs
   ├─ text_transform.rs
   ├─ delay.rs
   ├─ ai_script.rs
   ├─ file_input.rs
   ├─ media_info.rs
   ├─ media_merge.rs
   ├─ save_text.rs
   ├─ save_json.rs
   ├─ save_artifact.rs
   └─ preview.rs
```

A node should primarily contain:

1. typed config parsing;
2. input validation;
3. call to a shared service;
4. construction of typed output.

---

# 7. Shared runtime services that should land before node expansion

## 7.1 File dialog service

Add Tauri v2 dialog plugin.

Use it for:

- file input;
- output directory;
- custom FFmpeg executable location if supported;
- future media/image/audio input nodes.

UX rule:

- clicking **Choose file** opens the native picker;
- selected path appears immediately;
- drag-and-drop should be a second path to the same state mutation;
- do not maintain separate "browse selected path" state.

---

## 7.2 Secret storage

Do not make the AI node depend permanently on `GEMINI_API_KEY` environment variables.

Add provider connections under Settings:

```text
Connections
└─ Google Gemini
   ├─ API key               [••••••••••] [Replace]
   ├─ Test connection
   └─ Status: Connected
```

Store secrets using Tauri Stronghold or another OS-backed/encrypted secret mechanism. Never:

- persist API keys in workflow JSON;
- include them in logs;
- put them in node data;
- return them to preview panels.

The AI node stores a connection identifier, not the secret itself.

---

## 7.3 Tool discovery and health

Add backend command:

```text
get_runtime_health
```

Result:

```json
{
  "ffmpeg": {
    "status": "ready",
    "path": "...",
    "version": "..."
  },
  "ffprobe": {
    "status": "ready",
    "path": "...",
    "version": "..."
  },
  "gemini": {
    "status": "configured"
  },
  "storage": {
    "status": "ready",
    "freeBytes": 123
  }
}
```

Environment screen should display real probes rather than placeholders.

---

## 7.4 FFmpeg process wrapper

Create one service instead of spawning `Command::new("ffmpeg")` independently in many nodes.

Responsibilities:

- executable path resolution;
- sanitized argument construction;
- `-progress pipe:1`;
- parsing progress;
- cancellation / child kill;
- stderr capture;
- error classification;
- optional hardware encoder discovery;
- consistent output file behavior.

API concept:

```rust
ffmpeg.run(FfmpegJob {
    args,
    duration_hint,
    output,
    cancel_token,
    on_progress,
}).await
```

---

## 7.5 Artifact service

Expand `ArtifactManager`.

Target `ArtifactRef`:

```ts
type ArtifactRef = {
  id: string;
  runId: number;
  nodeId: string;
  kind: "text" | "json" | "image" | "audio" | "video" | "file";
  path: string;
  filename: string;
  mime?: string;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
};
```

Add collision policy:

```text
rename
overwrite
skip
error
```

Security:

- reject output filenames with path separators;
- canonicalize custom output directories;
- never silently write outside the user-selected directory;
- avoid accidental overwrite without explicit policy.

---

# 8. Database changes

Existing tables are useful, but node outputs/artifacts are missing.

Add:

```sql
CREATE TABLE run_artifacts (
  id TEXT PRIMARY KEY,
  run_id INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE node_results (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  outputs_json TEXT NOT NULL,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Do not store large binary payloads in SQLite.

Optional later:

```text
run_attempts
node_execution_attempts
```

for retry history.

---

# 9. UI/UX design rules for every node

The current generic node architecture is good. The improvement should be about **less noise**, not more components.

## 9.1 Node card

Target size:

```text
240–280 px wide
```

Card anatomy:

```text
┌────────────────────────────┐
│ ✦ AI Script          ✓     │
│ Gemini 2.5 Flash            │
│ Text → Text                 │
└────────────────────────────┘
```

Rules:

- title;
- one status icon;
- one short semantic line;
- maximum 2 metadata chips;
- input/output ports;
- no long form fields inside the card;
- no full file paths;
- no verbose technical errors on the card.

A node should be readable in under one second.

---

## 9.2 Inspector

Use progressive disclosure.

### Basic

Only fields required for the common task.

### Advanced

Rare options:

- timeout;
- codecs;
- bitrate;
- JSON schema;
- custom output path;
- provider-specific tuning.

### Dynamic fields

Hide fields when irrelevant.

Example:

```text
Text Transform
Operation: Replace

Find           [...]
Replace with   [...]
```

If Operation = Trim:

```text
Operation: Trim
```

Do not leave irrelevant Find/Replace inputs visible.

---

## 9.3 Status behavior

Node states:

```text
Idle
Queued
Running
Success
Warning
Failed
Skipped
Cancelled
```

While running:

- disable configuration fields for that node;
- show compact progress when available;
- keep canvas interactions responsive;
- Stop cancels the full run;
- future "Cancel node" should be introduced only if scheduler semantics support it.

---

## 9.4 Error UX

Card:

```text
Failed
```

Inspector Run tab:

```text
File not found
C:\...\input.mp4

[Choose another file]
```

Console:

technical details.

Never dump full FFmpeg stderr into the card.

---

## 9.5 Output UX

After success:

```text
Output
────────────────
Video
00:34.2 · 1080×1920
H.264 · AAC
[Preview] [Reveal]
```

Text:

```text
Output
────────────────
“First 200 characters…”
[Copy] [Open full result]
```

JSON:

- collapsed tree preview;
- copy JSON;
- open full.

---

# 10. Existing Node 1 — Text Input

## Role

A deterministic text source node.

### Target ports

```text
IN:  none
OUT:
  text: text
```

Use port ID `text`, not generic `out`, for new graphs. Provide migration alias from legacy `out`.

## Target Basic UI

```text
Text Input

Content
┌────────────────────────────┐
│ Type or paste text…        │
│                            │
└────────────────────────────┘

Characters 1,284
```

No Advanced section is necessary.

Optional quality-of-life:

- paste from clipboard;
- clear;
- character count.

Do not put "model", encoding, or technical options here.

## Backend contract

```rust
struct TextInputConfig {
    content: String,
}
```

Executor:

```text
read config.content
→ NodeValue::Text(content)
→ output port "text"
```

No IO.
No network.
Cancellation is effectively irrelevant because execution is immediate.

## Validation

- empty string is valid;
- max size can be soft-limited for UI performance, not arbitrarily rejected;
- if a later AI provider has token limits, that validation belongs to AI Script, not Text Input.

## Current bug to fix

Frontend uses `content`, Rust uses `text`.

## Acceptance

1. Type text.
2. Save.
3. Reload.
4. Run.
5. Output equals exact text including newlines.
6. Downstream node receives it through port `text`.

---

# 11. Existing Node 2 — Text Transform

## Role

Fast deterministic local text manipulation.

### Target ports

```text
IN:
  text: text (required)
OUT:
  text: text
```

## Target Basic UI

```text
Operation
[ Trim whitespace ▾ ]
```

Operations:

```text
Trim
Uppercase
Lowercase
Replace
```

When Replace:

```text
Find           [...]
Replace with   [...]
[ ] Replace all
[ ] Case sensitive
```

For MVP, if only one replacement mode is desired, keep just Find + Replace with and document that it replaces all literal occurrences.

## Backend

Typed config:

```rust
enum TextTransformOperation {
    Trim,
    Uppercase,
    Lowercase,
    Replace,
}

struct TextTransformConfig {
    operation: TextTransformOperation,
    find: Option<String>,
    replace: Option<String>,
}
```

Never concatenate arbitrary upstream node outputs.

Read specifically:

```text
inputs["text"]
```

Return:

```text
outputs["text"]
```

## Behavior

- trim → Unicode-safe string trim;
- uppercase/lowercase → Rust Unicode case conversion;
- replace → literal replace initially;
- regex should be a future separate mode, not silently inferred.

## Validation

If Replace:

```text
find must not be empty
```

or define empty-find behavior explicitly. Prefer validation error.

## Current gaps

Rust supports uppercase/lowercase only.
`trim` and `replace` currently behave as pass-through.

## Acceptance

Unit fixtures for all operations, Unicode, multiline, empty content.

---

# 12. Existing Node 3 — Delay

## Role

Workflow timing / pacing utility.

### Target ports

A Delay node should not be text-only.

Preferred:

```text
IN:
  value: any
OUT:
  value: any
```

It is a pass-through control node.

## Target UI

```text
Delay

Duration
[ 1.0 ] seconds
```

Advanced:

```text
Maximum 24 hours
```

No more controls.

## Canonical persisted field

```ts
durationMs: 1000
```

or:

```ts
seconds: 1.0
```

Choose one.

**Recommendation:** Persist `durationMs` because backend scheduling is millisecond-based and exact, but show a seconds UI.

If preserving current graph compatibility is more important, keep `seconds` as canonical and convert in Rust.

Recommended migration-friendly choice:

```text
graph config: seconds
runtime conversion: Duration::from_secs_f64(seconds)
```

## Backend

```rust
tokio::select! {
    _ = tokio::time::sleep(...) => pass_through,
    _ = cancel.cancelled() => cancelled,
}
```

The current cancellation pattern is good.

## Validation

```text
0 <= seconds <= configurable maximum
finite number
```

## Current bug

Frontend `seconds`, backend `duration` milliseconds.

---

# 13. Existing Node 4 — AI Script

## Role

Transform/generate text or structured data via a configured AI provider.

This is the node that most needs separation between:

- node configuration;
- provider connection;
- request runtime.

## Target ports

MVP:

```text
IN:
  input: any (optional)
OUT:
  text: text
  json: json   // selected output format determines active output
```

A simpler alternative is one polymorphic `result` port. For long-term typed workflows, explicit typed outputs are better.

## Basic UI

```text
AI Script

Connection
[ Google Gemini — Connected ▾ ]

Model
[ Gemini 2.5 Flash ▾ ]

Prompt
┌─────────────────────────────┐
│ Write a short hook about…   │
└─────────────────────────────┘

Input
[ Append upstream input ▾ ]

Output
[ Text ▾ ]
```

If output = JSON/Structured:

```text
Response schema
[ Edit schema ]
```

Temperature can remain Basic only if users regularly tune it; otherwise move it to Advanced.

Recommended:

```text
Advanced
  System instructions
  Temperature
  Timeout
  Response schema
```

But if this app is creator-focused, System Instructions can stay Basic under a collapsed "Instructions" section.

## Prompt variables

Do not interpolate by upstream node ID.

Use port names:

```text
{{input}}
```

Future multi-input AI node:

```text
{{brief}}
{{transcript}}
{{brand}}
```

Provide a small variable picker next to Prompt.

## Provider settings

Node stores:

```json
{
  "connectionId": "gemini-default",
  "model": "gemini-2.5-flash",
  "prompt": "...",
  "systemInstructions": "...",
  "outputFormat": "text",
  "temperature": 0.7,
  "timeoutSeconds": 60
}
```

It never stores the API key.

## Backend provider interface

```rust
#[async_trait]
pub trait AiProvider {
    async fn generate(
        &self,
        request: GenerateRequest,
        cancel: CancellationToken,
    ) -> Result<GenerateResponse>;
}
```

Gemini adapter is one implementation.

Do not put raw `reqwest` request assembly inside the node executor forever.

## Gemini request

Map UI fields to official request configuration:

- model → selected model;
- systemInstructions → system instruction;
- temperature → generation config;
- outputFormat JSON → response MIME type / schema where applicable;
- schema → structured output schema;
- timeout → HTTP timeout;
- cancellation → abort request;
- connectionId → secure key lookup.

## Model list

Do not hardcode a stale model forever.

Strategy:

- ship safe defaults;
- optionally query/cached provider model list;
- filter to supported text-generation models;
- keep a fallback when network model discovery fails.

## Output

Text:

```text
outputs["text"] = NodeValue::Text(...)
```

Structured:

```text
parse and validate JSON
outputs["json"] = NodeValue::Json(...)
```

If structured output is requested and parsing/schema validation fails, the node fails with a clear error. Do not quietly return malformed text as JSON.

## Current gaps

- Rust uses snake_case keys not matching UI.
- Backend hardcodes `gemini-1.5-flash`.
- Frontend presents Gemini 2.5 model choices.
- temperature ignored.
- model ignored.
- output format ignored.
- schema ignored.
- timeout ignored.
- cancellation does not cancel the network wait.
- prompt variables are keyed by upstream node IDs.
- API key is environment-only.

## Error taxonomy

```text
AUTH_MISSING
AUTH_INVALID
RATE_LIMIT
MODEL_UNAVAILABLE
TIMEOUT
NETWORK
INVALID_STRUCTURED_OUTPUT
PROVIDER_ERROR
CANCELLED
```

UI maps these to human-readable recovery actions.

---

# 14. Existing Node 5 — Local File Input

## Role

Bring a local file into the workflow as a reference.

## Target ports

A generic file source can expose:

```text
OUT:
  file: file
```

Do not claim it is already `media` until probed.

Downstream `Media Info` can accept file/media, or graph typing can allow file→media when media extension/probe is valid.

## Basic UI

```text
Local File

Selected file
sample.mp4
34.2 MB · MP4

[Choose file]  [Reveal]
```

Show filename first.
Full path as secondary muted text / tooltip.

Drag-and-drop should work.

## Native picker

Use Tauri v2 dialog plugin.

Filter UI can optionally be:

```text
All files
Video
Audio
Image
Text/JSON
```

Avoid browser `<input type=file>` semantics for a desktop app when the backend needs stable local paths.

## Backend

Config:

```rust
struct FileInputConfig {
    path: PathBuf,
}
```

Execution:

1. reject empty path;
2. canonicalize;
3. check existence;
4. check regular file;
5. `metadata()` for size;
6. optional MIME/extension hint;
7. return `FileRef`.

```json
{
  "kind": "file",
  "value": {
    "path": "...",
    "filename": "sample.mp4",
    "sizeBytes": 12345,
    "extension": "mp4"
  }
}
```

Do not read the entire file into memory.

## Current bug

Frontend writes `path`, Rust reads `file_path`.

---

# 15. Existing Node 6 — Media Info

## Role

Probe media streams and metadata.

The Rust implementation is already one of the strongest current nodes.

## Target ports

```text
IN:
  media: file | media (required)
OUT:
  metadata: json
  media: media   // optional pass-through reference
```

Providing a pass-through media output is very useful in real workflows:

```text
File → Media Info → Reframe → Export
           └──── metadata → Rules
```

## UI

No user configuration.

Instead, after run:

```text
Summary
Duration      00:34.2
Resolution    1080 × 1920
Video         H.264
Audio         AAC
Frame rate    30 fps
Size          18.4 MB
```

Sub-tabs:

```text
Summary | Video | Audio | Raw
```

Raw can remain Advanced.

## Backend

Keep FFprobe service centralized.

Request:

```text
-show_format
-show_streams
-print_format json
```

Return a normalized application model rather than only:

```text
duration
width
height
vcodec
acodec
```

Recommended:

```ts
type MediaMetadata = {
  path: string;
  durationMs?: number;
  format?: string;
  sizeBytes?: number;
  bitRate?: number;
  video?: {
    codec?: string;
    width?: number;
    height?: number;
    fps?: number;
    pixelFormat?: string;
    colorSpace?: string;
  };
  audio?: {
    codec?: string;
    sampleRate?: number;
    channels?: number;
    bitRate?: number;
  };
  raw?: unknown;
};
```

## Progress

Probe is normally fast.
Use indeterminate progress rather than fake percentages.

## Current gap

The real FFprobe output never reaches `NodeDetailBody`, because there is no `node-result` event.

---

# 16. Existing Node 7 — Save Text

## Role

Persist text as a user artifact.

## Ports

```text
IN:
  text: text (required)
OUT:
  artifact: artifact
```

Even output/sink nodes should return the resulting artifact reference. This makes them composable and previewable.

## Basic UI

```text
Save Text

Filename
[ output.txt ]

Location
[ Run output folder ▾ ]
```

Advanced:

```text
If file exists
[ Rename ▾ ]

Encoding
UTF-8   // fixed; don't expose unless truly needed
```

## Backend

Config:

```rust
struct SaveTextConfig {
    filename: String,
    output_dir: Option<PathBuf>,
    overwrite: CollisionPolicy,
}
```

Algorithm:

1. input must be `Text`;
2. sanitize filename;
3. resolve output directory;
4. apply collision policy;
5. write UTF-8;
6. register artifact;
7. return ArtifactRef.

Do not concatenate every arbitrary upstream result.

## Current gaps

- `outputDir` ignored;
- overwrite policy ignored;
- inputs concatenated from every dependency;
- returned artifact is not exposed to frontend.

---

# 17. Existing Node 8 — Save JSON

## Role

Persist JSON.

## Ports

```text
IN:
  json: json (required)
OUT:
  artifact: artifact
```

## Basic UI

```text
Filename
[ output.json ]

Formatting
[ Pretty ▾ ]

Location
[ Run output folder ▾ ]
```

Advanced:

```text
If file exists
[ Rename ▾ ]
```

Add overwrite policy for consistency with Save Text.

## Backend

- accept the value connected to the `json` port;
- do not serialize the scheduler's whole `inputs` map;
- pretty → `to_string_pretty`;
- compact → `to_string`;
- safe path + collision handling;
- artifact registration.

## Current gaps

- always pretty;
- serializes entire input map;
- `outputDir` ignored.

---

# 18. Existing Node 9 — Media Merge

## Important semantic decision

The current node is internally contradictory.

Frontend UI describes:

```text
Audio Mode: Replace / Mix
Duration: Shortest / Video / Audio
Resolution
FPS
Video codec
Audio codec
Bitrate
```

That clearly describes:

> **merge a video stream with an audio stream and render a video**

But Rust currently attempts:

> **horizontal side-by-side merge of two videos** via `hstack`.

These are different products.

### Recommendation

Keep type ID:

```text
mediaMerge
```

for saved-graph compatibility.

Rename visible label to:

```text
Merge Video + Audio
```

or keep `Media Merge` but description must explicitly say:

```text
Combine a video with an audio track.
```

Create a **future separate `Video Concat` / `Layout` node** for multi-video composition.

## Target ports

```text
IN:
  video: video (required)
  audio: audio (optional)
OUT:
  video: video
```

This is the first existing node that makes port-handle routing a hard prerequisite.

## Basic UI

```text
Audio
[ Replace ▾ ]

Duration
[ Shortest ▾ ]

Output
Resolution   [ Match source ▾ ]
Frame rate   [ Match source ▾ ]
```

Advanced:

```text
Video codec  [ H.264 ▾ ]
Audio codec  [ AAC ▾ ]
Bitrate      [ Auto ▾ ]
```

Use **Auto** as the creator-friendly default instead of forcing 8M.

## Dynamic UX

If no audio input is connected:

- hide Audio Mode;
- Duration becomes `Source`;
- node behaves as render/transcode using output settings.

If audio input exists:

- expose Replace/Mix;
- duration choices become relevant.

## Backend command design

Replace mode concept:

```text
-i video
-i audio
-map 0:v:0
-map 1:a:0
```

Mix mode concept:

```text
existing video audio + incoming audio
→ amix / controlled mixing
```

Duration:

```text
shortest → terminate at shortest input
video    → trim/pad audio to video duration
audio    → extend/freeze/loop policy must be explicitly defined
```

Do not implement ambiguous "audio duration" by accidentally producing invalid trailing media. If matching audio means loop/freeze video, make that behavior explicit.

Resolution/FPS:

- `source` → no unnecessary scale/fps filter;
- selected output → apply scale with aspect-ratio policy.

Codecs:

- H.264 default for broad social compatibility;
- use shared encoder mapping;
- AV1/H.265 only if runtime build supports them.

## Progress

Use FFmpeg `-progress pipe:1` + media duration hint from Media Info to produce real progress.

## Cancellation

Current process kill behavior is correct; move it to shared FFmpeg service.

## Output

Return normalized `VideoRef` + register artifact.

## Migration

Legacy single input port `in`:

```text
in → video
```

Do not try to preserve the old accidental `hstack` behavior as the main meaning of this node.

---

# 19. Existing Node 10 — Save Artifact

This is existing product scope, not a future expansion node; therefore it should receive a real backend implementation.

## Role

Copy/move/persist an existing media/file artifact to a chosen durable output.

## Ports

```text
IN:
  artifact: artifact | file | image | audio | video
OUT:
  artifact: artifact
```

## UI

```text
Save Artifact

Filename
[ Use original name ]

Location
[ Run output folder ▾ ]

Type
Automatic
```

Advanced:

```text
If file exists
[ Rename ▾ ]

Mode
[ Copy ▾ ]
```

Do not expose a forced artifact type unless it changes real behavior.

Setting "Video" on a PNG does not make it a video.

Therefore change `artifactType` semantics:

- use it only as a validation filter, or
- remove it.

Recommended UI:

```text
Expected type
[ Any ▾ ]
```

with `Any / Video / Audio / Image / File`.

## Backend

1. resolve input artifact/file ref;
2. validate source exists;
3. resolve destination;
4. apply collision policy;
5. copy;
6. probe optional metadata;
7. register new artifact;
8. return ArtifactRef.

## Execution

Make node canonical.

---

# 20. Existing Node 11 — Preview

This is also existing scope.

## Role

A visual sink that captures the connected runtime value.

## Ports

```text
IN:
  input: any
OUT: none
```

## UX

The canvas card stays minimal:

```text
Preview
Video · 00:34
```

Double-click opens Preview tab immediately.

Supported renderer:

```text
Text
JSON
Image
Audio
Video
Media metadata
File details
```

## Backend

Preview does not need to transform the input.

Implement a lightweight executor:

```text
capture input
→ return it in NodeExecutionResult
→ no output port
→ no artifact copy required
```

This makes it an executable sink and allows `node-result` to drive the frontend preview.

Alternative architecture: mark Preview as a frontend observer and compile it specially. That is more complex and provides little value. A tiny canonical executor is clearer.

## Validation

Exactly one incoming connection.

## Current gap

Frontend has a strong viewer architecture but no runtime value bridge.

---

# 21. Existing Node 12 — Markdown Note

## Role

Canvas documentation only.

## UX

Keep extremely simple.

Node card:

```text
Note
First line of note…
```

Inspector:

```text
Markdown
[ editor ]
```

Optional future:

- color preset;
- size;
- collapse.

Avoid turning this into Notion.

## Backend

No executor.

Graph compiler excludes it from execution.

## Critical acceptance test

A workflow containing only:

```text
Text Input → Save Text
+ an unconnected Markdown Note
```

must complete successfully.

---

# 22. Port system redesign

Current port types are a good start:

```text
text
number
boolean
json
file
media
audio
video
artifact
any
```

Enhance with cardinality:

```ts
interface PortSpec {
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
  maxConnections?: number;
}
```

Examples:

```text
AI Script.input             max 1
Media Merge.video           max 1
Media Merge.audio           max 1
Future Video Concat.clips   many
```

## Compatibility

Do not keep mismatch as UI-only advisory forever.

Backend validation should be authoritative and return structured graph problems before execution.

Examples:

```text
ERROR: Media Merge.video requires Video, received Text.
ERROR: Save JSON.json is required.
ERROR: Preview.input has 2 connections but allows 1.
```

Frontend can perform the same validation eagerly for instant feedback.

---

# 23. Pre-run validation flow

Current flow should evolve from:

```text
Run click
→ frontend block only some frontend-only nodes
→ backend deserialize
→ graph cycle check
→ execute
```

to:

```text
Run click
→ frontend local validation
→ backend validate_graph
→ receive normalized Problems[]
→ if valid, create Run
→ execute
```

Problem structure:

```ts
type WorkflowProblem = {
  code: string;
  severity: "error" | "warning";
  nodeId?: string;
  portId?: string;
  field?: string;
  message: string;
  recovery?: string;
};
```

Examples:

```text
FILE_NOT_FOUND
REQUIRED_INPUT_MISSING
PORT_TYPE_MISMATCH
INVALID_CONFIG
PROVIDER_NOT_CONFIGURED
FFMPEG_UNAVAILABLE
OUTPUT_PATH_INVALID
UNSUPPORTED_CODEC
CYCLE_DETECTED
```

Clicking a problem centers/selects the affected node and opens the relevant inspector field.

---

# 24. Run lifecycle

## Current

Frontend has to infer run completion.

## Target

Backend is authoritative.

```text
start_run
  ↓
run-status: running
  ↓
node-status / node-result / log
  ↓
run-status: completed | failed | cancelled
```

Frontend state simply consumes events.

### Retry

Do not implement Retry Failed until node output persistence and dependency semantics are reliable.

Later:

```text
Retry node
Retry failed branch
Run from node
```

can reuse cached successful upstream results.

---

# 25. Settings / Environment plan

## Settings

### Connections

```text
Google Gemini
Connected
[Manage]
```

### Media runtime

```text
FFmpeg
Auto detected: C:\...\ffmpeg.exe
[Change]

FFprobe
Auto detected
```

### Output

```text
Default output folder
[ Runs directory ▾ ]

Concurrent jobs
[ 2 ]
```

`Concurrent jobs` should limit heavyweight active node jobs globally, not blindly override DAG scheduling.

Use weighted resource classes later:

```text
light
network
cpu
media
gpu
```

---

# 26. Existing-node implementation order

## Phase C0 — Baseline and contract tests

**Status (2026-08-14): PARTIAL.** Baseline `npm run build`, `cargo check`, and
`cargo test` passed before implementation. Runtime V2 now has a shared
TypeScript/Rust registry fixture, graph/value serialization tests, and a v1
migration fixture. Per-executor failure/cancellation coverage remains for the
node-reconciliation phases.

Before changing behavior:

- snapshot current node registry;
- add Rust unit tests for every current executor;
- add frontend registry parity test;
- add graph serialization fixtures;
- add migration fixtures.

Deliverable:

```text
tests/fixtures/workflow-v1/*.json
```

---

## Phase C1 — Workflow Graph V2

**Status (2026-08-14): DONE for Contract V2 scope.** Saved graphs normalize to
`schemaVersion: 2`, preserve both handles, validate registered ports/types and
single-cardinality inputs, route values by target port, and exclude annotation
and viewer nodes from the executable DAG. Legacy missing handles are inferred
only when the relevant side has exactly one declared port; otherwise migration
returns an explicit ambiguity error and never guesses by UUID or order.

Implement:

- `schemaVersion`;
- edge handles;
- normalization/migration;
- annotation-node exclusion;
- backend port validation;
- executor input map keyed by target port.

No new feature node in this phase.

---

## Phase C2 — Typed execution values and result events

**Status (2026-08-14): DONE for Contract V2 scope.** Rust executors use
`NodeValue`, `NodeExecutionResult`, and `ArtifactRef`; the scheduler emits and
persists node results/artifacts and owns terminal run state. Zustand consumes
the events and Output/Preview render the real latest result. Rich media URL
conversion and durable result-history querying remain later work.

Implement:

- NodeValue;
- NodeExecutionResult;
- ArtifactRef;
- node-result event;
- run-status event;
- frontend result store;
- PreviewViewer data bridge.

After C2, Media Info will immediately become far more useful.

---

## Phase C3 — Runtime services

Implement:

- dialog plugin;
- secret store;
- provider connections;
- FFmpeg service;
- FFprobe service;
- runtime health probe;
- artifact registry;
- output collision service.

---

## Phase N1 — Text nodes

Finish:

```text
Text Input
Text Transform
Delay
Markdown Note execution exclusion
```

These are low-risk and validate the new port/value contract.

---

## Phase N2 — File + Media Info

Finish:

```text
Local File Input
Media Info
```

This validates:

- native file selection;
- file references;
- FFprobe service;
- node-result metadata UI.

---

## Phase N3 — Output nodes

Finish:

```text
Save Text
Save JSON
Save Artifact
```

This validates:

- artifact registration;
- collision policies;
- custom/default directories;
- artifact UI.

---

## Phase N4 — AI Script

Implement the provider layer, secure key storage, structured output, cancellation, timeout, model config and proper prompt variables.

Do this after core contracts are stable so the AI implementation is not built twice.

---

## Phase N5 — Media Merge

Implement the corrected Video + Audio semantics.

This phase is the proof that multi-port routing works.

---

## Phase N6 — Preview

Make Preview canonical and connect runtime values to the existing viewer architecture.

---

# 27. Recommended frontend component changes

Do **not** create:

```text
TextInputInspector.tsx
DelayInspector.tsx
SaveTextInspector.tsx
SaveJsonInspector.tsx
...
```

unless behavior truly cannot be expressed generically.

Enhance the schema system instead.

## Add conditional fields

```ts
visibleWhen?: {
  field: string;
  equals: unknown;
}
```

Example:

```ts
find.visibleWhen = {
  field: "operation",
  equals: "replace"
}
```

## Add units

```ts
unit?: "s" | "ms" | "fps" | "Mbps" | "MB"
```

## Add field group

```ts
group?: "basic" | "output" | "advanced"
```

## Add validation metadata

```ts
required?: boolean
pattern?: string
```

But backend remains authoritative.

---

# 28. Recommended backend config parsing pattern

Do not access config fields like this in every executor:

```rust
node.data.extra.get("...")
```

Use typed config.

Example:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DelayConfig {
    #[serde(default = "default_seconds")]
    seconds: f64,
}
```

Shared helper:

```rust
fn parse_node_config<T: DeserializeOwned>(node: &Node) -> Result<T>
```

Benefits:

- compile-time intent;
- fewer key typos;
- easy defaults;
- easy validation;
- easy migration;
- better unit tests.

---

# 29. Testing strategy

## 29.1 Contract tests

For every node:

```text
frontend type == backend type
frontend port IDs == backend port IDs
executionMode compatible with executor registry
config fixture deserializes in Rust
```

CI must fail on mismatch.

---

## 29.2 Rust node unit tests

### Text Input

- multiline;
- Unicode;
- empty.

### Text Transform

- all operations;
- invalid replace config.

### Delay

- milliseconds/seconds conversion;
- cancellation.

### AI Script

Use mock HTTP server.

Test:

- auth error;
- timeout;
- structured output parse;
- provider error;
- cancellation.

Never hit live Gemini in normal CI.

### File Input

Use temp directory.

### Media Info / Media Merge

Unit-test command construction separately.

Optional integration tests run only when FFmpeg fixture is available.

### Save*

Temp output dir + collision tests.

---

## 29.3 Frontend tests

- field visibility;
- config serialization;
- run disabled/error states;
- port compatibility;
- output renderer selection;
- no edit while running;
- file picker cancellation;
- Problems center correct node.

---

## 29.4 End-to-end smoke workflows

### A — Text

```text
Text Input
→ Text Transform
→ Save Text
```

### B — Structured AI

```text
Text Input
→ AI Script (JSON)
→ Save JSON
```

### C — Media inspect

```text
Local File
→ Media Info
→ Preview
```

### D — Video + audio

```text
Local Video ─┐
             ├→ Media Merge → Preview → Save Artifact
Local Audio ─┘
```

### E — Annotation safety

Same as A + Markdown Note.

---

# 30. Performance / concurrency guidance

Current scheduler can run independent branches in parallel.

Keep that behavior, but introduce a semaphore for expensive work.

Example:

```text
maxConcurrentMediaJobs = 2
maxConcurrentNetworkJobs = 4
```

Later a resource scheduler can be more sophisticated.

Do not allow 20 independent FFmpeg nodes to start simultaneously just because the graph allows it.

---

# 31. Future short-video node research — UI ONLY

**These are not part of the current executable backend milestone.**

The purpose of this section is to design the future library now so the core port/value contracts support it.

Recommended categories:

```text
INPUT
TEXT
AI
VIDEO
AUDIO
CAPTIONS
MEDIA
MARKETING
OUTPUT
UTILITY
```

---

## SV-01 — URL Media Input

### Purpose

Import creator-owned / permitted online media by URL.

### UI concept

```text
URL Media

URL
[ https://... ]

Format
[ Best video + audio ▾ ]

[ ] Download subtitles
```

Node card:

```text
URL Media
youtube.com/...
```

### Candidate engine

`yt-dlp` can be investigated as a future optional integration.

Important product rule:

- user must have rights/permission to download the content;
- site support changes over time;
- treat the downloader as an external runtime dependency with health/version state.

No backend implementation in current milestone.

---

## SV-02 — Batch / Folder Input

```text
Folder
[ Choose folder ]

Include
*.mp4, *.mov

Order
[ Filename ▾ ]
```

Output:

```text
media[]
```

Requires list/collection type in future contract.

Do not add before collection semantics are designed.

---

## SV-03 — Trim Clip

```text
IN: video
OUT: video

Start     00:00.0
End       00:12.5
```

UX should support:

- time inputs;
- future mini waveform/timeline;
- "Use first 15s" presets.

---

## SV-04 — Smart Reframe / Crop

One of the highest-value short-video nodes.

```text
Aspect
[ 9:16 Short ▾ ]

Fit
[ Fill ▾ ]

Focus
[ Center ▾ ]
```

Presets:

```text
9:16
1:1
4:5
16:9
```

Future smart face/object tracking can be a different mode.

FFmpeg already provides strong crop/scale primitives, so a basic local version is feasible later.

---

## SV-05 — Resize / Canvas

Purpose:

- exact dimensions;
- padding;
- blurred background;
- solid background.

This should be separate from semantic Smart Reframe if advanced behavior grows.

---

## SV-06 — Video Concat

This is the node that should own the behavior currently accidentally implemented by `Media Merge`.

```text
IN: clips[]
OUT: video

Order
[ Connection order ]

Transition
[ None ▾ ]
```

Later:

```text
Crossfade
Dip to black
```

---

## SV-07 — Overlay

Inputs:

```text
base: video
overlay: image | video
```

UI:

```text
Position
[ Top right ▾ ]

Size
[ 25% ]

Opacity
[ 100% ]
```

FFmpeg's overlay/filtergraph model supports this design.

---

## SV-08 — Speed / Retime

```text
Speed
[ 1.0× ]

Audio
[ Preserve pitch ]
```

Presets:

```text
0.5×  0.75×  1×  1.25×  1.5×  2×
```

---

## SV-09 — Extract Audio

```text
IN: video
OUT: audio
```

No unnecessary configuration.

---

## SV-10 — Audio Mix

Inputs:

```text
voice
music
```

UI:

```text
Voice       100%
Music        18%
[✓] Duck music under voice
```

This is creator-friendly; avoid exposing FFmpeg filter syntax.

---

## SV-11 — Loudness Normalize

```text
Preset
[ Social video ▾ ]
```

Advanced:

```text
Target LUFS
True Peak
```

FFmpeg provides the `loudnorm` filter and can serve as the local backend foundation later.

---

## SV-12 — Transcribe

High-priority future node.

```text
IN: audio | video
OUT:
  transcript: text
  segments: json
  subtitles: artifact
```

UI:

```text
Model
[ Small ▾ ]

Language
[ Auto ▾ ]

[✓] Word timestamps
```

### Candidate local engine

`whisper.cpp` is a strong local/offline option. Its project supports CPU and multiple acceleration backends and exposes CLI/library usage. This fits a desktop-first workflow better than requiring cloud ASR for every run.

Do not implement in this milestone; design the port schema now.

---

## SV-13 — Auto Captions

Input:

```text
segments / subtitles
video
```

UI:

```text
Style
[ Bold Short ▾ ]

Words per line
[ Auto ]

Highlight current word
[✓]

Position
[ Lower center ▾ ]
```

This will eventually need a specialized visual preview, but keep the node inspector basic.

---

## SV-14 — Subtitle Burn-in

```text
IN:
  video
  subtitles
OUT:
  video
```

Basic:

```text
Style preset
Safe margin
```

Advanced:

```text
font
size
outline
shadow
```

Use FFmpeg subtitle/filter rendering when feasible.

---

## SV-15 — Scene Detect

```text
IN: video
OUT:
  clips[]
  scenes.json
```

UI:

```text
Sensitivity
[ Balanced ▾ ]
Minimum scene
[ 1.0 s ]
```

This is useful for automatic short extraction.

---

## SV-16 — Clip Selector

AI-assisted future node.

Input:

```text
transcript + scenes
```

Output:

```text
selected clip ranges
```

UI:

```text
Goal
[ Strongest hook ▾ ]

Length
[ 20–40 s ]
```

Keep selection output structured rather than immediately rendering video.

---

## SV-17 — Short Composer

A high-level convenience node should eventually orchestrate:

```text
selected clips
captions
audio
branding
```

But do not make this a giant "magic node" first.

Build the low-level composable nodes before this one.

---

## SV-18 — Social Export

High-priority future output node.

```text
Platform
[ TikTok / Shorts / Reels ▾ ]

Quality
[ Recommended ▾ ]
```

It should map to safe presets:

```text
9:16
H.264
AAC
frame-rate constraints
```

The exact platform constraints must be refreshed from official APIs/docs at implementation time.

---

## SV-19 — Batch Render

Input:

```text
video[]
```

Output:

```text
artifact[]
```

UI:

```text
Naming
{index}-{title}

Parallel renders
Auto
```

Requires collection semantics + resource scheduler first.

---

# 32. Future marketing nodes — UI ONLY

Marketing nodes should not become an uncontrolled collection of generic "AI prompt" nodes. Each node should have a clear typed marketing artifact.

Suggested typed concepts:

```text
ContentBrief
HookSet
Script
PlatformCopy
CampaignMetadata
PublishRequest
AnalyticsSnapshot
```

---

## MK-01 — Content Brief

Inputs:

```text
topic
brand context
audience
```

Output:

```text
ContentBrief JSON
```

UI:

```text
Goal
Audience
Tone
Key message
CTA
```

---

## MK-02 — Hook Generator

Input:

```text
brief / script / transcript
```

UI:

```text
Variants
[ 5 ]

Style
[ Curiosity ▾ ]
```

Output:

```json
[
  {
    "hook": "...",
    "angle": "...",
    "reason": "..."
  }
]
```

Not five unstructured strings concatenated together.

---

## MK-03 — Short Script

UI:

```text
Target length
[ 30 s ]

Structure
[ Hook → Value → CTA ▾ ]
```

Output should be structured:

```text
hook
body
cta
estimated duration
```

---

## MK-04 — Title / Caption Generator

Do not create separate YouTube Title, TikTok Caption and Instagram Caption nodes initially.

Use:

```text
Platform
[ YouTube Shorts ▾ ]

Variants
[ 5 ]
```

Output typed platform copy.

---

## MK-05 — Hashtag / Keyword Pack

Input:

```text
topic
platform
copy
```

Output:

```text
primary keywords
secondary keywords
hashtags
```

UI needs only:

```text
Platform
Region/Language
Count
```

---

## MK-06 — CTA Generator

```text
Goal
[ Subscribe ▾ ]

Tone
[ Natural ▾ ]
```

Output multiple CTA options.

---

## MK-07 — Platform Variant

Input:

```text
one master post package
```

Output:

```text
YouTube package
TikTok package
Instagram package
```

This is more useful than three disconnected copy nodes in larger workflows.

---

## MK-08 — UTM Builder

This can be local/deterministic later.

Inputs:

```text
URL
source
medium
campaign
content
term
```

Output:

```text
URL
```

No AI required.

---

## MK-09 — Thumbnail / Cover Brief

Input:

```text
video metadata + hook
```

Output:

```text
cover text
visual brief
recommended frame timestamp
```

Future renderer/generator remains separate.

---

## MK-10 — Publish YouTube

UI-only now.

Future UI:

```text
Account
[ Channel Name ▾ ]

Title
Description
Tags

Visibility
[ Private ▾ ]

[ ] Schedule
```

Backend later needs:

- OAuth;
- resumable upload;
- upload progress;
- processing-status polling;
- audit/compliance handling.

Use a real async publish state rather than "Success" immediately after upload bytes finish.

---

## MK-11 — Publish TikTok

UI-only now.

Future UI must be driven by creator/account capabilities returned by the platform API.

Concept:

```text
Account
Caption
Privacy
Comments
Duet
Stitch
AI-generated label
Cover frame
```

The platform requires explicit user consent and creator information for Direct Post flows.

TikTok also supports upload-as-draft, which should be a distinct mode:

```text
Mode
[ Send as draft ▾ ]
```

Do not hide the fact that draft upload still requires the user to finish publishing in TikTok.

---

## MK-12 — Publish Instagram Reels

UI-only.

Concept:

```text
Account
Caption
Share to feed
Cover
```

Keep implementation behind a platform adapter later.

Because platform APIs and permissions change, keep all publish-node constraints server/runtime-configurable rather than hardcoded deep in React components.

---

## MK-13 — Schedule Publish

Do not implement as a simple Delay node.

Scheduling is a durable responsibility:

- app restart;
- machine sleep;
- expired OAuth token;
- offline state;
- missed schedule;
- retry.

It should use a persistent job scheduler when implemented.

UI-only for now.

---

## MK-14 — Analytics Snapshot

Inputs:

```text
published post reference
```

Output:

```text
views
watch time
likes
comments
shares
CTR where available
```

This is a later connector/API feature.

---

## MK-15 — Compare Variants / Experiment

Input:

```text
multiple posts or copy variants
```

Output:

```text
comparison report
```

Do not pretend to calculate reliable attribution until real platform data is connected.

---

# 33. Suggested future Node Library layout

Keep the library compact.

```text
INPUT
  Text Input
  Local File
  URL Media              [UI-only future]
  Batch / Folder         [UI-only future]

TEXT
  Text Transform

AI
  AI Script
  Hook Generator         [UI-only future]
  Short Script           [UI-only future]
  Clip Selector          [UI-only future]

VIDEO
  Trim                    [UI-only future]
  Reframe                 [UI-only future]
  Resize / Canvas         [UI-only future]
  Concat                  [UI-only future]
  Overlay                 [UI-only future]
  Speed                   [UI-only future]

AUDIO
  Extract Audio           [UI-only future]
  Audio Mix               [UI-only future]
  Loudness Normalize      [UI-only future]

CAPTIONS
  Transcribe              [UI-only future]
  Auto Captions           [UI-only future]
  Burn Subtitles          [UI-only future]

MEDIA
  Media Info
  Media Merge
  Preview

MARKETING
  Content Brief           [UI-only future]
  Hook Generator          [UI-only future]
  Platform Copy           [UI-only future]
  Hashtag / Keywords      [UI-only future]
  CTA                     [UI-only future]
  UTM Builder             [UI-only future]

OUTPUT
  Save Text
  Save JSON
  Save Artifact
  Social Export           [UI-only future]
  Publish YouTube         [UI-only future]
  Publish TikTok          [UI-only future]
  Publish Instagram       [UI-only future]

UTILITY
  Delay
  Markdown Note
```

Search should match:

- node name;
- synonyms;
- platform names;
- purpose.

Example:

```text
search "shorts"
→ Reframe
→ Auto Captions
→ Social Export
→ Publish YouTube
```

---

# 34. Keep future UI-only nodes impossible to accidentally run

Do not repeat the current ambiguity with `registryState`.

Add explicit maturity:

```ts
maturity:
  | "stable"
  | "beta"
  | "design-only"
```

And execution mode:

```ts
executionMode:
  | "execute"
  | "annotation"
```

Future expansion nodes:

```text
maturity = design-only
executionMode = execute
backendAvailable = false
```

UI:

```text
Auto Captions
Coming later
```

It can be previewed/inspected in a design branch, but should either:

- not be addable to a production executable graph, or
- be visually marked and produce an immediate graph Problem.

Do not let users build a large graph and only discover at Run that half the nodes are unavailable.

---

# 35. Node implementation Definition of Done

Every executable node is complete only when all are true:

## Contract

- registered frontend;
- registered backend;
- port IDs match;
- config keys match;
- graph migration covered;
- typed config parser exists.

## UI

- card summary;
- inspector Basic;
- Advanced only when needed;
- field dependencies;
- validation;
- running disabled state;
- success state;
- failure state;
- output renderer where relevant.

## Backend

- typed inputs;
- typed outputs;
- cancellation;
- error codes;
- progress if meaningful;
- no unsafe path handling;
- no secret logging;
- artifact registration if applicable.

## Tests

- unit tests;
- config fixture test;
- graph integration test;
- failure test;
- cancellation test for long-running nodes.

## Observability

- node start;
- node completion;
- duration;
- meaningful log messages;
- no giant raw stderr unless Debug mode.

---

# 36. Proposed implementation tickets

## Epic A — Runtime Contract V2

### A1 Graph schema version
### A2 Edge handle persistence
### A3 Graph v1→v2 migration
### A4 Port-aware graph compiler
### A5 Typed NodeValue
### A6 NodeExecutionResult
### A7 `node-result` event
### A8 backend `run-status` event
### A9 annotation-node exclusion
### A10 pre-run backend validation

---

## Epic B — Runtime Services

### B1 Tauri dialog plugin
### B2 secret store / Gemini connection
### B3 runtime settings model
### B4 FFmpeg locator
### B5 FFprobe locator
### B6 FFmpeg process wrapper
### B7 FFmpeg progress parser
### B8 artifact registry
### B9 output collision service
### B10 health probe command

---

## Epic C — Current Text Nodes

### C1 Text Input reconciliation
### C2 Text Transform complete ops
### C3 Delay units + any pass-through
### C4 Markdown annotation compilation
### C5 text E2E fixture

---

## Epic D — Current File / Media Info

### D1 File picker UI
### D2 FileRef model
### D3 File Input backend reconciliation
### D4 FFprobe normalized metadata
### D5 Media Info result UI
### D6 media probe E2E

---

## Epic E — Current Save Nodes

### E1 Save Text
### E2 Save JSON
### E3 Save Artifact executor
### E4 collision policy UI/backend
### E5 artifact dock integration

---

## Epic F — AI Script

### F1 Provider interface
### F2 Stronghold connection
### F3 Gemini adapter
### F4 model field support
### F5 system instructions
### F6 temperature
### F7 timeout/cancellation
### F8 structured JSON
### F9 schema validation
### F10 prompt variable picker
### F11 AI mock integration tests

---

## Epic G — Media Merge

### G1 migrate `in` → `video`
### G2 add `audio` port
### G3 port-aware runtime test
### G4 Replace audio
### G5 Mix audio
### G6 duration modes
### G7 source/preset resolution
### G8 FPS
### G9 codec mapping
### G10 bitrate Auto
### G11 FFmpeg progress
### G12 Preview + ArtifactRef
### G13 cancellation integration

---

## Epic H — Preview

### H1 canonical Preview executor
### H2 store node results
### H3 text renderer
### H4 JSON renderer
### H5 image renderer
### H6 audio renderer
### H7 video renderer
### H8 media-info renderer
### H9 Reveal/Copy actions

---

# 37. Suggested milestone sequence

## Milestone 1 — "Runtime trustworthy"

Ship:

```text
Contract V2
typed ports
backend validation
node results
run result events
Markdown safety
```

No new node count.

Success metric:

> A graph can be reasoned about deterministically from its saved JSON.

---

## Milestone 2 — "Current nodes actually match the UI"

Ship:

```text
Text Input
Text Transform
Delay
File Input
Media Info
Save Text
Save JSON
```

Success metric:

> Every visible config field changes actual runtime behavior.

---

## Milestone 3 — "Provider + artifact foundation"

Ship:

```text
Gemini connection
AI Script
Save Artifact
Artifact dock
real Environment health
```

Success metric:

> No API key in graph JSON; outputs/artifacts are inspectable.

---

## Milestone 4 — "First real media pipeline"

Ship:

```text
Media Merge video+audio
Preview
FFmpeg progress
```

Acceptance:

```text
Video File ─┐
            ├→ Media Merge → Preview → Save Artifact
Audio File ─┘
```

Success metric:

> 2-port media routing is deterministic and cancellation-safe.

---

## Milestone 5 — "Short-video UI expansion"

UI/UX only for:

```text
Trim
Reframe
Concat
Overlay
Audio Mix
Transcribe
Auto Captions
Social Export
```

Do not implement all backend executors in one batch.

Use usability testing to reduce the node set before runtime work.

---

## Milestone 6 — "Marketing UI expansion"

UI/UX only:

```text
Content Brief
Hook
Script
Platform Copy
Keywords
CTA
UTM
Publish nodes
Analytics
```

---

# 38. What not to do

## Do not add 30 executors before fixing ports

The scheduler cannot reliably support multi-input nodes yet.

## Do not put every node config into one raw JSON blob forever

Use typed config structs.

## Do not build AI provider logic inside `ai_script.rs`

Use a provider service.

## Do not make each media node spawn FFmpeg differently

Use one FFmpeg service.

## Do not show all codec knobs to normal users

Use presets + Advanced.

## Do not treat file paths as media content

Use FileRef / MediaRef / ArtifactRef.

## Do not let frontend infer run completion long-term

Backend owns lifecycle.

## Do not use a Delay node for durable scheduled publishing

Desktop app restarts/sleep make that unreliable.

## Do not call the current `Media Merge` complete

Its Rust behavior and UI behavior currently describe different operations.

---

# 39. Research findings that influence the design

## React Flow

React Flow's current documentation makes handle identity explicit for nodes with multiple source/target handles. Edges support `sourceHandle` and `targetHandle`. This validates making port IDs part of the backend graph contract rather than treating them as a frontend-only visual detail.

Sources:

- React Flow — Handles
  https://reactflow.dev/learn/customization/handles
- React Flow — Connection
  https://reactflow.dev/api-reference/types/connection
- React Flow — Computing Flows
  https://reactflow.dev/learn/advanced-use/computing-flows

---

## Tauri v2

The official Tauri v2 plugin system provides a native dialog plugin for opening/selecting files and directories. The Stronghold plugin provides secure secret/key storage.

Sources:

- Tauri Dialog plugin
  https://v2.tauri.app/plugin/dialog/
- Tauri Dialog JS API
  https://v2.tauri.app/reference/javascript/dialog/
- Tauri Stronghold
  https://v2.tauri.app/plugin/stronghold/

These directly support:

```text
Local File Input
Output directory
Gemini credential storage
```

---

## Gemini

The official Gemini API exposes:

- system instructions;
- model selection;
- generation configuration including temperature;
- structured output / JSON schema for supported models.

The current frontend's intended AI controls are therefore reasonable, but the Rust executor must actually map them into the provider request.

Sources:

- Gemini Generate Content
  https://ai.google.dev/api/generate-content
- Gemini Structured Outputs
  https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- Migration / newer Interactions API guidance
  https://ai.google.dev/gemini-api/docs/migrate-to-interactions

Implementation note:

At implementation time, re-check Google's currently recommended API surface/model lifecycle rather than freezing today's endpoint assumptions indefinitely.

---

## FFmpeg

FFmpeg provides the local primitives needed for many future short-video nodes:

- overlay/filter graphs;
- scaling/cropping;
- subtitle rendering;
- loudness normalization;
- stream mapping;
- process progress reporting.

Sources:

- FFmpeg command documentation
  https://ffmpeg.org/ffmpeg.html
- FFmpeg filters
  https://ffmpeg.org/ffmpeg-filters.html

This supports keeping the initial media backend local and deterministic.

---

## whisper.cpp

`whisper.cpp` is a strong future candidate for local transcription in a desktop workflow. Its project supports local CPU execution and multiple hardware acceleration paths, with CLI/library examples.

Source:

- whisper.cpp
  https://github.com/ggml-org/whisper.cpp

Recommended future nodes:

```text
Transcribe
Auto Captions
Scene transcript → Clip Selector
```

Keep it optional and separately installable/downloadable if bundling model size becomes undesirable.

---

## yt-dlp

`yt-dlp` can be evaluated for a future URL Media Input node. Its supported-site list is intentionally dynamic and sites can break as platforms change.

Source:

- yt-dlp
  https://github.com/yt-dlp/yt-dlp

Product constraint:

Only support content the user is authorized to access/download and do not market the node as bypassing platform restrictions.

---

## YouTube publishing

YouTube Data API provides `videos.insert`, OAuth-protected upload, media upload and processing state. Resumable upload is important for reliable desktop publishing.

Sources:

- YouTube Data API — Videos
  https://developers.google.com/youtube/v3/docs/videos
- Videos: insert
  https://developers.google.com/youtube/v3/docs/videos/insert
- Resumable uploads
  https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol

This supports a future Publish YouTube node with:

```text
OAuth connection
upload progress
processing status
privacy
metadata
```

not a simple fire-and-forget HTTP node.

---

## TikTok publishing

TikTok's Content Posting API currently supports Direct Post and Upload-as-draft flows. Direct Post requires creator info, user authorization/consent, and platform-specific fields. Upload can be chunked and post processing is asynchronous.

Sources:

- TikTok Content Posting API
  https://developers.tiktok.com/products/content-posting-api
- Direct Post
  https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- Upload
  https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
- Media transfer
  https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
- Post status
  https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status

Therefore the future TikTok node needs:

```text
account capability fetch
consent
privacy
upload progress
processing status
draft/direct mode
```

---

## Instagram Reels publishing

Meta's official Instagram API collection/documentation describes a media-container → publish flow for Reels and professional-account permissions.

Useful implementation references:

- Meta Instagram API collection
  https://www.postman.com/meta/workspace/instagram/
- Meta Reels publishing sample repository
  https://github.com/fbsamples/reels_publishing_apis

Treat platform constraints as refreshable because API versions/permissions evolve.

---

# 40. Final recommended product direction

The strongest version of Void Workflow is not a giant collection of unrelated nodes.

It should become a **local-first creator workflow runtime** with three layers:

## Layer 1 — Reliable primitives

```text
Text
File
AI
Media
Artifact
Control
```

## Layer 2 — Creator primitives

```text
Trim
Reframe
Audio
Transcribe
Captions
Compose
Export
```

## Layer 3 — Distribution / marketing

```text
Brief
Hook
Platform copy
Publish
Analytics
```

All three layers use the same:

```text
typed ports
versioned graph
artifact model
scheduler
events
validation
provider connections
```

That is what keeps the app scalable.

---

# 41. Immediate implementation checklist

The next coding pass should start here, in this exact order:

- [x] Add `schemaVersion = 2`.
- [x] Extend Rust `Edge` with `sourceHandle` / `targetHandle`.
- [x] Add v1 → v2 edge migration.
- [x] Exclude `Markdown Note` from executable DAG.
- [x] Change scheduler input resolution from upstream node ID → target port ID.
- [x] Introduce typed `NodeValue`.
- [x] Introduce `NodeExecutionResult`.
- [x] Emit `node-result`.
- [x] Emit backend-owned final `run-status`.
- [x] Persist lightweight node results and artifact refs.
- [x] Add backend graph validation. (Port/type/cardinality/cycle coverage is in place; structured Problems DTO remains.)
- [x] Add contract parity tests.
- [ ] Reconcile Text Input.
- [ ] Complete Text Transform.
- [ ] Reconcile Delay.
- [ ] Wire Tauri dialog.
- [ ] Reconcile Local File Input.
- [ ] Bridge Media Info output.
- [ ] Complete Save Text behavior.
- [ ] Complete Save JSON behavior.
- [ ] Implement Save Artifact.
- [ ] Add secret/provider settings.
- [ ] Refactor Gemini into provider service.
- [ ] Complete AI Script.
- [ ] Convert Media Merge to explicit Video + Audio ports.
- [ ] Refactor FFmpeg into shared service with progress.
- [ ] Implement canonical Preview executor.
- [ ] Only after all above: begin executable short-video nodes.

---

# 42. Short conclusion

The current repository is a good UI/runtime prototype and already contains enough structural work to avoid a rewrite. The key problem is **contract integrity**, not the absence of nodes.

The highest-value engineering move is to make one saved graph mean the exact same thing in:

```text
React Flow
→ Zustand
→ serialized JSON
→ Rust graph compiler
→ scheduler
→ node executor
→ result event
→ Preview / Artifact UI
```

Once that chain is deterministic, building Trim, Reframe, Captions, Transcribe, Social Export, Publish and Marketing nodes becomes incremental work instead of repeated special-case plumbing.

**Recommendation:** treat Contract V2 + Current Node Completion as the product's next main milestone. Keep all newly researched Short Video / Marketing nodes as UI-only until that milestone passes its E2E acceptance workflows.
