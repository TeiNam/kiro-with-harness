# Git Workflow

## Pipeline (always this order)

There is exactly **one** way to land a code change: `branch → commit → push → PR → merge`.
"It's a small change", "it's docs only", "I'm already on main" are not exceptions.

```bash
git switch -c <type>/<slug>          # 1. feat/, fix/, refactor/, docs/, chore/ …
git commit -m "<type>: <description>" # 2. commit (one or many)
git push -u origin <branch>          # 3. push
gh pr create --fill                  # 4. PR (write the body per the rules below)
gh pr merge --squash --delete-branch # 5. merge + branch cleanup
git switch main && git pull          # 6. sync local
```

**Never commit or push directly to the default branch (`main`/`master`).** If work
already started on main, move it before committing: `git switch -c <branch>`.

When the user asks for only **part** of the pipeline ("commit this", "push it",
"open a PR"), carry on through the remaining steps. If there is a reason to stop
partway (waiting on review, checking CI), say the reason in one line.

### Exceptions (direct push allowed)

- The user explicitly said "directly to main"
- Release tag pushes (`git push --tags`)
- Local-only repos with no remote

**Enforcement gate.** The harness installs a `pre-push-guard` hook that detects a
push targeting the default branch and blocks it (`exit 2`) with the pipeline
instructions. Deliberate direct pushes set `KIRO_ALLOW_MAIN_PUSH=1`. The IDE tier
ships the same gate as the `git-pipeline-guard` hook.

## Version Bump (before the commit that lands a PR)

Run `npm run bump` before committing. It classifies the change **by size** against the
last bump and applies the level:

| Size | Level | Trigger |
|------|-------|---------|
| Large PR | `minor` | asset add/remove under `agents/`·`skills/`, **or** ≥10 changed files, **or** ≥300 churn |
| One or two small edits | `patch` | anything else that changed |
| Nothing changed | none | no bump |

```bash
npm run bump -- --dry-run       # verdict only
npm run bump                    # apply (package.json + package-lock, no git tag)
npm run bump -- --level=minor   # override the verdict
```

Why this is enforced rather than remembered: `install.js` records `package.json`'s
version as `sourceVersion` in the install manifest and `--status` compares it to decide
`outdated`. If the version never moves, `compareSemver` always returns 0 and every
install reads "up to date" no matter how much the source changed.

## Commit Messages

Write clear, descriptive commit messages:
- Use imperative mood: "Add feature" not "Added feature"
- First line: concise summary (50 chars or less preferred)
- Body (optional): explain why, not what — the diff shows what changed
- Reference issue/ticket IDs when applicable

```
feat: add user email validation

Validates email format on registration to prevent invalid accounts.
Closes #142
```

## Conventional Commits

Use conventional commit prefixes when the project adopts them:

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

## Branch Naming

Use a consistent pattern: `<type>/<short-description>`

```
feat/user-auth
fix/email-validation
refactor/order-service
```

Keep branch names lowercase with hyphens. Include ticket IDs if the team convention requires it: `feat/PROJ-123-user-auth`.

## Merge Strategy

Choose one strategy per project and stick with it:

- **Squash merge** (recommended for feature branches): Collapses all commits into one clean commit on main. Keeps history linear and readable.
- **Rebase and merge**: Replays commits on top of main. Preserves individual commits but requires clean history.
- **Merge commit**: Creates a merge commit. Preserves full branch history. Best for long-lived branches.

Before merging:
1. Rebase on latest main to resolve conflicts locally
2. Ensure CI passes
3. Get required reviews

## Conflict Resolution

1. Pull latest main: `git fetch origin main`
2. Rebase your branch: `git rebase origin/main`
3. Resolve conflicts file by file — understand both sides before choosing
4. Run tests after resolving to verify nothing broke
5. Never resolve conflicts by blindly accepting one side

## What Not to Commit

- Generated files (build output, compiled assets) — use `.gitignore`
- Secrets, API keys, credentials — use environment variables
- Large binary files — use Git LFS if necessary
- Editor/IDE config — add to global gitignore unless team-shared

## Pull Requests

- Keep PRs focused: one logical change per PR
- Write a clear description of what and why
- Link related issues
- Self-review the diff before requesting review

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
