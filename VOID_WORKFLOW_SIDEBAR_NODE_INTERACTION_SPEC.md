# VOID WORKFLOW — SIDEBAR, NODE CARD & NODE INTERACTION UI SPEC

**Status:** Proposed  
**Scope:** Right Build Sidebar, richer node cards, contextual node toolbar, node selection, duplicate/delete/add/edit actions, and double-click configuration/preview behavior.  
**Target Stack:** Tauri v2 + React + TypeScript + React Flow + Tailwind CSS + shadcn/ui  
**Design Direction:** Clean light workflow-builder UI inspired by the provided reference, adapted to Void Workflow.

---

# 1. Goal

This document extends `VOID_WORKFLOW_LIGHT_UI_SPEC.md`.

The goal is to make the workflow editor feel much closer to the provided reference while adding richer node interactions:

```text
Right Build Sidebar
+
Compact node cards
+
Single-click selection
+
Floating node toolbar
+
Add / Duplicate / Edit / Delete
+
Double-click Configure / Preview
+
Reusable Inspector / Node Detail system
```

The key product principle:

> Keep the graph compact and readable. Show detailed configuration only when the user asks for it.

---

# 2. Target Workspace

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Workflow / Video Generator               Search...             Save   Run │
├────────────────────────────────────────────────────────────────────────────┤
│ Workflow    Settings    Runs    Environment                               │
├───────────────────────────────────────────────────────────┬────────────────┤
│                                                           │                │
│                                                           │ BUILD          │
│                                                           │ Drag blocks... │
│                  WORKFLOW CANVAS                          │                │
│                                                           │ Search         │
│              [ ▶ Start here ]                             │                │
│                    │                                      │ INPUTS         │
│             [ Text Input ]                                │ Text Input     │
│                    │                                      │ Local File     │
│             [ AI Script ]                                 │                │
│                    │                                      │ TEXT           │
│             [ Save Output ]                               │ Transform      │
│                                                           │                │
│                                                           │ AI             │
│                                                           │ AI Script      │
│                                                           │                │
│                                                           │ MEDIA          │
│                                                           │ Media Info     │
│                                                           │ Media Merge    │
│                                                           │                │
│                                                           │ OUTPUT         │
│                                                           │ Preview        │
├───────────────────────────────────────────────────────────┴────────────────┤
│ Outline  Detail      Undo Redo       Fit       − 100% +                    │
└────────────────────────────────────────────────────────────────────────────┘
```

---

# 3. Right Build Sidebar

## Purpose

The sidebar should answer:

```text
What blocks are available?
Where is the block I need?
Can I drag it directly into the workflow?
```

Recommended dimensions:

```text
Default width: 300px
Min: 260px
Max: 360px
```

Behavior:

- fixed inside editor
- independently scrollable
- collapsible
- never overlaps Canvas
- Canvas expands when collapsed

---

# 4. Sidebar Header

```text
Build                          ˄
Drag block into the workflow
```

Recommended:

```text
title: 13–14px semibold
helper: 11–12px muted
height: 48–56px
border-bottom: subtle
```

Include collapse control.

---

# 5. Sidebar Search

Place immediately below header:

```text
[ Search blocks... ]
```

Search should match:

- node name
- category
- description
- aliases
- keywords

Examples:

```text
video → Media Info, Media Merge, Preview
save  → Save Text, Save JSON, Save Artifact
ai    → AI Script
```

Optional shortcut:

```text
/
```

when focus is not inside another form field.

---

# 6. Sidebar Categories

Recommended current order:

```text
INPUTS
TEXT
AI
RULES
MEDIA
UTILITY
OUTPUT
```

Current MVP nodes:

```text
INPUTS
- Text Input
- Local File Input

TEXT
- Text Transform

AI
- AI Script

RULES
- Delay

MEDIA
- Media Info
- Media Merge

UTILITY
- Markdown Note

OUTPUT
- Save Text
- Save JSON
- Save Artifact
- Preview
```

Future:

```text
IMAGE
- Batch Image

AUDIO
- Local TTS

VIDEO
- Whiteboard
- Scene Assemble
```

---

# 7. Sidebar Category Header

Example:

```text
AI        New
```

Style:

```text
10–11px
muted semibold
small vertical spacing
```

Badges:

```text
New
Beta
Experimental
```

Only use them when they carry real meaning.

---

# 8. Sidebar Block Row

Reference-inspired:

```text
┌───────────────────────────────┐
│ ✦  AI Script                  │
│    Generate content           │
└───────────────────────────────┘
```

Recommended:

```text
height: 44–52px
padding: 8–10px
radius: 8–9px
border: subtle
background: white
```

Hover:

- darker border
- tiny shadow/elevation
- `cursor: grab`

Dragging:

- `cursor: grabbing`
- ghost preview
- Canvas drop feedback

---

# 9. Sidebar Descriptions

Use short action descriptions.

```text
Text Input
Provide static text

Text Transform
Modify or template text

AI Script
Generate content with Gemini

Media Info
Inspect media metadata

Media Merge
Combine video and audio

Preview
Preview workflow output
```

One line whenever practical.

---

# 10. Build Sidebar vs Inspector

Default:

```text
Build Sidebar
```

Node selected:

```text
Build Sidebar
→ Node Inspector
```

Inspector header:

```text
← Build

AI Script
Generate structured script
```

Deselect:

```text
Inspector
→ Build Sidebar
```

Use one right-side panel instead of permanently showing Build + Inspector simultaneously.

---

# 11. Common Node Card

All executable nodes share one shell.

```text
┌────────────────────────────────────┐
│ [icon] Node Name              ⋯    │
│        short description           │
│                                    │
│ key config / result summary        │
│                                    │
│ input ●                     ● output│
└────────────────────────────────────┘
```

Recommended:

```text
width: 240–290px
min-height: 76px
radius: 10–12px
background: white
border: subtle neutral
shadow: very soft
```

Node cards are not forms.

---

# 12. Node Card Hierarchy

### Header

```text
Icon
Node title
Overflow menu
```

### Description

Short task-oriented description.

### Metadata

Only useful scan-level information:

```text
Gemini · Structured JSON
1080p · 30fps
2 sec
Video · 18.3MB
```

### Ports

Keep compact.

### Runtime

Show only when relevant:

```text
Running 63%
Completed
Failed
```

---

# 13. Node Icon Treatment

Recommended:

```text
28–32px container
soft tint
8px radius
```

Category direction:

```text
Text     soft blue-gray
AI       soft violet
Media    soft cyan
Utility  soft gray
Output   soft green
```

Avoid saturated category coloring.

---

# 14. Selected Node State

Selected:

```text
accent border
slightly stronger shadow
optional subtle outer ring
```

Do not recolor the entire card.

Selected state must remain obvious at low zoom.

---

# 15. Hover State

Hover may:

- darken border slightly
- increase shadow slightly
- make ports easier to see
- reveal lightweight interaction affordance

Do not show the full toolbar on hover.

Full toolbar appears on selection.

---

# 16. Floating Node Toolbar

When selected, show a compact floating toolbar above the node.

```text
        ┌──────────────────────────────┐
        │ +  ⧉  ✎  ⋯  🗑             │
        └──────────────────────────────┘
                 Selected Node
```

Actions:

```text
Add Next
Duplicate
Edit / Configure
More
Delete
```

Use icons plus Tooltips.

---

# 17. Toolbar Position

Default:

```text
top-center
8–12px above selected node
```

If toolbar would leave viewport:

- flip below node
- shift horizontally inside viewport

Toolbar should remain correctly positioned during:

- pan
- zoom
- node drag
- viewport resize

Prefer React Flow/xyflow `NodeToolbar` or equivalent current API over manually calculating viewport coordinates.

---

# 18. Toolbar Visual Style

```text
white background
subtle 1px border
small shadow
8–10px radius
height: 32–36px
```

Buttons:

```text
28–32px
```

Every icon button needs:

- Tooltip
- aria-label
- keyboard focus
- visible focus ring

---

# 19. Add Next

Action:

```text
+ Add Next
```

Behavior:

1. Open small node picker.
2. Show Suggested blocks first.
3. User selects block.
4. Create new node below current node.
5. Automatically connect `current → new`.
6. Select new node.
7. Open Inspector automatically if configuration is required.

Example:

```text
Text Input
   ↓
AI Script
```

---

# 20. Add Next Picker

Use a compact shadcn `Popover + Command`.

```text
Add next step

[ Search... ]

Suggested
- Text Transform
- AI Script
- Save Artifact
- Preview

All Blocks
...
```

Suggested options may be based on:

- output port type
- common next nodes
- category compatibility

Do not introduce AI recommendation logic yet.

---

# 21. Duplicate

Toolbar icon:

```text
Copy
```

Behavior:

- clone config
- create new node ID
- place clone ~24px offset
- select cloned node
- preserve workflow validity

Default:

```text
Do NOT duplicate edges
```

Possible future More action:

```text
Duplicate with connections
```

---

# 22. Edit / Configure

Toolbar icon:

```text
Pencil / Sliders
```

Behavior:

```text
open Node Inspector
```

If the node is already selected and Inspector visible:

```text
focus first primary configuration field
```

Equivalent actions:

- toolbar Edit
- double-click
- Enter when node selected

---

# 23. Delete

Toolbar:

```text
Trash
```

Behavior:

- remove node
- remove connected edges according to existing graph behavior
- mark workflow dirty

For trivial nodes:

```text
delete directly
```

For nodes with important unsaved config/artifact relationships:

Optional lightweight confirmation.

Avoid confirmation fatigue.

---

# 24. More Menu

Suggested:

```text
Configure
Run This Node        if supported
Duplicate
Disable              if backend supports
Copy Node
Copy Node ID
Reset Configuration
Delete
```

Never expose runtime actions that backend does not actually support.

---

# 25. Single Click

```text
Single click
→ select node
→ floating toolbar appears
→ right Build panel becomes Inspector
```

Single click should not open a modal.

---

# 26. Double Click

Required:

```text
Double click
→ open node Configure / Preview detail
```

For simple nodes:

```text
expand Inspector
```

For richer nodes/media:

```text
open large right-side Node Detail Sheet
```

Recommended width:

```text
420–520px
```

Do not open separate native windows for normal node configuration.

---

# 27. Node Detail Panel

Generic component:

```text
NodeDetailPanel
```

Recommended tabs:

```text
Configure
Input
Output
Run
```

Media-capable nodes may add:

```text
Preview
```

Batch nodes later may add:

```text
Items
```

Avoid unique panel architecture per node.

---

# 28. Configure Tab

Editable node configuration.

Example AI Script:

```text
Model
[ Gemini ▼ ]

Prompt
[ multiline editor ]

Output
[ Structured JSON ▼ ]

Advanced
[ ... ]
```

Simple settings may update immediately.

Complex forms may use:

```text
Apply
Cancel
```

only when partial invalid state would be problematic.

---

# 29. Input Tab

Display current resolved upstream input.

Examples:

```text
Text
JSON
File
Media
```

This tab is primarily inspect/debug.

Do not allow arbitrary mutation of resolved upstream values unless node semantics explicitly support it.

---

# 30. Output Tab

Show latest successful node output.

Examples:

```text
Generated text
JSON
File
Artifact
Image
Audio
Video
```

Actions when relevant:

```text
Copy
Open
Preview
Open Folder
```

---

# 31. Run Tab

Show:

```text
Last Run
Status
Duration
Progress
Logs
Error
Retry
```

Only show Retry when execution engine supports it.

---

# 32. Preview Tab

Standardize preview by artifact/output type.

```text
Text  → formatted text viewer
JSON  → structured tree/code viewer
Image → image viewer
Audio → audio player
Video → video player
Media Info → structured metadata
```

Preview should not be reinvented per node.

---

# 33. Inline Add Between Connected Nodes

Recommended later interaction:

```text
A ───── + ───── B
```

When hovering connection:

```text
show small +
```

Click:

1. open node picker
2. select new block
3. change:

```text
A → B
```

to:

```text
A → New → B
```

This interaction closely matches the reference workflow-builder feel.

Implement after standard node creation and connection behavior is stable.

---

# 34. Primary Flow Direction

Favor:

```text
top → bottom
```

with horizontal branch expansion.

Default newly connected node position:

```text
below current node
```

Do not prevent free manual placement.

---

# 35. Ports

For simple vertical flow:

```text
input: top-center
output: bottom-center
```

For nodes with multiple distinct inputs:

```text
inputs on left
output on right or bottom
```

Example Media Merge:

```text
video ●
audio ●   [ Media Merge ]   ● video
```

Branch nodes later:

```text
True / False
```

can use separate bottom outputs.

---

# 36. Port Visual Style

Recommended:

```text
visual diameter: 6–8px
interaction hit target: 12–16px
```

Communicate type with:

- shape
- label
- icon
- color only as secondary cue

Avoid large colored handles.

---

# 37. Running State

Example:

```text
┌─────────────────────────────┐
│ ✦ AI Script                 │
│   Generating...             │
│                             │
│ 63%                         │
│ ━━━━━━━━━━━━━━━░░░░         │
└─────────────────────────────┘
```

When exact percentage is unavailable:

```text
Generating...
```

Do not fake progress.

Toolbar while running should avoid unsafe destructive config actions.

Possible running toolbar:

```text
View
Open Run
Cancel
```

only when supported.

---

# 38. Success State

Keep subtle:

```text
✓ Completed · 1.4s
```

No full green card.

---

# 39. Failed State

Example:

```text
× Failed
Missing Gemini API key
```

Card:

```text
subtle danger border
```

Toolbar:

```text
Retry
Edit
Delete
```

where supported.

Error must be visible on node, not Console-only.

---

# 40. Disabled Node

Only implement if backend/runtime supports disabling.

Visual:

```text
60% opacity
subtle dashed border
Disabled badge
```

Never create UI-only disabled semantics.

---

# 41. Markdown Note

Non-executable node should look intentionally different.

```text
┌──────────────────────────────┐
│ Note                         │
│                              │
│ Explain the next stage...    │
└──────────────────────────────┘
```

Use:

```text
soft warm neutral background
no runtime status
no executable ports unless intentionally supported
```

Toolbar:

```text
Edit
Duplicate
Delete
```

---

# 42. Text Input

## Card

```text
┌──────────────────────────────┐
│ T  Text Input                │
│    Static workflow text      │
│                              │
│ "Explain software testing…"  │
└──────────────────────────────┘
```

## Inspector

```text
Content

[ multiline editor ]

Text Info
248 chars · 42 words

Options
Trim whitespace     ON
```

Double-click:

```text
open/focus Content editor
```

---

# 43. Text Transform

## Card

```text
┌──────────────────────────────┐
│ Aa Text Transform            │
│    Template                  │
│                              │
│ {{input}} → transformed text │
└──────────────────────────────┘
```

## Inspector

```text
Mode
[ Template ▼ ]

Template
[ Write a script about {{input}} ]

Preview
[input]
↓
[result]
```

---

# 44. Delay

## Card

```text
┌──────────────────────────────┐
│ ◷ Delay                      │
│   Wait before continuing     │
│                              │
│ 2 seconds                    │
└──────────────────────────────┘
```

## Inspector

```text
Duration
[ 2.0 ] seconds
```

Running:

```text
1.2 sec remaining
```

---

# 45. AI Script

## Card

```text
┌──────────────────────────────┐
│ ✦ AI Script                  │
│   Generate with Gemini       │
│                              │
│ Gemini · Structured JSON     │
└──────────────────────────────┘
```

## Inspector

```text
Provider
Model

Prompt
System Instructions

Output
Text / JSON / Structured

Generation
Temperature

Advanced
Timeout
Schema
```

Double-click:

```text
open detail
focus Prompt
```

Output tab:

```text
generated script
word count
scene count
copy
save
```

---

# 46. Local File Input

## Card

```text
┌──────────────────────────────┐
│ ↑ Local File                 │
│   sample.mp4                 │
│                              │
│ Video · 18.3 MB              │
└──────────────────────────────┘
```

## Inspector

```text
Selected File
sample.mp4

Path
C:\...

Type
video/mp4

Size
18.3 MB

[ Choose File ]
[ Reveal in Folder ]
```

Preview according to file type.

Missing-file state must be explicit.

---

# 47. Media Info

## Card

```text
┌──────────────────────────────┐
│ ◫ Media Info                 │
│   Inspect media              │
│                              │
│ 1920×1080 · 30fps · 04:22    │
└──────────────────────────────┘
```

## Inspector

Tabs:

```text
Summary
Video
Audio
Raw
```

Raw FFprobe output is Advanced only.

---

# 48. Save Text

## Card

```text
┌──────────────────────────────┐
│ ↓ Save Text                  │
│   Write text artifact        │
│                              │
│ script.txt                   │
└──────────────────────────────┘
```

Inspector:

```text
Filename
Output Directory
Overwrite behavior
```

---

# 49. Save JSON

## Card

```text
┌──────────────────────────────┐
│ { } Save JSON                │
│     Write JSON artifact      │
│                              │
│ result.json                  │
└──────────────────────────────┘
```

Inspector:

```text
Filename
Formatting
Pretty / Compact
Output Directory
```

---

# 50. Save Artifact

## Card

```text
┌──────────────────────────────┐
│ ↓ Save Artifact              │
│   Persist workflow output    │
│                              │
│ Automatic type               │
└──────────────────────────────┘
```

Inspector:

```text
Filename
Location
Artifact type
Overwrite behavior
```

Audit whether Save Text / Save JSON should eventually merge into this node, but do not change runtime contracts for visual reasons alone.

---

# 51. Media Merge

## Card

```text
┌──────────────────────────────┐
│ ◉ Media Merge                │
│   Combine video + audio      │
│                              │
│ H.264 · AAC · 1080p          │
└──────────────────────────────┘
```

Inspector:

```text
Audio Mode
Replace / Mix

Duration
Shortest / Video / Audio

Output
1080p
30fps

Advanced
Video codec
Audio codec
Bitrate
```

Preview tab:

```text
last generated video
```

Run tab:

```text
FFmpeg progress
logs
duration
```

---

# 52. Preview Node

## Card

```text
┌──────────────────────────────┐
│ ▶ Preview                    │
│   Inspect workflow output    │
│                              │
│ Video · 04:22                │
└──────────────────────────────┘
```

Double-click:

```text
open Preview immediately
```

Supports:

```text
Text
JSON
Image
Audio
Video
```

Never embed a full media player into the node card.

---

# 53. Right-Click Context Menu

Recommended:

```text
Configure
Add Next
Duplicate
Copy
Delete
```

Canvas context menu:

```text
Add Node
Paste
Fit View
```

Use shadcn `ContextMenu`.

---

# 54. Keyboard Interaction

Recommended:

```text
Delete            delete selected
Ctrl/Cmd + D      duplicate
Enter             configure
Ctrl/Cmd + C      copy selected node
Ctrl/Cmd + V      paste
Esc               close detail / deselect
F                 fit view
```

Ignore workflow shortcuts while typing in form fields.

---

# 55. Multi-Selection

For multiple selected nodes:

Show group toolbar:

```text
Duplicate
Delete
Align
```

Do not show single-node Configure.

Keep Inspector generic:

```text
3 nodes selected
```

---

# 56. Node Creation Behavior

Dragging from sidebar:

```text
drag
→ drop
→ create
→ select
```

For configuration-heavy nodes:

```text
AI Script
Local File
Media Merge
```

Inspector may open automatically.

Simple nodes can be created with defaults.

---

# 57. Node Defaults

Use sensible defaults.

Examples:

```text
Delay
2 seconds

AI Script
Gemini / default supported model

Media Merge
H.264 + AAC
```

Do not force every new node through a blocking setup modal.

---

# 58. Workflow Dirty State

After:

- move node
- change config
- add/delete node
- change connection

Header:

```text
Unsaved
```

After successful save:

```text
Saved
```

---

# 59. Inspector Form Behavior

Simple node:

```text
update immediately
mark workflow dirty
```

Complex node:

```text
local draft
Apply / Cancel
```

Use explicit Apply only when needed.

---

# 60. Validation UX

Invalid node config:

Card:

```text
! Configuration required
```

Inspector:

```text
field-level validation
```

Problems/Run system may repeat the issue.

Do not rely only on toast messages.

---

# 61. Generic Node Detail Component

Create/reuse conceptually:

```text
NodeDetailPanel
```

Responsibilities:

```text
node identity
Configure tab
Input tab
Output tab
Preview tab
Run tab
```

Nodes provide content/config schema.

Do not create a custom sheet implementation for every node type.

---

# 62. Suggested UI Components

```text
BuildSidebar
BuildSearch
BuildSection
BuildNodeItem

WorkflowNode
WorkflowNodeIcon
WorkflowNodeMeta
WorkflowNodeStatus

NodeFloatingToolbar
NodeOverflowMenu

NodeInspector
NodeDetailPanel
NodeDetailTabs

AddNextPopover
ConnectionInsertButton

CanvasToolbar
WorkflowStartMarker

TypedPort
BranchLabel
```

---

# 63. shadcn Components

Recommended:

```text
Button
Tooltip
Popover
Command
ContextMenu
DropdownMenu
Sheet
Tabs
ScrollArea
Separator
Badge
Progress
Collapsible
ResizablePanel
Input
Textarea
Select
Switch
```

Reuse project components first.

Do not blindly use shadcn demo styling.

---

# 64. React / React Flow Rules

Before implementing custom floating positioning, inspect the current React Flow/xyflow APIs.

Prefer library-aware primitives such as:

```text
NodeToolbar
Panel
Handle
```

where they solve viewport transformation correctly.

Avoid manual absolute-position calculations that break on pan/zoom.

---

# 65. Interaction State Machine

```text
NO_SELECTION
→ Build Sidebar

NODE_SELECTED
→ Floating Toolbar
→ Inspector

NODE_DOUBLE_CLICKED
→ Expanded Node Detail / Preview

NODE_RUNNING
→ Run-aware Inspector
→ restricted unsafe actions

MULTI_SELECTED
→ Group Toolbar

ESC
→ close detail
→ deselect
→ Build Sidebar
```

---

# 66. Implementation Phases

## Phase A — Sidebar

Implement:

- right Build sidebar
- categories
- search
- block rows
- scrolling
- collapse

## Phase B — Shared Node Card

Implement:

- common shell
- icon
- title
- description
- metadata
- status
- ports

Convert:

- Text Input
- Text Transform
- Delay
- Markdown Note

## Phase C — Selection Toolbar

Implement:

- selected state
- floating toolbar
- Add Next
- Duplicate
- Configure
- More
- Delete

## Phase D — Inspector

Implement:

```text
Build ↔ Inspector
```

Start with:

- Text Input
- Text Transform
- Delay

## Phase E — Double Click / Detail

Implement generic `NodeDetailPanel`.

Support:

```text
Configure
Input
Output
Run
Preview
```

as appropriate.

## Phase F — Remaining MVP1 Nodes

Deep-design:

- AI Script
- Local File
- Media Info
- Save Text
- Save JSON
- Save Artifact
- Media Merge
- Preview

## Phase G — Connection Insert

After normal graph operations are stable:

```text
hover edge
→ +
→ insert node
```

## Phase H — Review

Validate:

- selection
- toolbar positioning
- pan/zoom
- duplicate
- delete
- Add Next
- double-click
- Inspector
- Preview
- sidebar drag
- connection insert
- keyboard
- resize
- save/load
- runtime regression

---

# 67. Agent Skills

Visual:

```text
frontend-design
web-design-guidelines
```

React:

```text
react-best-practices
composition-patterns
```

shadcn:

```text
shadcn
```

Runtime / visual verification:

```text
agent-browser
debugging-strategies
```

Review:

```text
improve
differential-review
web-design-guidelines
```

---

# 68. Required Validation

Do not mark complete after compile only.

Test:

```text
select node
deselect node
toolbar appears
toolbar follows pan/zoom
duplicate
delete
configure
double click
Inspector opens
Inspector closes
Add Next
drag node
drag from Build
connect nodes
zoom
Fit
save
reload
run
stop
```

Use `agent-browser` where practical.

---

# 69. Acceptance Criteria

Complete when:

- Right Build Sidebar closely follows the compact reference structure.
- Sidebar is categorized and searchable.
- Sidebar items are draggable.
- Node cards are compact and consistent.
- Selected state is visually clear.
- Selected node displays a floating toolbar.
- Toolbar provides Add Next.
- Toolbar provides Duplicate.
- Toolbar provides Configure/Edit.
- Toolbar provides Delete.
- More menu exists where useful.
- Double-click opens Configure/Preview detail.
- Inspector replaces Build panel when node is selected.
- Preview is standardized by output type.
- Node cards do not contain oversized forms.
- Keyboard alternatives exist.
- Pan/zoom does not break toolbar positioning.
- Existing save/load/run/stop behavior remains intact.
- UI remains scalable to Batch Image, Local TTS, and Whiteboard.

---

# 70. Final Interaction

```text
Open workflow
      ↓
Build Sidebar visible
      ↓
Drag block to Canvas
      ↓
Node created
      ↓
Single click
      ↓
Floating Toolbar + Inspector
      ↓
Double click
      ↓
Configure / Preview Detail
      ↓
Add Next / Duplicate / Edit / Delete
      ↓
Workflow updated
```

Final principle:

> The workflow graph should stay visually simple even when each node becomes functionally powerful.
