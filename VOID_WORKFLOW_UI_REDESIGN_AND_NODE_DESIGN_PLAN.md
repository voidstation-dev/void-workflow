# VOID WORKFLOW — UI/UX AUDIT, REDESIGN & NODE DESIGN PLAN

**Status:** Proposed  
**Scope:** Audit and redesign the existing Tauri/React/React Flow workspace before deep node design  
**Primary Rule:** Fix the workspace system first. Do not redesign nodes in isolation.

## 1. Goal

The current app is a valid functional prototype: Tauri launches, the canvas exists, Node Library exists, Console exists, and Save/Run/Open Output controls exist.

The next objective is not to add more features. It is to turn the prototype into a coherent professional workflow workspace, then deep-design each node using one consistent contract.

Target sequence:

```text
CURRENT APP
    ↓
UI AUDIT
    ↓
UX ARCHITECTURE
    ↓
DESIGN SYSTEM
    ↓
WORKSPACE SHELL
    ↓
NODE LIBRARY
    ↓
CANVAS SYSTEM
    ↓
INSPECTOR
    ↓
OBSERVABILITY DOCK
    ↓
UI REVIEW / FREEZE
    ↓
NODE DESIGN TIER 1
    ↓
NODE DESIGN TIER 2
    ↓
NODE DESIGN TIER 3
    ↓
MVP2 COMPLEX NODES
```

## 2. Current Screenshot Audit

The current screen appears to contain:

```text
Top Bar
├── Void Workflow
├── Connected
├── Open Output
├── Save
└── Run

Left Sidebar
└── Node Library
    ├── Text Input
    ├── Text Transform
    ├── Delay
    ├── AI Script (Gemini)
    ├── Local File Input
    ├── Media Info
    ├── Save Text
    ├── Save JSON
    ├── Save Artifact
    ├── Media Merge
    ├── Preview
    └── Markdown Note

Center
└── React Flow Canvas

Bottom
└── Console
```

Main UX issues visible from the current prototype:

- Weak product/workflow hierarchy in the top bar.
- Generic Tauri starter identity still appears in native chrome.
- Node Library is a flat list and will not scale to MVP2.
- No search or categories in Node Library.
- Canvas has no useful empty state.
- No right-side Inspector.
- Too much configuration pressure will eventually move into node cards.
- Console permanently consumes vertical space.
- No Problems / Run / Artifacts dock model.
- Global execution state is not visually strong enough.
- `Connected` looks like developer/debug state instead of system health.
- `Open Output` is globally prominent even when no artifact context exists.
- No obvious project/workflow breadcrumb.
- No visible save state such as Saved / Unsaved.
- No clear History / Settings entry point.
- Existing visual styling is consistent enough for a prototype, but lacks a reusable product-level design system.

## 3. Target Workspace Architecture

Recommended desktop layout:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ App Rail │ Project / Workflow                    Save   ▶ Run   ⋯    │
├──────────┼───────────────┬─────────────────────────────┬────────────┤
│          │               │                             │            │
│ Projects │ Node Library  │                             │ Inspector  │
│ Workflow │               │          Canvas             │            │
│ History  │ Search        │                             │ Node       │
│          │ Categories    │                             │ Settings   │
│ Settings │               │                             │            │
│          │               │                             │            │
├──────────┴───────────────┴─────────────────────────────┴────────────┤
│ Console │ Problems │ Run │ Artifacts                       ▴        │
└──────────────────────────────────────────────────────────────────────┘
```

The Canvas remains the primary workspace and must receive the largest area.

## 4. Workspace Zones

### Zone A — App Navigation Rail

Use for app-level navigation:

- Workflow
- Projects
- History
- Settings

Keep narrow and icon-led.

### Zone B — Node Library

Only relevant inside workflow editing.

Contains:

- Search
- Categories
- Node items
- Drag source

It should be collapsible.

### Zone C — Canvas

Primary workspace.

Contains:

- React Flow graph
- Empty state
- Selection
- Edges
- Ports
- Zoom/Fit controls

### Zone D — Inspector

Context-sensitive right panel.

Modes:

```text
Nothing selected → Workflow Inspector
Node selected    → Node Inspector
Edge selected    → Connection Inspector
Running node     → Config + Run information
```

### Zone E — Bottom Dock

Tabs:

- Console
- Problems
- Run
- Artifacts

Collapsible and resizable.

## 5. Top Toolbar Redesign

Target:

```text
← Projects

My Project / Script Workflow
Saved

                              Undo  Redo  Save  ▶ Run  ⋯
```

During execution:

```text
My Project / Script Workflow
Running · 42%

                                           ■ Stop
```

Secondary actions belong under `⋯`.

`Open Output` should usually move into the Artifacts context rather than remain permanently prominent.

## 6. System Health Instead of "Connected"

Replace development-like connection text with a compact health indicator:

```text
● Ready
```

Optional popover:

```text
System Health

Tauri Backend    Ready
SQLite           Ready
FFmpeg           Ready
Gemini           Configured
```

## 7. Visual Direction

Void Workflow should feel like:

```text
Developer tool
+
Creative workflow application
+
Media production workspace
```

Avoid:

- Generic SaaS dashboard.
- Card-grid dashboard.
- Excessive neon.
- CapCut clone.
- Overly decorative canvas.
- Giant node cards.

Recommended style:

- Dark-first.
- Neutral surfaces.
- Restrained accent.
- Compact desktop density.
- Subtle borders.
- Consistent small radius.
- Strong semantic execution states.
- Functional typography.

## 8. Design System Foundation

Centralize tokens before screen redesign.

Suggested semantic tokens:

```text
surface.canvas
surface.sidebar
surface.panel
surface.elevated
surface.hover

border.default
border.subtle
border.focus

text.primary
text.secondary
text.muted
text.disabled

status.running
status.success
status.warning
status.error
status.queued
```

Use Tailwind/shadcn tokens where possible. Avoid raw color literals spread through components.

Typography target:

```text
Workflow title   14–16 semibold
Panel title      12–13 semibold
Node title       12–13 semibold
Body             12–13
Metadata         11–12
Logs             monospace 11–12
```

Spacing scale:

```text
4 / 8 / 12 / 16 / 20 / 24
```

## 9. Node Library Redesign

Target:

```text
Nodes

[ Search nodes... ]

INPUT
  Text Input
  Local File

TEXT
  Text Transform

AI
  AI Script

MEDIA
  Media Info
  Media Merge

UTILITY
  Delay
  Markdown Note

OUTPUT
  Save Artifact
  Preview
```

Node rows should contain:

- Icon
- Name
- Optional short description
- Drag affordance

Search should match:

- Name
- Category
- Description
- Keywords

Do not introduce complicated nested categories yet.

## 10. Empty Canvas State

When graph is empty:

```text
Build your workflow

Drag a node from the library

or start with:

[ Text → AI → Preview ]
[ Local Media → Info ]
```

Disappear when the first node is added.

## 11. Common Node Card System

Every executable node should use the same structural skeleton:

```text
┌─────────────────────────────┐
│ icon  Node Name        ⋯    │
│       summary               │
├─────────────────────────────┤
│ Essential value/result      │
├─────────────────────────────┤
│ ● input              output ●
├─────────────────────────────┤
│ ● Running              63%  │
└─────────────────────────────┘
```

Node cards SHOULD show:

- Identity
- Status
- Essential config summary
- Ports
- Key result summary
- Progress/error summary

Node cards SHOULD NOT contain:

- Large prompt editor
- Large text editor
- Raw JSON editor
- Complete FFmpeg config
- Full TTS config
- Full Whiteboard config
- API-key settings

Those belong in the Inspector.

Suggested widths:

```text
Compact: 200–220px
Default: 240–280px
Advanced media: 260–300px
```

## 12. Node Status System

Supported visual states:

```text
Idle
Queued
Running
Success
Warning
Failed
Cancelled
Skipped
```

Use restrained semantic indicators.

Do not saturate the entire node background.

Running should show progress only when real progress exists.

## 13. Typed Port Visual System

Ports should communicate type through more than color.

Initial families:

```text
Text
Number
Boolean
Json
File
Media
Audio
Video
Artifact
Any
```

Use a combination of:

- Shape
- Small icon
- Label
- Tooltip
- Color as secondary cue

Backend remains authoritative for validation.

## 14. Inspector Architecture

Standard Node Inspector:

```text
Node Name
Node Type / ID

[ Configuration ]
[ Input ]
[ Output ]
[ Run ]

Basic
...

Advanced
...

Danger
Delete Node
```

Simple nodes may not need tabs.

Complex MVP2 nodes may use:

```text
Settings
Items
Output
Run
```

Do not invent a unique inspector layout for every node.

## 15. Bottom Dock

Target tabs:

```text
Console
Problems
Run
Artifacts
```

Collapsed:

```text
Console · 0 errors     Run idle     Artifacts 0      ▴
```

Expanded dock is resizable.

### Console

Filters:

- All
- Info
- Warning
- Error
- System
- All Nodes / Selected Node

Example:

```text
12:04:11  AI Script  INFO  Calling Gemini
```

### Problems

Actionable issues:

```text
ERROR
Media Merge
Missing audio input.

WARNING
AI Script
Gemini API key is not configured.
```

Clicking a problem should focus/select the related node when possible.

### Run

Example:

```text
Workflow Run
Running · 42%

✓ Text Input
✓ Text Transform
● AI Script      63%
○ Save Artifact
○ Preview
```

### Artifacts

Example:

```text
script.txt
result.json
final.mp4
```

Actions:

- Preview
- Open
- Open Folder
- Copy Path

## 16. App-Level Screens

Keep simple:

### Projects

- New
- Open
- Rename
- Delete

### History

- Runs
- Status
- Duration
- Failed node
- Open run details

### Settings

- Gemini
- Output
- FFmpeg
- Concurrency
- System health

Canvas remains the main product surface.

---

# 17. UI IMPLEMENTATION PHASES

## UI PHASE 0 — Repository & Runtime Audit

Do not refactor yet.

Use relevant skills:

```text
audit-context-building
agent-browser
web-design-guidelines
react-best-practices
composition-patterns
```

Tasks:

- Map frontend component tree.
- Map React Flow setup.
- Map state stores.
- Map existing shadcn components.
- Map styling system.
- Locate hardcoded colors.
- Locate duplicated layout code.
- Map Tauri commands consumed by UI.
- Run current app.
- Reproduce current screenshot.
- Check console/runtime errors.
- Test resize.
- Inspect current save/run/console behavior.
- Identify native title/app-identity issues.

Deliverable:

```text
docs/ui/UI_AUDIT.md
```

Definition of Done:

The agent understands the current UI implementation and risks before editing it.

## UI PHASE 1 — UX Architecture

Freeze:

- App navigation.
- Top toolbar.
- Node Library.
- Canvas.
- Inspector.
- Bottom Dock.
- Global dialogs.
- Run states.
- Empty states.
- Selection states.

Deliverable:

```text
docs/ui/WORKSPACE_UX_SPEC.md
```

No major workspace-level UX ambiguity should remain.

## UI PHASE 2 — Design System

Use:

```text
frontend-design
shadcn
web-design-guidelines
```

Define:

- Tokens.
- Typography.
- Spacing.
- Radius.
- Borders.
- Icon rules.
- Status styles.
- Form density.
- Focus states.

Create reusable primitives:

```text
Panel
PanelHeader
ToolbarButton
StatusBadge
NodeStatus
InspectorSection
PropertyRow
EmptyState
DockTab
NodeLibraryItem
```

Deliverable:

```text
docs/ui/DESIGN_SYSTEM.md
```

## UI PHASE 3 — Workspace Shell

Implement:

- App Rail.
- Top Toolbar.
- Node Library container.
- Canvas container.
- Inspector placeholder.
- Bottom Dock.
- Collapse/resize behavior.

Keep existing workflow functionality wired.

This is the first major implementation milestone.

## UI PHASE 4 — Node Library

Implement:

- Search.
- Categories.
- Icons.
- Grouping.
- Drag behavior.
- Hover help.
- Empty search state.

Validate with current MVP1 nodes and optionally fake MVP2 library entries only for scalability testing.

Do not implement fake MVP2 behavior.

## UI PHASE 5 — Canvas Polish

Implement/review:

- Background.
- Controls.
- Port styles.
- Edge styles.
- Selection.
- Empty state.
- Zoom.
- Fit View.
- Minimap decision.
- Optional context menu only if justified.

Keep visual noise low.

## UI PHASE 6 — Inspector System

Build generic Inspector architecture.

First validate it using:

```text
Text Input
Text Transform
Delay
```

These cover:

- Text content.
- Mode/select.
- Numeric input.
- Simple advanced options.

Do not create node-specific inspector architecture yet.

## UI PHASE 7 — Observability Dock

Implement/connect:

```text
Console
Problems
Run
Artifacts
```

Use real execution state where already available.

Definition of Done:

A user can understand what is happening without opening developer tools.

## UI PHASE 8 — App Screens

Polish:

- Projects.
- History.
- Settings.

Keep these secondary to the workflow workspace.

## UI PHASE 9 — Accessibility & Interaction Audit

Use:

```text
web-design-guidelines
agent-browser
```

Audit:

- Keyboard.
- Focus.
- Contrast.
- Tooltips.
- Hit targets.
- Disabled state.
- Loading state.
- Error state.
- Resize.
- Overflow.
- Scroll behavior.

## UI PHASE 10 — Review & Cleanup

Use:

```text
improve
differential-review
react-best-practices
composition-patterns
```

Remove:

- Prototype styles.
- Duplicated layout components.
- Dead CSS.
- Hardcoded colors.
- Old sidebar implementation.
- Old console implementation.
- Temporary components.

Do not leave two competing UI systems.

---

# 18. UI Redesign Definition of Done

Before deep node design:

- Native app identity says Void Workflow instead of starter identity.
- Workspace information hierarchy is clear.
- Project/workflow context is visible.
- Save state is visible.
- Run state is visible.
- Node Library is searchable and categorized.
- Canvas remains primary.
- Empty state exists.
- Generic Inspector exists.
- Bottom Dock is collapsible/resizable.
- Console is usable.
- Problems are actionable.
- Run panel exists.
- Artifacts are discoverable.
- Common node card visual system exists.
- Typed ports have consistent presentation.
- Tokens are centralized.
- No obvious overflow.
- Existing workflow functionality remains operational.

---

# 19. NODE DESIGN PROGRAM AFTER UI FREEZE

Design nodes from simple to complex.

## Tier 1 — Simple

1. Text Input
2. Text Transform
3. Delay
4. Markdown Note

## Tier 2 — File / Output

5. Local File Input
6. Save Text
7. Save JSON
8. Save Artifact
9. Preview

## Tier 3 — External / Media

10. AI Script
11. Media Info
12. Media Merge

## Tier 4 — MVP2 Complex

13. Scene Parser
14. Batch Image
15. Local TTS
16. Scene Media Join
17. Whiteboard
18. Scene Assemble

Do not start node deep-design with Whiteboard or TTS.

---

# 20. Node Design Contract

Create one file per node:

```text
docs/nodes/<node-type>.md
```

Every node specification must define:

```text
1. Purpose
2. User Mental Model
3. Category
4. Inputs
5. Outputs
6. Config Schema
7. Basic Settings
8. Advanced Settings
9. Canvas Card
10. Inspector
11. Empty State
12. Running State
13. Success State
14. Warning State
15. Error State
16. Progress
17. Logs
18. Artifacts
19. Retry
20. Cancellation
21. Validation
22. Edge Cases
23. Accessibility
24. Acceptance Criteria
```

## Canvas Card vs Inspector Rule

Ask:

```text
Does the user need to see/change this while visually scanning the graph?
```

If yes:

```text
Canvas Card
```

If no:

```text
Inspector
```

Default complex configuration to Inspector.

---

# 21. Initial Node Design Directions

## Text Input

Canvas:

```text
Text Input
"Explain how testing..."

              text ●
```

Inspector:

- Multiline content.
- Optional trim-whitespace behavior.
- Character/word count.

Do not put a giant editor in the node.

## Text Transform

Canvas:

```text
Text Transform
Template

text ●       text ●
```

Inspector:

- Mode.
- Template editor.
- Optional transformation preview.

## Delay

Canvas:

```text
Delay
2 seconds

value ●      value ●
```

Inspector:

- Duration.

Running:

```text
1.2s remaining
```

Useful for validating execution animation/cancellation.

## Markdown Note

Visually distinct non-executable card.

No execution footer.

No runtime state.

Markdown editor belongs to inspector or controlled expanded editing state.

## Local File

Canvas:

```text
Local File
sample.mp4
Video · 18.3 MB

             file ●
```

Inspector:

- Path.
- Type.
- Size.
- Choose File.
- Reveal in Folder.

Missing file must be obvious.

## Save Nodes

Audit whether:

```text
Save Text
Save JSON
Save Artifact
```

need to stay separate.

Potential UI/runtime simplification:

```text
Save Artifact
```

with type-aware behavior.

Do not merge until runtime contracts are audited.

## Preview

Do not put full media player inside node.

Canvas shows concise summary.

Inspector/content area supports:

- Text.
- JSON.
- Image.
- Audio.
- Video.

## AI Script

Canvas:

```text
AI Script
Gemini
Explainer · Vietnamese

prompt ●      result ●
```

Inspector:

- Model.
- Prompt.
- System instructions.
- Output mode.
- Creativity.
- Structured schema.
- Timeout in Advanced.

Running:

```text
Generating...
```

Success summary:

- Word count, or
- Scene count.

## Media Info

Canvas:

```text
Media Info
1920×1080
30 fps · 04:22

media ●       info ●
```

Inspector:

- Container.
- Video.
- Audio.
- Streams.
- Raw ffprobe only under Advanced.

## Media Merge

Canvas:

```text
Media Merge
H.264 · 1080p

video ●
audio ●       video ●
```

Inspector:

- Audio mode.
- Duration mode.
- Output profile.
- Advanced codec/bitrate.

Running:

```text
Encoding 63%
```

---

# 22. MVP2 Batch Node UX Rule

Do not create one React Flow node per scene.

Example:

```text
Local TTS
8 / 20 complete
```

Inspector tabs:

```text
Settings
Items
Output
Run
```

Items:

```text
scene_001 ✓
scene_002 ✓
scene_003 ●
scene_004 ×
```

Same principle for:

- Batch Image.
- Local TTS.
- Whiteboard.

---

# 23. Whiteboard UI Direction

Do not finalize until renderer/runtime contract is stable.

Expected Inspector groups:

```text
Style
Direction
Hand
Timing
Canvas
Output
Preview
Advanced
```

Canvas should show only a concise summary such as:

```text
Whiteboard
Scanner · L → R
1080p · Match Audio
```

---

# 24. Documentation Structure

Recommended:

```text
docs/
├── ui/
│   ├── UI_AUDIT.md
│   ├── WORKSPACE_UX_SPEC.md
│   ├── DESIGN_SYSTEM.md
│   ├── NODE_VISUAL_SYSTEM.md
│   ├── INTERACTION_SPEC.md
│   └── ACCESSIBILITY_AUDIT.md
│
├── nodes/
│   ├── text-input.md
│   ├── text-transform.md
│   ├── delay.md
│   ├── markdown-note.md
│   ├── local-file.md
│   ├── save-artifact.md
│   ├── preview.md
│   ├── ai-script.md
│   ├── media-info.md
│   ├── media-merge.md
│   └── ...
│
└── UI_REDESIGN_STATUS.md
```

---

# 25. UI Status Tracking

Create:

```text
docs/UI_REDESIGN_STATUS.md
```

Use:

```text
NOT_STARTED
IN_PROGRESS
BLOCKED
IN_REVIEW
DONE
```

Track:

```text
Phase 0 — Audit
Phase 1 — UX Architecture
Phase 2 — Design System
Phase 3 — Workspace Shell
Phase 4 — Node Library
Phase 5 — Canvas
Phase 6 — Inspector
Phase 7 — Observability
Phase 8 — App Screens
Phase 9 — Accessibility
Phase 10 — Cleanup
```

Do not mix UI redesign status with MVP execution-engine status.

---

# 26. Agent Skills

Use skills intentionally.

Audit:

```text
audit-context-building
agent-browser
web-design-guidelines
react-best-practices
```

UX / Visual:

```text
frontend-design
shadcn
web-design-guidelines
```

React architecture:

```text
react-best-practices
composition-patterns
```

Debug:

```text
debugging-strategies
agent-browser
```

Review:

```text
improve
differential-review
web-design-guidelines
```

Do not let visual-design skills rewrite Rust workflow architecture.

---

# 27. Regression Rules

Every major UI refactor must preserve:

- Drag node.
- Connect nodes.
- Save workflow.
- Load workflow.
- Run workflow.
- Stop workflow.
- Existing logs.
- Existing node configuration.
- Existing backend IPC contracts unless a documented change is required.

Do not sacrifice functional behavior for visual polish.

---

# 28. Visual Acceptance Screenshots

Capture/review these states after relevant phases:

1. Empty canvas.
2. Workflow with 3–5 nodes.
3. Selected node + Inspector.
4. Workflow running.
5. Workflow failed.
6. Console expanded.
7. Problems panel.
8. Artifacts panel.
9. History.
10. Settings.

Review:

- Hierarchy.
- Alignment.
- Density.
- Spacing.
- Contrast.
- Overflow.
- Status clarity.

---

# 29. First Implementation Milestone

Do not start by polishing individual node cards.

The first implementation milestone is:

```text
NEW WORKSPACE SHELL
```

It contains:

- Top Toolbar.
- App Rail.
- Node Library container.
- Canvas.
- Inspector placeholder.
- Bottom Dock.

Existing functionality must remain connected.

Only after the shell is stable should individual nodes be redesigned.

---

# 30. Immediate Next Action

Start:

```text
UI PHASE 0 — Repository & Runtime Audit
```

Produce:

```text
docs/ui/UI_AUDIT.md
```

The audit should compare the current implementation and current screenshot against this target architecture.

After audit:

```text
UI PHASE 1 → WORKSPACE_UX_SPEC.md
UI PHASE 2 → DESIGN_SYSTEM.md
UI PHASE 3 → New Workspace Shell
```

Do not begin deep node-specific design until the workspace shell, Inspector, node visual system, and observability dock are stable.
