---
name: terraform-deployment
description: Greenfield Terraform setup and first-deploy workflow. Use when initializing a new Terraform project or module — pins the latest stable Terraform CLI and provider versions, sets version constraints, commits the dependency lock, and runs the fmt→validate→plan→apply gate. Triggers on new IaC projects, "terraform init", provider/version setup, or first infrastructure deploy.
origin: harness
workloads: [cloud]
---

# Terraform Deployment (Greenfield + First Deploy)

Stand up a new Terraform project on **current, pinned** versions and ship the first apply safely. AI models tend to scaffold Terraform with stale `required_version` / provider constraints carried over from training data — this skill forces a fresh look-up of the latest stable versions at setup time, then locks them.

## When to Activate

- Initializing a new Terraform project, module, or workspace
- First `terraform init` / first deploy of a stack
- Setting or reviewing `required_version` / provider version constraints
- Migrating a project that floats versions (no constraints, no lock file)

## Core Principles

1. **Pin the latest stable, then lock** — never float (`>= x`) and never inherit versions from memory. Resolve the current stable release at setup time and pin with a pessimistic constraint.
2. **Commit the lock file** — `.terraform.lock.hcl` is committed so every machine and CI resolves identical provider builds.
3. **Plan before apply, always** — `fmt → validate → plan → review → apply`. No `-auto-approve` on a first deploy.
4. **Remote state from day one** — configure a remote backend with locking before the first apply; never start on local state for shared infrastructure.

## Step 1 — Resolve current stable versions (do NOT hardcode from memory)

- **Terraform CLI**: check `terraform version` locally and the official releases; use the latest stable (skip alpha/beta/rc).
- **Providers**: query the Terraform Registry for the latest published version. When the Terraform MCP server (`@terraform`) is available, use it to resolve current provider/module versions and docs instead of guessing.
- Record the resolved versions before writing constraints.

## Step 2 — Version constraints

```hcl
terraform {
  required_version = "~> <RESOLVED_MAJOR.MINOR>"   # resolved at setup, not from memory

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> <RESOLVED_MAJOR.MINOR>"          # pessimistic: allow patch, lock major.minor
    }
  }
}
```

- Use `~>` (pessimistic) so patch updates are allowed but major/minor bumps stay deliberate.
- Pin the CLI via `required_version` and, in CI, via a `.terraform-version` file (tfenv / `mise`).

## Step 3 — Lock providers across platforms

```bash
terraform init
terraform providers lock \
  -platform=darwin_arm64 -platform=linux_amd64 -platform=linux_arm64
```

Commit `.terraform.lock.hcl`. The multi-platform lock prevents "checksum missing" failures when local (macOS) and CI (Linux) differ.

## Step 4 — Remote backend + state locking (before first apply)

Configure a remote backend with locking (S3, Terraform Cloud, GCS, azurerm). S3 example:

```hcl
terraform {
  backend "s3" {
    bucket       = "<state-bucket>"
    key          = "<project>/terraform.tfstate"
    region       = "<region>"
    encrypt      = true
    use_lockfile = true   # S3 native locking (Terraform 1.11+); otherwise use a DynamoDB lock table
  }
}
```

- Enable versioning + encryption on the state bucket.
- Never commit state or `.tfvars` containing secrets.

## Step 5 — First-deploy gate

```bash
terraform fmt -recursive
terraform validate
terraform plan -out=tfplan      # review every create / change / destroy
# human review of the plan, then:
terraform apply tfplan
```

- Read the plan: zero unexpected destroys, confirm resource counts and blast radius.
- For production, require explicit approval (see the devops agent hard rules).

## Step 6 — Verify + record

- After apply, verify with `terraform output` and provider read calls (`aws ... describe/list`).
- Record the deployed Terraform/provider versions and backend config in the repo README or runbook.

## Upgrade path (later)

- Bump constraints deliberately, one major/minor at a time: `terraform init -upgrade` → re-lock → plan → review → apply.
- Read provider upgrade guides (use `@terraform` / `@aws-documentation`) before any major bump.

## Anti-patterns

- Floating versions (`>= 4.0` with no upper bound) → non-reproducible plans.
- Missing or uncommitted `.terraform.lock.hcl` → drift between machines and CI.
- Starting on local state for shared infra → state loss, no locking.
- `terraform apply -auto-approve` on a first deploy → unreviewed blast radius.
