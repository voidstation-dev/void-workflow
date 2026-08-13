export const meta = {
  name: 'phase9-a11y-audit',
  description: 'Phase 9 Accessibility & Interaction Audit: 4 grouped auditors -> adversarial verify -> synthesize ACCESSIBILITY_AUDIT.md',
  phases: [
    { title: 'Audit', detail: '4 grouped auditors read source + apply live web-design-guidelines rules' },
    { title: 'Verify', detail: 'one adversarial verifier per group: refute false positives, confirm real issues' },
    { title: 'Synthesize', detail: 'one synthesizer writes the audit doc from confirmed findings' },
  ],
}

// Live web-design-guidelines rules (fetched verbatim before the workflow). Embedded
// so each auditor applies the SAME rule set without re-fetching.
const LIVE_RULES = `
# Web Interface Guidelines (live rules — apply verbatim)

### Accessibility
- Icon-only buttons need aria-label
- Form controls need <label> or aria-label
- Interactive elements need keyboard handlers (onKeyDown/onKeyUp)
- <button> for actions, <a>/<Link> for navigation (not <div onClick>)
- Images need alt (or alt="" if decorative)
- Decorative icons need aria-hidden="true"
- Async updates (toasts, validation) need aria-live="polite"
- Use semantic HTML (<button>, <a>, <label>, <table>) before ARIA
- Headings hierarchical h1–h6; include skip link for main content
- scroll-margin-top on heading anchors

### Focus States
- Interactive elements need visible focus: focus-visible:ring-* or equivalent
- Never outline-none / outline: none without focus replacement
- Use :focus-visible over :focus (avoid focus ring on click)
- Group focus with :focus-within for compound controls

### Forms
- Inputs need autocomplete and meaningful name
- Use correct type (email, tel, url, number) and inputmode
- Never block paste (onPaste + preventDefault)
- Labels clickable (htmlFor or wrapping control)
- Checkboxes/radios: label + control share single hit target (no dead zones)
- Submit button stays enabled until request starts; spinner during request
- Errors inline next to fields; focus first error on submit
- Placeholders end with … and show example pattern
- autocomplete="off" on non-auth fields to avoid password manager triggers
- Warn before navigation with unsaved changes (beforeunload or router guard)

### Animation
- Honor prefers-reduced-motion (provide reduced variant or disable)
- Animate transform/opacity only (compositor-friendly)
- Never transition: all — list properties explicitly
- Set correct transform-origin
- Animations interruptible — respond to user input mid-animation

### Typography
- … not ...
- Curly quotes “ ” not straight "
- Non-breaking spaces: 10&nbsp;MB, ⌘&nbsp;K, brand names
- Loading states end with …: "Loading…", "Saving…"
- font-variant-numeric: tabular-nums for number columns/comparisons
- Use text-wrap: balance or text-pretty on headings

### Content Handling
- Text containers handle long content: truncate, line-clamp-*, or break-words
- Flex children need min-w-0 to allow text truncation
- Handle empty states — don't render broken UI for empty strings/arrays
- User-generated content: anticipate short, average, and very long inputs

### Performance
- Large lists (>50 items): virtualize (virtua, content-visibility: auto)
- No layout reads in render (getBoundingClientRect, offsetHeight, offsetWidth, scrollTop)
- Prefer uncontrolled inputs; controlled inputs must be cheap per keystroke

### Navigation & State
- Destructive actions need confirmation modal or undo window — never immediate

### Touch & Interaction
- touch-action: manipulation (prevents double-tap zoom delay)
- overscroll-behavior: contain in modals/drawers/sheets
- During drag: disable text selection, inert on dragged elements
- autoFocus sparingly — desktop only, single primary input; avoid on mobile

### Safe Areas & Layout
- Avoid unwanted scrollbars: overflow-x-hidden on containers, fix content overflow
- Flex/grid over JS measurement for layout

### Dark Mode & Theming
- color-scheme: dark on <html> for dark themes (fixes scrollbar, inputs)
- Native <select>: explicit background-color and color (Windows dark mode)

### Locale & i18n
- Dates/times: use Intl.DateTimeFormat not hardcoded formats
- Numbers/currency: use Intl.NumberFormat not hardcoded formats
- Brand names, code tokens, identifiers: wrap with translate="no"

### Hover & Interactive States
- Buttons/links need hover: state (visual feedback)
- Interactive states increase contrast: hover/active/focus more prominent than rest

### Content & Copy
- Active voice
- Title Case for headings/buttons (Chicago style)
- Numerals for counts
- Specific button labels: "Save API Key" not "Continue"
- Error messages include fix/next step, not just problem
- Second person; avoid first person

### Anti-patterns (FLAG these)
- user-scalable=no or maximum-scale=1 disabling zoom
- onPaste with preventDefault
- transition: all
- outline-none without focus-visible replacement
- Inline onClick navigation without <a>
- <div> or <span> with click handlers (should be <button>)
- Images without dimensions
- Large arrays .map() without virtualization
- Form inputs without labels
- Icon buttons without aria-label
- Hardcoded date/number formats (use Intl.*)
- autoFocus without clear justification
`;

// §27 + design contracts the auditors MUST NOT flag as issues (preserved by design).
const DO_NOT_FLAG = `
# Patterns that are INTENTIONAL (do NOT flag as issues)

These are frozen regression contracts or deliberate design decisions — flagging
them wastes a verify cycle. An auditor that flags them is wrong.

- Status is NEVER color-only by design: every status carries icon + text + color
  (NodeStatus, StatusBadge, SaveStateChip, RunStateLine, AppRail active = accent
  bar + filled bg + icon + aria-current). A bare colored dot WITH an icon+label is
  compliant.
- No alert()/confirm()/prompt() — inline-confirm (useInlineConfirm) replaces
  confirm() for destructive actions. This is the intended pattern.
- colorMode="dark" + fitView on ReactFlow are frozen §27 contracts.
- isValidConnection cycle guard is the ONLY hard return false; type mismatch is a
  SOFT advisory (backend authoritative). Intentional.
- dataTransfer keys "application/reactflow" + "application/reactflow-label" are
  frozen §27. Do not suggest renaming.
- persist partialize is LAYOUT ONLY by design (graph/run/selection/save/console/
  problems/dialog/toasts/history/names NOT persisted). Intentional.
- The 4 disabled-with-tooltip actions in Phase 8 (Projects New/Rename/Delete +
  Settings Backend Integration) are disabled because there is NO backend IPC and
  Phase 8 forbids adding any. The disabled + title="Requires backend support"
  pattern is the intended honest state — do NOT flag "disabled buttons are dead
  ends"; the tooltip explains why.
- Name edits (setProjectName/setWorkflowName) do NOT mark dirty by design: save
  serializes {nodes, edges} only, so names are frontend-local. Marking dirty would
  create an un-savable "Unsaved" state. Intentional.
- Canvas/library/inspector UNMOUNT on non-workflow screens (Phase 8 F1) —
  viewport resets on return is a documented accepted trade-off, not a bug.
- main[data-screen] is in LANDMARK_SELECTORS so F6 reaches the active screen.
- Console auto-scroll "stick to bottom" + "↓ N new" pill is the intended pattern.
- Indeterminate progress bar = static 50% fill, no animation (reduced-motion safe).
- The Tauri desktop context means: no URL/state sync (no router), no SSR/hydration,
  no lazy below-fold images, no touch double-tap concerns for the canvas. Do not
  flag the absence of these web-only concerns.
- Existing token contrast ratios were verified in Phase 2 with WCAG math. Do not
  re-flag token-level contrast unless a SPEC text/bg pairing in a COMPONENT
  actually breaks it (e.g. text on a colored fill that wasn't checked). Token
  definitions themselves are out of scope.
`;

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'category', 'severity', 'issue', 'rule'],
        properties: {
          file: { type: 'string', description: 'repo-relative path, e.g. src/components/shell/AppRail.tsx' },
          line: { type: 'integer', description: '1-indexed line number; 0 if file-level' },
          category: { type: 'string', description: 'one of: Keyboard, Focus, Contrast, Tooltips, Hit targets, Disabled state, Loading state, Error state, Resize, Overflow, Scroll behavior' },
          severity: { type: 'string', enum: ['high', 'medium', 'low', 'nit'], description: 'high=a11y blocker/wcag fail; medium=clear guideline violation; low=minor; nit=polish' },
          issue: { type: 'string', description: 'terse: what is wrong, one sentence' },
          rule: { type: 'string', description: 'the live-rule name that is violated, verbatim short' },
          fixSuggestion: { type: 'string', description: 'concrete fix, or empty if obvious' },
        },
      },
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmed', 'refuted', 'summary'],
  properties: {
    confirmed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'category', 'severity', 'issue', 'rule'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          category: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low', 'nit'] },
          issue: { type: 'string' },
          rule: { type: 'string' },
          fixSuggestion: { type: 'string' },
        },
      },
    },
    refuted: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'issue', 'reason'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          issue: { type: 'string' },
          reason: { type: 'string', description: 'why this finding is wrong / a false positive / covered by an intentional pattern' },
        },
      },
    },
    summary: { type: 'string', description: 'one-line group verdict' },
  },
};

const DOC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['markdown', 'confirmedCount', 'refutedCount'],
  properties: {
    markdown: { type: 'string', description: 'the full ACCESSIBILITY_AUDIT.md content' },
    confirmedCount: { type: 'integer' },
    refutedCount: { type: 'integer' },
  },
};

const AUDIT_GROUPS = [
  {
    key: 'keyboard-focus',
    title: 'Keyboard & Focus',
    categories: ['Keyboard', 'Focus'],
    scope: `Audit KEYBOARD + FOCUS across the workspace. Read these files (use Read/Grep):
- src/hooks/useWorkspaceShortcuts.ts (all shortcuts, Esc ordering, F6 landmark cycle, Alt+1..4, isTypingTarget guard, focusIsInCanvas)
- src/hooks/useKeyboardConnect.ts (port-connect keyboard flow)
- src/hooks/useInlineConfirm.ts (3s confirm window)
- src/components/shell/AppRail.tsx (roving tabindex, ArrowUp/Down/Home/End, aria-orientation)
- src/components/shell/NodeLibrary.tsx (search Esc stopPropagation, category roving tabindex, Arrow nav)
- src/components/shell/NodeLibraryItem.tsx (Enter/Space activate, role="button" + onKeyDown, focus ring)
- src/components/shell/Inspector.tsx (mode-switch focus management, InspectorSection collapse, InspectorTabs ArrowLeft/Right)
- src/components/primitives/InspectorSection.tsx, InspectorTabs.tsx (aria-expanded/controls, roving tabindex)
- src/components/shell/BottomDock.tsx (tab bar roving tabindex, console filter pills, history row Enter/Space)
- src/components/shell/TopToolbar.tsx (OverflowMenu ArrowUp/Down/Home/End, breadcrumb initial focus)
- src/components/shell/KeyboardHelpDialog.tsx, UnsavedGuardDialog.tsx (focus trap, Esc close, restoration)
- src/components/canvas/WorkflowCanvas.tsx (keyboard-add: onPaneClick, Enter-at-center window listener; isValidConnection)
- src/components/screens/ProjectsScreen.tsx, HistoryScreen.tsx, SettingsScreen.tsx

Check: every interactive non-<button> element (role="button", role="row", div onClick) has a keyboard handler + reachable; roving tabindex is consistent; Tab order is logical; Esc ordering is correct; F6 reaches every screen landmark; focus-visible rings exist (App.css global rule covers most, but verify no outline-none without replacement); focus is managed on mode/screen/dialog transitions; no keyboard trap (except intentional dialogs); aria-live on async (toasts, problems, console count).`,
  },
  {
    key: 'visual-a11y',
    title: 'Visual Accessibility (Contrast / Tooltips / Hit Targets)',
    categories: ['Contrast', 'Tooltips', 'Hit targets'],
    scope: `Audit CONTRAST + TOOLTIPS + HIT TARGETS. Read:
- src/App.css (token :root + @theme inline; global :focus-visible ring; prefers-reduced-motion; prefers-contrast: more)
- ALL components under src/components/shell, src/components/screens, src/components/primitives for:
  * TOOLTIPS: every icon-only button has aria-label AND title; disabled buttons have a title explaining why; truncated text has title with full text; aria-label is meaningful (not just the icon name where context helps).
  * HIT TARGETS: measure button sizes. The app uses h-7 (28px), h-6 (24px), w-7 (28px), h-10 w-10 (40px rail). Flag any interactive element <24px minimum (WCAG 2.5.5 is 24px; 44px is enhanced). Note h-6=24px is AT the minimum (acceptable but note it). Check PortHandle hit area (src/components/nodes/PortHandle.tsx), small "Fit"/"↓ N new" pills, level-radio pills, clear buttons, the rail collapse strip (w-1=4px — is it a big enough re-open target? it has tabIndex=0 + role=button).
  * CONTRAST: do NOT re-verify token definitions (verified Phase 2). Instead check COMPONENT-LEVEL pairings the tokens don't capture: text on a colored fill (e.g. text-on-accent on bg-accent, text-on-status on bg-status-error), hover states (text on bg-surface-hover), the minimap, the RF Controls overrides, placeholder text (text-text-muted on surface-input), disabled opacity-40/opacity-50/opacity-60 reducing contrast. Flag a pair ONLY if you can name the bg + text tokens and the ratio is plausibly <4.5:1 (normal text) or <3:1 (large/UI). Do not guess; if unsure mark severity low.
- src/components/primitives/StatusBadge.tsx, ToolbarButton.tsx, Panel.tsx, PanelHeader.tsx (new in Phase 8 — verify their token usage).

Check the new Phase 8 screens + AppRail 2px accent for contrast (accent #1d6fd0 on sidebar — is the accent bar visible enough? it's decorative so aria-hidden, but visibility for sighted users).`,
  },
  {
    key: 'state-patterns',
    title: 'State Patterns (Disabled / Loading / Error)',
    categories: ['Disabled state', 'Loading state', 'Error state'],
    scope: `Audit DISABLED + LOADING + ERROR state patterns. Read:
- src/components/screens/ProjectsScreen.tsx, SettingsScreen.tsx (disabled-with-tooltip; disabledReason on PropertyRow)
- src/components/primitives/PropertyRow.tsx (disabled → aria-disabled + title; file-picker Browse disabled)
- src/components/primitives/ToolbarButton.tsx (disabled + loading states)
- src/components/shell/TopToolbar.tsx (Save disabled while saving/running; Run disabled when canRun false; OverflowMenu disabled items; SaveStateChip; RunStateLine)
- src/hooks/useWorkflowController.ts (run/stop/save error paths; inferRunCompletion failed branch)
- src/components/shell/ToastRegion.tsx (error toasts, aria-live)
- src/components/shell/UnsavedGuardDialog.tsx (unsaved-changes guard)
- src/components/primitives/InspectorSection.tsx (danger variant)
- src/components/shell/Inspector.tsx (delete inline-confirm, error states)
- src/components/shell/BottomDock.tsx (Console first-error assertive, Problems empty state, Run idle empty state, Artifacts gap note)

Check:
DISABLED — every disabled control has aria-disabled + a title/tooltip explaining why (not just greyed out); disabled buttons don't have working hover that implies clickability; the Projects/Settings backend-dependent actions all explain "Requires backend support".
LOADING — every async op shows a spinner (LoaderCircle) + aria-busy + "…"-suffixed label; spinners honor prefers-reduced-motion (global media query zeroes animation — verify); no blocking without feedback; Save shows "Saving…", Run shows "Starting…".
ERROR — errors are shown inline (role="alert" on PropertyRow error) OR via toast (aria-live); error messages include a fix/next step not just the problem (controller pushToast descriptions — do they?); failed run auto-opens Problems + announces; no silent failures (a caught error with no user signal).`,
  },
  {
    key: 'layout-motion',
    title: 'Layout & Motion (Resize / Overflow / Scroll)',
    categories: ['Resize', 'Overflow', 'Scroll behavior'],
    scope: `Audit RESIZE + OVERFLOW + SCROLL behavior. Read:
- src/components/shell/WorkspaceShell.tsx (grid template, auto-collapse thresholds <976/<776/<536/<600, screen swap gridColumn 2/4)
- src/hooks/useSplitter.ts (library/inspector/dock resize ranges, Arrow/Shift/Enter)
- src/components/shell/NodeLibrary.tsx, Inspector.tsx, BottomDock.tsx (splitter usage, collapsed render)
- src/App.css (overflow rules, .sr-only, scroll behavior, overscroll-behavior)
- src/components/shell/BottomDock.tsx (Console smart auto-scroll stick-to-bottom + "↓ N new" pill; logs container overflow; Problems/Run/Artifacts scroll)
- src/components/canvas/WorkflowCanvas.tsx (canvas overflow; fitView; zoom)
- src/components/shell/TopToolbar.tsx (breadcrumb max-w truncate; overflow menu)
- src/components/screens/HistoryScreen.tsx (table sticky header, row overflow, long failedNode)
- src/components/screens/ProjectsScreen.tsx, SettingsScreen.tsx (panel max-w, overflow-auto)
- all components for: min-w-0 on flex children that truncate; truncate/line-clamp on long text (node labels, project/workflow names, log messages, toast titles); overflow-x on wide content (tables, the Inspector config form, the dock); overscroll-behavior on scroll containers (console, dock, screens); prefers-reduced-motion on the run-payload edge dash + spinners + setCenter duration (WorkflowCanvas).

Check:
RESIZE — window resize from very wide to <536px: do zones collapse gracefully? does the canvas starve (minmax 480px — on a 536px screen with rail 56 that leaves 480 — borderline)? is there horizontal overflow at min width? splitters clamp to min/max; Arrow-key resize; does text reflow or truncate? The 4px rail re-open strip + the 0px library/inspector collapse — any dead zones?
OVERFLOW — every text container handles long content (node labels, workflow name in breadcrumb max-w-[280px] truncate, log messages, toast titles, history failedNode); flex children have min-w-0 where they truncate; wide content (History table, Inspector form) scrolls within its container not the page; no horizontal page scroll; the dock tabs don't overflow on narrow widths.
SCROLL — console auto-scroll is smart (sticks only when at bottom); sticky headers work (History thead, dock tab bar); scroll containers have overscroll-behavior (contain in the dock/dialogs — verify App.css or inline); reduced-motion zeroes scroll animations; no layout reads in render (getBoundingClientRect in WorkflowCanvas empty-state template + Enter-at-center — is that in render or an event handler? event handler is OK; flag only if in render path).`,
  },
];

const auditPrompt = (g) => `You are an accessibility & interaction auditor for the Void Workflow desktop app (Tauri + React 19 + @xyflow/react v12 + Zustand + Tailwind v4, TypeScript strict). The repo root is the current working directory.

AUDIT GROUP: ${g.title} — categories: ${g.categories.join(', ')}.

${g.scope}

## LIVE RULES (apply verbatim — do not invent rules)
${LIVE_RULES}

## INTENTIONAL PATTERNS (do NOT flag — these are frozen contracts / deliberate)
${DO_NOT_FLAG}

## Output
Return findings as structured output. Each finding: file (repo-relative path), line (1-indexed; 0 if file-level), category (one of: Keyboard, Focus, Contrast, Tooltips, Hit targets, Disabled state, Loading state, Error state, Resize, Overflow, Scroll behavior — must be one of YOUR group's categories), severity (high=a11y blocker/WCAG fail; medium=clear guideline violation; low=minor; nit=polish), issue (one terse sentence), rule (the live-rule name violated, short), fixSuggestion (concrete fix or empty).

Rules for findings:
- Use Read/Grep to actually inspect the source. Do NOT report findings for code you have not read. Cite real line numbers.
- Be specific and high-signal. "X missing Y at file:line" not generic lectures.
- Only flag REAL violations of the live rules. If something is covered by an intentional pattern above, do NOT flag it.
- If a category in your group is clean, return an empty findings array (do not fabricate).
- Severity: reserve "high" for WCAG failures / keyboard blocks / contrast fails on normal text. Most issues are medium/low.
- Do not flag the absence of web-only concerns (URL state sync, SSR hydration, lazy images, touch double-tap) — this is a Tauri desktop app.`;

const verifyPrompt = (g, findings) => `You are an adversarial verifier for the ${g.title} accessibility audit of the Void Workflow desktop app. Try to REFUTE each finding. The repo root is the current working directory.

GROUP CATEGORIES: ${g.categories.join(', ')}

## LIVE RULES (the source of truth for whether a finding is real)
${LIVE_RULES}

## INTENTIONAL PATTERNS (a finding that hits one of these is FALSE — refute it)
${DO_NOT_FLAG}

## FINDINGS TO VERIFY
${JSON.stringify(findings, null, 2)}

For each finding:
1. Read the cited file at the cited line (use Read). Confirm the line actually contains what the finding claims. If the line is wrong or the code doesn't match, REFUTE (reason: "cited line does not contain this").
2. Check the finding against the live rules. If the rule doesn't actually prohibit it, REFUTE.
3. Check the finding against the intentional patterns. If it's covered, REFUTE.
4. If the finding is real and a genuine violation, CONFIRM it (carry through file/line/category/severity/issue/rule/fixSuggestion). You may DOWNGRADE severity if the auditor overstated it, but note the change in the issue text.

Return confirmed (array of surviving findings with the same shape) + refuted (array of {file, line, issue, reason}) + a one-line summary. Be rigorous — a confirmed finding must survive your attempt to refute it. Do not confirm anything you cannot verify by reading the code.`;

const synthPrompt = (allVerified, refutedTotal) => `You are the synthesizer for the Void Workflow Phase 9 Accessibility & Interaction Audit. Produce the FULL markdown for docs/ui/ACCESSIBILITY_AUDIT.md from the verified findings of all 4 audit groups.

## VERIFIED FINDINGS (confirmed only — refuted findings are excluded)
${JSON.stringify(allVerified, null, 2)}

## LIVE RULES (for context / category definitions)
${LIVE_RULES}

## Output format for the markdown
Produce a complete, well-structured audit document. Structure:

1. Title + 1-paragraph scope (Phase 9 audit over 11 categories: Keyboard, Focus, Contrast, Tooltips, Hit targets, Disabled state, Loading state, Error state, Resize, Overflow, Scroll behavior. Method: 4 grouped auditors applied live web-design-guidelines rules, adversarially verified; agent-browser CLI not installed so automated screenshot regression was not run — source-level audit only.)
2. A summary table: category | confirmed findings count | highest severity.
3. A section per category that HAS confirmed findings, using the live-rules output format: group by file, "file:line - terse issue" lines. Under each category, list findings grouped by file. For each finding include the severity in brackets and a one-line fix where non-obvious.
4. A "Strengths" section: categories that passed clean (empty confirmed findings) — name them and what was verified (1-2 lines each), so the audit shows coverage not just problems.
5. A "Intentional patterns (not issues)" section: briefly note the key deliberate decisions so future readers don't re-flag them (status-not-color-only, inline-confirm not confirm(), disabled-with-tooltip for no-backend actions, name edits not marking dirty, canvas unmount on screen swap, main[data-screen] landmark).
6. A "Blockers / deferred" section: note that agent-browser CLI is not installed (blocks automated visual/screenshot regression — recommend install for Phase 10+), and that any "high" findings should be addressed before Phase 10 cleanup.
7. A "Recommendations" ordered list: the highest-priority fixes first (high-severity first, then medium), each with file:line + the fix. If there are NO high/medium findings, say so explicitly and list only low/nit.

Rules:
- Only include CONFIRMED findings. Do not include refuted findings.
- If a category has zero confirmed findings, it goes in "Strengths", not as a findings section.
- Be terse and high-signal, matching the live-rules output style. No preamble, no filler.
- Use repo-relative paths. Cite real line numbers from the verified findings.
- The document is the deliverable; make it complete and self-contained.

Return the full markdown plus confirmedCount (total confirmed across all groups) and refutedCount (total refuted across all groups, = ${refutedTotal}).`;

// ---- run ----
phase('Audit');
log('Phase 9 a11y audit: 4 grouped auditors reading source + applying live rules');
const audits = await parallel(
  AUDIT_GROUPS.map((g) => () =>
    agent(auditPrompt(g), { label: `audit:${g.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA })
  )
);

// Barrier done. Flatten findings per group for the verifiers.
const auditResults = audits.map((a, i) => ({
  group: AUDIT_GROUPS[i],
  findings: a ? a.findings : [],
}));

phase('Verify');
log(`Verifying ${auditResults.reduce((n, r) => n + r.findings.length, 0)} findings across 4 groups (adversarial)`);
const verified = await parallel(
  auditResults.map((r) => () =>
    agent(verifyPrompt(r.group, r.findings), { label: `verify:${r.group.key}`, phase: 'Verify', schema: VERDICT_SCHEMA })
  )
);

const verifiedClean = verified.filter(Boolean);
const allConfirmed = verifiedClean.flatMap((v, i) =>
  (v.confirmed || []).map((f) => ({ ...f, group: auditResults[i].group.title }))
);
const refutedTotal = verifiedClean.reduce((n, v) => n + (v.refuted || []).length, 0);

phase('Synthesize');
log(`Synthesizing ACCESSIBILITY_AUDIT.md from ${allConfirmed.length} confirmed findings (${refutedTotal} refuted)`);
const doc = await agent(synthPrompt(allConfirmed, refutedTotal), {
  label: 'synthesize',
  phase: 'Synthesize',
  schema: DOC_SCHEMA,
});

return {
  markdown: doc ? doc.markdown : '',
  confirmedCount: doc ? doc.confirmedCount : allConfirmed.length,
  refutedCount: doc ? doc.refutedCount : refutedTotal,
  perGroup: auditResults.map((r, i) => ({
    group: r.group.title,
    found: r.findings.length,
    confirmed: verifiedClean[i] ? verifiedClean[i].confirmed.length : 0,
    refuted: verifiedClean[i] ? verifiedClean[i].refuted.length : 0,
  })),
};