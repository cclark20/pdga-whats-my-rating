---
name: ship
description: >
  End-to-end GitHub shipping workflow: create issue (if needed), cut branch,
  lint/format, commit, push, open PR, wait for user review, then squash merge
  and delete the branch. Use this skill whenever the user says "ship",
  "ship it", "send it", "open a PR and merge", or otherwise wants to go from
  uncommitted changes all the way through to a merged PR on main. Also use
  when the user asks to "create a PR and merge" or "finish this up".
---

# Ship Workflow

Automate the full cycle from uncommitted changes to a merged PR. Follow every
step in order — do not skip steps or combine them unless noted.

## Step 1 — Survey the changes

Run these in parallel:
- `git status` (never use `-uall`)
- `git diff` (staged + unstaged)
- `git log --oneline -5` (for commit message style)

If there are no changes to commit, tell the user and stop.

## Step 2 — Ensure a GitHub issue exists

Ask the user: "Is there an existing GitHub issue for this work? If so, what's the number?"

If the user provides a number, use it. If they say there isn't one, create one:
```bash
gh issue create --title "<short title>" --body "<description of the changes>"
```
Capture the issue number from the output.

## Step 3 — Lint and format

Run linting and formatting checks. Fix any issues automatically before proceeding:
```bash
uv run ruff check . --fix
uv run ruff format .
```
Then verify everything is clean:
```bash
uv run ruff check .
uv run ruff format --check .
```
If there are still errors after auto-fix, stop and tell the user.

## Step 4 — Run tests

```bash
uv run pytest
```
If tests fail, stop and tell the user. Do not proceed with broken tests.

## Step 5 — Create branch and commit

Create a branch named after the issue/work (e.g., `feat/short-description` or
`fix/short-description`). Make sure you're branching from up-to-date main:
```bash
git checkout main
git pull
git checkout -b <branch-name>
```

Stage the relevant files (prefer naming specific files over `git add .`).

Commit using a HEREDOC for the message. The commit message should:
- Summarize the **why**, not just the **what**
- Use conventional commit style (feat:, fix:, refactor:, test:, docs:, etc.)
- End with the co-author line

```bash
git commit -m "$(cat <<'EOF'
feat: short description of the change

Longer explanation if needed.

Fixes #<issue-number>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

## Step 6 — Push and open PR

```bash
git push -u origin <branch-name>
```

Create the PR with summary and test plan:
```bash
gh pr create --title "<short title under 70 chars>" --body "$(cat <<'EOF'
## Summary
- <bullet points describing changes>

Fixes #<issue-number>

## Test plan
- [ ] <testing checklist items>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Share the PR URL with the user.

## Step 7 — Wait for review

Tell the user the PR is ready and ask them to review. Something like:

> "PR is up at <URL>. Take a look and let me know when you're ready to merge
> (or if you want changes)."

**Stop and wait.** Do not proceed until the user explicitly confirms they want
to merge. If they request changes, make them, amend or add commits, push, and
wait again.

## Step 8 — Merge and clean up

Once the user confirms:
```bash
gh pr merge <pr-number> --squash --delete-branch
```

Confirm the merge succeeded and let the user know they're back on main.
