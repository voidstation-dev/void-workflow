# Void Workflow — Agent Skills

## Purpose

Agent Skills used to help build, review, debug, and maintain Void Workflow. Skills
provide specialized guidance (frontend design, Rust async patterns, debugging,
security review, etc.) that the coding agent loads on demand.

## Project Scope

All required skills are stored **locally in this repository** so development
does not depend exclusively on developer-global installations. The repository
remains usable even when a developer's global skill directory
(`~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, `~/.gemini/skills`)
is unavailable.

The project uses **copy mode** (real files), not symlinks back to the home
directory.

## Supported Coding Agents

Skills are installed for **three** coding agents, discovered from project scope:

| Agent | Project skill directory | Scope |
|---|---|---|
| Claude Code (VS Code extension) | `.claude/skills/` | project |
| Codex | `.agents/skills/` | project |
| Gemini CLI | `.agents/skills/` | project |

The skills CLI (`npx skills`) maps each agent to a project-scope skill
directory. **Codex and Gemini CLI share `.agents/skills/**` (the agent-agnostic
canonical location), while Claude Code reads from its own `.claude/skills/`.
Both directories contain identical copies of every skill.

A reproducible [skills-lock.json](../skills-lock.json) records each skill's
source and content hash, so the full set can be restored with
`npx skills experimental_install`.

## Installed Skills

| Skill | Purpose | Upstream Source | `.agents/skills/` (Codex, Gemini CLI) | `.claude/skills/` (Claude Code) |
|---|---|---|---|---|
| frontend-design | Distinctive, intentional UI/visual design guidance | `anthropics/skills` | ✓ | ✓ |
| web-design-guidelines | Review UI against Web Interface Guidelines | `vercel-labs/agent-skills` | ✓ | ✓ |
| shadcn | Manage shadcn/ui components (add, fix, style, compose) | `shadcn/ui` | ✓ | ✓ |
| improve | Senior-advisor codebase audit → prioritized handoff plans | `shadcn/improve` | ✓ | ✓ |
| agent-browser | Browser automation CLI for AI agents | `vercel-labs/agent-browser` | ✓ | ✓ |
| doc-and-modernize | Architecture documentation + modernization planning | `github/awesome-copilot` | ✓ | ✓ |
| audit-context-building | Understand a codebase before bug-hunting | `trailofbits/skills` | ✓ | ✓ |
| differential-review | Security-focused differential review of changes | `trailofbits/skills` | ✓ | ✓ |
| rust-async-patterns | Rust async (Tokio, async traits, concurrency) | `wshobson/agents` | ✓ | ✓ |
| debugging-strategies | Systematic debugging, profiling, root-cause analysis | `wshobson/agents` | ✓ | ✓ |
| error-handling-patterns | Error handling across languages (Result, exceptions) | `wshobson/agents` | ✓ | ✓ |

> Upstream sources were read from the global `npx skills ls -g` metadata. No
> source repositories were fabricated.

## Skill Groups

### Frontend / UI
- `frontend-design` — visual design direction, typography, anti-template choices
- `web-design-guidelines` — accessibility & UX compliance review
- `shadcn` — shadcn/ui component management

### Rust / System
- `rust-async-patterns` — Tokio, async traits, concurrent systems
- `error-handling-patterns` — Result types, error propagation, graceful degradation

### Debugging
- `debugging-strategies` — profiling tools, root-cause analysis

### Review / Audit
- `improve` — prioritized improvement/handoff plans
- `differential-review` — security-focused diff review of PRs/commits
- `audit-context-building` — codebase context model before auditing

### Tooling / Docs
- `agent-browser` — programmatic browser interaction & testing
- `doc-and-modernize` — architecture docs + modernization roadmap planning

## Verification

Each localized skill was verified for:
- `SKILL.md` present
- frontmatter `name` and `description` intact
- bundled `references/`, `assets/`, `agents/`, `rules/`, `evals/` preserved
- no symlinks back to the global/home directory
  (`find .agents/skills .claude/skills -type l` → none)
- file-count parity across `.agents/skills/`, `.claude/skills/`, and the global
  canonical copy
- `npx skills ls -a <agent>` recognizes all 11 as Project Skills for each of:
  `claude-code`, `codex`, `gemini-cli`

See [AGENT_SKILLS_INVENTORY.md](AGENT_SKILLS_INVENTORY.md) for the per-skill
status table.

## Security Review

Localized skills contain **no executable scripts**. Bundled files are limited to:
- Markdown docs (`SKILL.md`, `references/*.md`, methodology/patterns docs)
- YAML agent-interface metadata (icons, brand colors, display names)
- SVG/PNG brand assets
- One JSON eval fixture (shadcn)

A grep pass for credential access, home-directory scraping, destructive shell
operations (`rm -rf`, `os.system`, `eval(`), and unrelated network calls found
**no suspicious behavior**. No scripts were executed during localization.

## Updating Skills

To restore the full project skill set from `skills-lock.json` (reproducible):

```bash
npx skills experimental_install          # restores .agents/skills/ from lock
```

Then mirror into Claude Code's directory:

```bash
mkdir -p .claude/skills
cp -r .agents/skills/* .claude/skills/
```

To safely add/update a single skill from its upstream source for all three
agents (confirm the source matches the table above):

```bash
# Installs into .agents/skills/ (Codex, Gemini CLI) — project-scoped, copy mode.
npx skills add <owner/repo> --skill <skill-name> --agent codex gemini-cli --copy -y
# Then mirror into Claude Code's directory:
cp -r .agents/skills/<skill-name> .claude/skills/<skill-name>
```

To reinstall from the developer's existing global copy (no external download):

```bash
cp -r ~/.agents/skills/<skill-name> .agents/skills/<skill-name>
cp -r ~/.agents/skills/<skill-name> .claude/skills/<skill-name>
```

After any update:
1. Confirm `SKILL.md` frontmatter (`name`, `description`) is intact.
2. Confirm bundled resources are present (file-count parity).
3. Run `find .agents/skills .claude/skills -type l` to ensure no symlinks were
   introduced.
4. Run `npx skills ls -a claude-code`, `... codex`, `... gemini-cli` to confirm
   project-scope recognition for all three agents.

> **Note on `--agent "*"`**: passing `--agent "*`" installs into every
> agent-specific directory the CLI knows (~55 dirs: `.aider-desk`, `.augment`,
> `.windsurf`, …). Do **not** use it here — it pollutes the repo with unwanted
> agent dirs. Target only the agents this project uses: `codex gemini-cli`
> (shared `.agents/skills/`) plus a manual mirror into `.claude/skills/`.

## Notes

- Global skill installations (`~/.agents/skills`, `~/.claude/skills` symlinks)
  may still exist on developer machines and are **not removed** by this setup.
  They are simply not required for this repository.
- Two skills named in the original requirements — `react-best-practices` and
  `composition-patterns` — were **not found** in the global installation and
  could not be localized. Per policy, no upstream source was invented. See the
  inventory for details.
- Other globally-installed skills not relevant to Void Workflow
  (`find-skills`, `hallmark`, `migrate-radix-to-base`, Codex-local `pdf`,
  `playwright`, `provide-fix-info`) were intentionally left out of project scope
  as either general-purpose tooling or agent-internal/Codex-only skills.