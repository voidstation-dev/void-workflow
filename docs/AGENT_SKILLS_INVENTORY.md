# Void Workflow — Agent Skills Inventory

Per-skill localization status. Global skills were discovered via
`npx skills ls -g`; project copies live under `.agents/skills/` (Codex, Gemini
CLI) and `.claude/skills/` (Claude Code). Both directories hold identical
copies; `skills-lock.json` records sources + content hashes for reproducibility.

| Skill | Global | `.agents/skills/` (Codex, Gemini CLI) | `.claude/skills/` (Claude Code) | Upstream Source | Copy Status | Validation |
|---|---|---|---|---|---|---|
| frontend-design | found | ✓ | ✓ | `anthropics/skills` | COPIED | VERIFIED |
| web-design-guidelines | found | ✓ | ✓ | `vercel-labs/agent-skills` | COPIED | VERIFIED |
| shadcn | found | ✓ | ✓ | `shadcn/ui` | COPIED | VERIFIED |
| improve | found | ✓ | ✓ | `shadcn/improve` | COPIED | VERIFIED |
| agent-browser | found | ✓ | ✓ | `vercel-labs/agent-browser` | COPIED | VERIFIED |
| doc-and-modernize | found | ✓ | ✓ | `github/awesome-copilot` | COPIED | VERIFIED |
| audit-context-building | found | ✓ | ✓ | `trailofbits/skills` | COPIED | VERIFIED |
| differential-review | found | ✓ | ✓ | `trailofbits/skills` | COPIED | VERIFIED |
| rust-async-patterns | found | ✓ | ✓ | `wshobson/agents` | COPIED | VERIFIED |
| debugging-strategies | found | ✓ | ✓ | `wshobson/agents` | COPIED | VERIFIED |
| error-handling-patterns | found | ✓ | ✓ | `wshobson/agents` | COPIED | VERIFIED |
| react-best-practices | NOT FOUND | — | — | unknown (not invented) | SKIPPED | N/A |
| composition-patterns | NOT FOUND | — | — | unknown (not invented) | SKIPPED | N/A |

## Other global skills (not localized — out of scope)

| Skill | Global | Reason not localized |
|---|---|---|
| find-skills | found | general-purpose tooling, already agent-built-in |
| hallmark | found | general-purpose design skill, not Void-Workflow-specific |
| migrate-radix-to-base | found | not applicable (no Radix usage in project) |
| pdf | found (`~/.codex/skills`) | Codex-internal, agent-scoped to Codex only |
| playwright | found (`~/.codex/skills`) | Codex-internal, agent-scoped to Codex only |
| provide-fix-info | found (`~/.codex/skills`) | Codex-internal, agent-scoped to Codex only |

## Totals

- Global skills found: 14 (`.agents/skills`) + 3 Codex-local
- Project skills installed: 11 (in both `.agents/skills/` and `.claude/skills/`)
- Agents covered: Claude Code, Codex, Gemini CLI
- Could not localize: 2 (`react-best-practices`, `composition-patterns` — not globally installed; source not invented)
- Copy mode: Verified (real files, no symlinks; `find .agents/skills .claude/skills -type l` → empty)
- Reproducibility: `skills-lock.json` present (11 entries, content hashes recorded)
- Global skills removed: 0