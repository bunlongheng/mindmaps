---
name: Push only when final
description: Do not git push until user explicitly says to — batch changes and push only when final
type: feedback
---

Do not push to remote after every small change. Accumulate changes and only push when the user says "push" or indicates they're done.

**Why:** User prefers to review and batch changes before deploying. Pushing after every edit triggers unnecessary Vercel builds and wastes time.

**How to apply:** Commit locally as needed, but hold off on `git push` until explicitly told to push or the user says "final" / "done" / "push it".
