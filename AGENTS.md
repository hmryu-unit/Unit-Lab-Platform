# Agent instructions

## Agent skills

### Issue tracker

GitHub Issues on `hmryu-unit/Unit-Lab-Platform`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default mattpocock/skills vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context; glossary in `README.md` and `.cursor/skills/unitlab-platform/SKILL.md`. See `docs/agents/domain.md`.

### Installed engineering skills (mattpocock/skills)

Project skills live under `.agents/skills/` (Cursor-linked). Invoke by name, e.g. `/diagnose`, `/caveman`, `/zoom-out`.

| Skill | Use for |
|-------|---------|
| `caveman` | Primitive, minimal approach to a problem |
| `diagnose` | Structured diagnosis of bugs or behavior |
| `grill-me` | Self-review via questioning |
| `grill-with-docs` | Self-review with documentation |
| `improve-codebase-architecture` | Architecture improvements |
| `prototype` | Quick prototype / spike |
| `triage` | Issue triage workflow (needs GitHub labels) |
| `write-a-skill` | Author new Agent Skills |
| `zoom-out` | Step back for bigger-picture view |
| `setup-matt-pocock-skills` | Re-run repo setup for issue tracker / labels / domain docs |

Also installed: `tdd`, `to-issues`, `to-prd`, `handoff`. Details: https://skills.sh/mattpocock/skills

**Security (Snyk):** `setup-matt-pocock-skills`, `to-issues`, and `triage` are Med Risk; review before use in sensitive environments.
