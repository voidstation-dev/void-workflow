# VOID WORKFLOW — LIGHT WORKFLOW BUILDER UI SPEC

**Status:** Proposed  
**Reference Direction:** Clean light workflow-builder UI inspired by the provided reference image  
**Target Stack:** Tauri v2 + React + TypeScript + React Flow + Tailwind CSS + shadcn/ui  
**Primary Goal:** Redesign Void Workflow into a clean, structured, professional visual workflow builder with a centered canvas, compact node cards, right-side Build panel, and minimal chrome.

## 1. Design Intent

The UI should feel like:

```text
Clean SaaS workflow builder
+
Professional desktop automation tool
+
Lightweight node editor
```

The experience should emphasize:
- clarity
- hierarchy
- calm spacing
- compact workflow cards
- low visual noise
- obvious drag-and-drop affordances
- easy scanning of execution logic
- right-side node/action library
- workspace-first layout

Avoid:
- heavy dark developer-tool styling
- giant node cards
- excessive borders
- neon accents
- generic dashboard card grids
- overuse of floating glass effects

## 2. High-Level Layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ Breadcrumb / Workflow name        Search                     Tools  │
├────────────────────────────────────────────────────────────────────┤
│ Workflow   Settings   Environment                                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│                      WORKFLOW CANVAS                               │
│                                                                    │
│       Start                                                        │
│         ↓                                                          │
│    [ Trigger Node ]                                                │
│         ↓                                                          │
│    [ Action Node ]                                                 │
│         ↓                                                          │
│   [ Conditional Node ]                                             │
│      ↙          ↘                                                  │
│ [Action]      [Action]                                             │
│                                                                    │
│                                                  ┌───────────────┐ │
│                                                  │ Build         │ │
│                                                  │ Search        │ │
│                                                  │ Categories    │ │
│                                                  │ Node Items    │ │
│                                                  └───────────────┘ │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ Outline  Detail     Undo Redo      100%      Fit                    │
└────────────────────────────────────────────────────────────────────┘
```

## 3. Core Workspace Areas

### A. Top Header

Use for workflow identity, search, and global actions.

Recommended Void Workflow version:

```text
Void Workflow / My Workflow

[ Search nodes, runs, settings... ]

                         History   Save   Run
```

Keep to ~5 primary actions maximum.

### B. Secondary Navigation

```text
Workflow
Settings
Runs
Environment
```

- **Workflow:** main canvas editor
- **Settings:** workflow-level execution settings
- **Runs:** run history and execution details
- **Environment:** system/provider health

## 4. Canvas

Use a very-light neutral, not pure white.

Suggested direction:

```text
Canvas: #F7F7F5 or #F8F9FB
Panel:  #FFFFFF
Border: subtle neutral
```

Optional dotted grid at very low opacity.

Default workflow direction:

```text
Top → Bottom
```

Branch horizontally when needed:

```text
Trigger
  ↓
Action
  ↓
Condition
 ↙   ↘
A     B
```

Users may still freely move nodes.

## 5. Start Marker

Use a compact pill:

```text
[ ▶ Start here ]
```

It is visual guidance, not a real node.

## 6. Node Card Style

Target:
- white
- compact
- lightly bordered
- 10–12px radius
- subtle shadow
- text-focused

Example:

```text
┌──────────────────────────────────┐
│ ✦  AI Script                     │
│    Generate structured script    │
│                                  │
│ Gemini       Structured JSON     │
└──────────────────────────────────┘
```

Suggested width:

```text
240–300px
```

Do not embed large forms in node cards.

## 7. Node Card Hierarchy

Show:
- icon
- title
- short description/status
- compact metadata
- ports
- execution state

Example:

```text
✦ AI Script
  Generate content with Gemini

Gemini   Structured JSON
```

Use small metadata chips:
- Gemini
- Verified
- JSON
- 1080p
- 30 fps
- 2 sec

Keep badges subtle.

## 8. Node Categories

Recommended:

```text
INPUTS
TEXT
AI
RULES
MEDIA
UTILITY
OUTPUT
```

MVP2 can add:

```text
IMAGE
AUDIO
VIDEO
```

## 9. Right-Side Build Panel

The right-side Build panel should be a major workspace element.

```text
┌──────────────────────────────┐
│ Build                     ˄  │
│ Drag block into workflow     │
│                              │
│ [ Search nodes... ]          │
│                              │
│ INPUTS                       │
│  Text Input                  │
│  Local File Input            │
│                              │
│ TEXT                         │
│  Text Transform              │
│                              │
│ AI                           │
│  AI Script                   │
│                              │
│ RULES / UTILITY              │
│  Delay                       │
│  Markdown Note               │
│                              │
│ MEDIA                        │
│  Media Info                  │
│  Media Merge                 │
│                              │
│ OUTPUT                       │
│  Save Artifact               │
│  Preview                     │
└──────────────────────────────┘
```

Recommended width:

```text
280–320px
```

Requirements:
- collapsible
- independently scrollable
- no overlap over the canvas
- convert to drawer/sheet at smaller window widths

## 10. Build Item

Example:

```text
┌─────────────────────────────┐
│ ✦ AI Script                 │
│   Generate script           │
└─────────────────────────────┘
```

Suggested:
- 42–48px tall
- subtle border
- white background
- 8px radius
- mild hover elevation
- whole row draggable

Support badges:

```text
New
Beta
Experimental
```

## 11. Connections

Prefer clean orthogonal or soft elbow connectors.

Default:
```text
1–1.5px subtle neutral
```

Selected:
```text
accent
```

Running:
```text
optional subtle animated dash
```

Avoid thick high-contrast edges.

## 12. Branch Labels

Support small path labels:

```text
Yes
No
Matched
Fallback
```

Example:

```text
          [ Condition ]
           /                Yes          No
         /                [Node A]        [Node B]
```

## 13. Current Void Node Examples

### Text Input

```text
┌─────────────────────────────┐
│ T  Text Input               │
│    Static workflow text     │
│                             │
│ "Explain testing..."        │
└─────────────────────────────┘
```

### Text Transform

```text
┌─────────────────────────────┐
│ Aa Text Transform           │
│    Transform text           │
│                             │
│ Template                    │
└─────────────────────────────┘
```

### Delay

```text
┌─────────────────────────────┐
│ ◷  Delay                    │
│    Pause workflow           │
│                             │
│ 2 seconds                   │
└─────────────────────────────┘
```

### AI Script

```text
┌─────────────────────────────┐
│ ✦ AI Script                 │
│   Gemini                    │
│                             │
│ Structured JSON             │
└─────────────────────────────┘
```

### Media Info

```text
┌─────────────────────────────┐
│ ◫ Media Info                │
│   Inspect media             │
│                             │
│ 1920×1080 · 30 fps          │
└─────────────────────────────┘
```

### Media Merge

```text
┌─────────────────────────────┐
│ ◉ Media Merge               │
│   Combine media             │
│                             │
│ H.264 · AAC                 │
└─────────────────────────────┘
```

## 14. Node States

Use small semantic treatments rather than recoloring entire cards.

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

Examples:

```text
● Running 63%
✓ Completed
! Warning
× Failed
```

Use real progress only when measurable.

## 15. Build Panel vs Inspector

Recommended behavior:

```text
Default:
Build Panel

Node selected:
Node Inspector replaces Build Panel

Deselect:
Return to Build Panel
```

Inspector header:

```text
← Back to Build
AI Script
```

This keeps the interface close to the visual hierarchy of the reference while still supporting complex nodes.

## 16. Node Inspector

Example:

```text
┌──────────────────────────────┐
│ ← Build                      │
│ AI Script                    │
│ Gemini                       │
│                              │
│ Prompt                       │
│ [.........................]  │
│                              │
│ Model                        │
│ [ Gemini ▼ ]                 │
│                              │
│ Output                       │
│ [ Structured JSON ▼ ]        │
│                              │
│ Advanced                     │
│ ▸                            │
└──────────────────────────────┘
```

Use Inspector for:
- text editors
- advanced node settings
- model selection
- codec options
- TTS options
- Whiteboard options

Do not place these directly inside React Flow cards.

## 17. Bottom Canvas Toolbar

Reference-inspired toolbar:

```text
Outline
Detail

Undo
Redo

Fit
− 100% +
```

Optional:
```text
Minimap
```

Prefer this over the default vertical React Flow control stack if it better matches the final visual language.

## 18. Outline / Detail Modes

### Outline

Show:
- icon
- title
- status
- minimal metadata

### Detail

Show:
- title
- description
- metadata
- ports
- execution state

Useful for large workflows.

## 19. Header States

### Idle

```text
Workflow / Script Generator
Saved

                         Save   Run
```

### Running

```text
Workflow / Script Generator
Running · 42%

                                Stop
```

### Failed

```text
Workflow / Script Generator
Run failed

                         Retry Failed
```

### Completed

```text
Workflow / Script Generator
Completed

                         Open Output
```

Only make `Open Output` prominent when output actually exists.

## 20. Environment Tab

Suggested content:

```text
Environment

Tauri Backend    Ready
SQLite           Ready
FFmpeg           Ready
FFprobe          Ready
Gemini           Configured
Storage          Ready
```

MVP2 later:

```text
Python Worker
VieNeu
Pexels
Whiteboard Renderer
```

## 21. Settings Tab

Workflow-level settings:

```text
Name
Description

Execution
- API concurrency
- Media concurrency

Output
- Default folder
- Default resolution

Behavior
- Auto save
```

## 22. Run History

Suggested:

```text
Today

✓ Video Script Workflow
  12:02 · 21 sec

× Merge Test
  11:44
  Failed at Media Merge
```

Keep full run history outside the canvas.

## 23. Artifacts

When workflow completes:

```text
Output ready

final.mp4

[Preview]
[Open Folder]
```

Artifacts may appear in:
- run detail
- Preview node
- contextual output panel
- header only after completion

## 24. Visual Tokens

Suggested direction:

```text
Canvas           #F7F7F5
Panel            #FFFFFF
Header           #FFFFFF
Border           #E6E7E9
Text Primary     #17181A
Text Secondary   #64676D
Muted            #92969E
Accent           #5267E9
```

Semantic success/warning/error should use muted tones.

Centralize as design tokens.

## 25. Radius & Shadow

Recommended:

```text
Node:    10–12px
Panel:   12px
Button:  7–9px
Chip:    5–6px
```

Shadow direction:

```text
0 2px 8px rgba(0,0,0,0.05)
```

Selected card:
- slightly stronger shadow
- accent outline

## 26. shadcn/ui

Use shadcn where appropriate:

```text
Button
Input
Textarea
Select
Tabs
Tooltip
Popover
Dropdown Menu
Context Menu
Dialog
Sheet
ScrollArea
Separator
Badge
Progress
Collapsible
Command
Resizable
```

Do not blindly use shadcn demo styles.

Apply Void Workflow tokens.

## 27. Reusable Components

Create/reuse:

```text
WorkflowHeader
WorkflowTabs

BuildPanel
BuildCategory
BuildNodeItem

WorkflowNode
NodeHeader
NodeMeta
NodeStatus

StartMarker

NodeInspector
InspectorSection
PropertyRow

CanvasToolbar
ZoomControls

RunStatus
EnvironmentStatus
```

Avoid a separate visual shell for every node.

## 28. Suggested React Structure

Conceptual only:

```text
src/
├── workspace/
│   ├── WorkflowWorkspace.tsx
│   ├── WorkflowHeader.tsx
│   ├── WorkflowTabs.tsx
│   ├── WorkflowCanvas.tsx
│   ├── BuildPanel.tsx
│   ├── NodeInspector.tsx
│   └── CanvasToolbar.tsx
│
├── nodes/
│   ├── base/
│   │   ├── WorkflowNode.tsx
│   │   ├── NodeHeader.tsx
│   │   ├── NodeMeta.tsx
│   │   └── NodeStatus.tsx
│   └── types/
│
└── components/
```

Do not force this if the existing codebase already has a good equivalent.

## 29. Desktop Behavior

Primary target:

```text
Desktop
```

Recommended minimum comfortable width:

```text
1280px
```

Suggested Tauri minimum:

```text
1200 × 760
```

Suggested default:

```text
1440 × 900
```

At smaller widths:
- Build panel becomes collapsible
- Inspector replaces Build panel
- Canvas remains primary

Do not optimize for phone layouts.

## 30. Interaction Model

### Drag node

```text
Build Panel
→ drag
→ Canvas
→ create node
```

### Click node in Build Panel

Optional:

```text
Add near viewport center
```

### Select workflow node

```text
Build Panel
→ Inspector
```

### Deselect

```text
Inspector
→ Build Panel
```

## 31. Empty Workflow

Use:

```text
[ ▶ Start here ]

Drag a block from Build

or

+ Add first node
```

Clicking `Add first node` may focus Build search.

## 32. Node Card vs Inspector Rule

Mandatory:

```text
Node card = summary
Inspector = configuration
```

Ask for every setting:

> Does the user need this while visually scanning the workflow?

If not, place it in Inspector.

## 33. MVP2 Scalability

The same shell must support:

```text
Scene Parser
Batch Image
Local TTS
Scene Media Join
Whiteboard
Scene Assemble
```

Do not create one React Flow node per scene.

Batch detail belongs in Inspector.

Example:

```text
Local TTS
8 / 20 complete
```

Inspector:

```text
Settings
Items
Output
Run
```

## 34. Whiteboard Future UI

Canvas:

```text
Whiteboard
Scanner · L → R
1080p · Match Audio
```

Inspector:

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

## 35. Migration from Current UI

Current direction:

```text
Dark shell
Left Node Library
Large empty canvas
Fixed Console
Open Output / Save / Run
```

Migration:

```text
1. Introduce light semantic tokens.
2. Replace current top bar with workflow header.
3. Add Workflow / Settings / Runs / Environment tabs.
4. Move Node Library to right Build panel.
5. Group nodes by category.
6. Create shared compact WorkflowNode card.
7. Move detailed configuration into Inspector.
8. Restyle React Flow canvas and connectors.
9. Add bottom horizontal canvas toolbar.
10. Replace fixed console with contextual Run/Logs surface.
11. Polish Settings / Environment / History.
12. Deep-design each node only after shared shell stabilizes.
```

## 36. Implementation Phases

### UI Phase 0 — Audit

Inspect:
- React Flow setup
- node components
- sidebar
- console
- toolbar
- state
- shadcn
- Tailwind
- Tauri IPC

Deliver:

```text
docs/ui/UI_AUDIT.md
```

### UI Phase 1 — Light Design System

Implement:
- surfaces
- borders
- text
- accent
- semantic execution colors
- typography
- spacing
- radius
- shadow

Deliver:

```text
docs/ui/LIGHT_DESIGN_SYSTEM.md
```

### UI Phase 2 — Header & Tabs

Build:

```text
WorkflowHeader
WorkflowTabs
```

### UI Phase 3 — Build Panel

Build:
- right-side panel
- category groups
- search
- draggable rows
- scrolling
- collapse

### UI Phase 4 — Common Node Visual System

Build:

```text
WorkflowNode
NodeHeader
NodeMeta
NodeStatus
```

Convert first:
- Text Input
- Text Transform
- Delay
- Markdown Note

### UI Phase 5 — Inspector

Implement Build ↔ Inspector behavior.

Start with:
- Text Input
- Text Transform
- Delay

### UI Phase 6 — Canvas Styling

Implement:
- light canvas
- grid
- edges
- selection
- start marker
- bottom toolbar
- zoom
- branch labels

### UI Phase 7 — Remaining MVP1 Nodes

Convert:
- AI Script
- Local File
- Media Info
- Save Artifact
- Media Merge
- Preview

Audit whether Save Text / Save JSON / Save Artifact should remain separate.

### UI Phase 8 — Run / Logs UX

Replace fixed Console with cleaner contextual execution UI.

Possible:
- bottom drawer
- Runs tab

Preserve backend logging.

### UI Phase 9 — Settings / Environment / History

Keep simple and consistent.

### UI Phase 10 — Review

Use:
- frontend-design
- shadcn
- react-best-practices
- composition-patterns
- web-design-guidelines
- agent-browser
- improve
- differential-review

Validate:
- layout
- interactions
- resizing
- runtime errors
- regression
- accessibility

## 37. Agent Skill Routing

Visual design:

```text
frontend-design
web-design-guidelines
```

shadcn:

```text
shadcn
```

React:

```text
react-best-practices
composition-patterns
```

Runtime verification:

```text
agent-browser
debugging-strategies
```

Review:

```text
improve
differential-review
```

## 38. Architecture Rules

Preserve:

```text
React Flow = presentation
Rust = execution
Tauri = native boundary
SQLite = metadata
Filesystem = artifacts
```

Do not move workflow execution into React.

Do not spawn FFmpeg, FFprobe, or Python from frontend.

## 39. Acceptance Criteria

The redesign is complete when:

- Void Workflow uses the new light workspace shell.
- Workflow context is clear in the header.
- Secondary tabs exist.
- Build panel exists on the right.
- Build panel is categorized and searchable.
- Canvas is visually clean and central.
- Node cards are compact.
- Node configuration lives in Inspector.
- Start marker exists.
- Bottom canvas controls exist.
- Edges are subtle and readable.
- Execution state remains clear.
- Existing drag/connect/save/run behavior still works.
- No major overflow exists.
- Layout scales to future MVP2 nodes.

## 40. Reference Principle

Treat the provided image as:

```text
visual direction
+
layout inspiration
+
interaction hierarchy
```

not a pixel-for-pixel clone.

Void Workflow should keep its own:
- branding
- node taxonomy
- workflow runtime
- media features
- execution states
- desktop/Tauri behavior

The final result should feel similar in polish and structure while remaining clearly Void Workflow.
