---
description: Create a PR with mandatory review and convention checks. The only allowed way to push.
---

You are creating a pull request against `main`. Run the chain in order. Each step pauses for user confirmation.

## Steps

1. **Title** — generate title capturing contents of PR.
2. **Description** — generate from `git log origin/main..HEAD --oneline`.
3. **User approval** — present title + body, wait for go.
4. **Push + create** — `git push -u origin <branch>` then `gh pr create --base main`.

**This is the ONLY allowed way to create PRs in this project.** Never use `gh pr create` directly.
