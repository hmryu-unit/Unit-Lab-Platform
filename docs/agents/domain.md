# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

This repo does not use `CONTEXT.md` yet. Use these sources instead:

| File | Purpose |
|------|---------|
| `README.md` (용어 사전) | Canonical domain terms: 플랫폼, 패키지, 등급, 항목, 스펙, 자재 |
| `.cursor/skills/unitlab-platform/SKILL.md` | Code conventions, helpers, page-specific UI rules |
| `js/app.js` | Runtime behavior, `State` shape, render functions |

If `CONTEXT.md` or `docs/adr/` are added later, prefer them over ad-hoc terminology.

## Before exploring, read these

- **`README.md`** — terminology section at the top
- **`.cursor/skills/unitlab-platform/SKILL.md`** — when editing UI or domain logic
- **`docs/adr/`** — if present, read ADRs for the area you touch

If a file doesn't exist, proceed silently.

## Use the project's vocabulary

When naming concepts in issues, PRDs, or refactors, use terms from `README.md` (e.g. **스펙** not "slot" in user-facing text; **패키지** for `State.packages`).

## Flag conflicts

If a proposal contradicts documented behavior in README or an ADR, say so explicitly.
