# `.scratch/` — agent working memory

Ephemeral workspace for Cursor agents on Sonivo. **Not product truth.**

| Path | Purpose |
| ---- | ------- |
| [`NOW.md`](NOW.md) | Current focus, next actions, blockers |
| [`installs/LOG.md`](installs/LOG.md) | What was installed, where, when |
| `notes/` | Throwaway notes (gitignored) |
| `tmp/` | Temporary files (gitignored) |

## Rules

1. Read `docs/00-context/CONTEXT.md` before inventing scope.
2. Update `NOW.md` when the focus of a session changes.
3. Durable decisions go to `docs/` or ADRs — never only here.
4. Do not put secrets in this folder.
5. Prefer updating existing docs over parallel note dumps.

## Related

- Operating rules: [`../AGENTS.md`](../AGENTS.md)
- Tooling status: [`../docs/tooling/TOOLING-AUDIT.md`](../docs/tooling/TOOLING-AUDIT.md)
- Skills inventory: [`../docs/tooling/SKILLS-INVENTORY.md`](../docs/tooling/SKILLS-INVENTORY.md)
