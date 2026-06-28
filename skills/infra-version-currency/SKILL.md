---
name: infra-version-currency
description: >
  Always resolve, pin, and record the current latest stable/supported version of every
  versioned infrastructure component before provisioning or upgrading — never trust training-data
  defaults. Authoritative version-check commands for Amazon EKS (Kubernetes versions + add-ons +
  version skew), Amazon MSK (Apache Kafka versions), Terraform CLI & providers, Docker base images
  (pin by digest), Helm charts, and AWS CLI v2. Use whenever choosing or upgrading an EKS cluster
  version, MSK Kafka version, Terraform provider, container base image, or Helm chart.
  Triggers: latest version, EKS version, eksctl, describe-addon-versions, MSK Kafka version,
  list-kafka-versions, terraform provider version, .terraform.lock.hcl, pin image digest,
  helm chart version, version skew, upgrade EKS, end of support.
origin: harness
workloads: [cloud]
---

# Infrastructure Version Currency

The default failure mode of an AI agent is to emit a version number from training data that is
months stale, deprecated, or past end-of-support. **Never do that.** Before provisioning or
upgrading any versioned component, resolve the current value from the authoritative source,
pin it explicitly, and record the resolved version + date in the plan.

## Protocol (apply to every versioned component)

1. **Resolve** — run the check command below (or query the docs MCP / registry). Do not state a version from memory.
2. **Pin** — write the exact version/digest into IaC (provider constraint, AMI/version field, image digest, chart version). No floating `latest`.
3. **Record** — in the plan/PR, note `component: resolved X.Y on YYYY-MM-DD (source)` so the choice is auditable and re-checkable.
4. **Check support window** — confirm the version is not within ~1–2 releases of end-of-support; if it is, plan the upgrade now.

## Amazon EKS (Kubernetes)

EKS supports a rolling window of Kubernetes minor versions and lags upstream k8s — pick the latest **EKS-supported** version, not the newest upstream k8s.

```bash
# Latest Kubernetes versions EKS currently offers (via the add-on version API)
aws eks describe-addon-versions \
  --query 'sort_by(addons[0].addonVersions[].compatibilities[].clusterVersion | [],&@) | reverse(@) | [0]'
# Cluster's current version and what it can upgrade to
aws eks describe-cluster --name <cluster> --query 'cluster.version'
```

- Authoritative list + **end-of-support dates**: EKS docs "Kubernetes versions" / "version lifecycle". Standard support is ~14 months, then extended support (billed) — don't run past it.
- **Add-ons** — resolve the default/latest compatible version per cluster version, don't hardcode:
  ```bash
  aws eks describe-addon-versions --addon-name vpc-cni --kubernetes-version 1.XX \
    --query 'addons[].addonVersions[?compatibilities[0].defaultVersion].addonVersion'
  # repeat for: coredns, kube-proxy, aws-ebs-csi-driver, aws-efs-csi-driver
  ```
- **Version skew**: managed node groups / self-managed nodes must be within the supported skew of the control plane (kubelet not newer than API server; within a couple of minor versions). Upgrade control plane first, then nodes, then add-ons.
- `eksctl version` and the AWS provider / EKS Terraform module also pin a cluster version — keep them aligned with the resolved EKS version.

## Amazon MSK (Apache Kafka)

```bash
# Apache Kafka versions MSK currently supports — pick the latest stable, not a memorized number
aws kafka list-kafka-versions --query 'KafkaVersions[].Version'
```

- MSK deprecates older Kafka versions on a schedule; check the MSK "supported Kafka versions" docs for deprecation dates before pinning.
- When choosing broker setup, also re-check current options that change over time: **Express brokers**, **tiered storage**, **Graviton** instance types, and Provisioned vs **Serverless** — verify availability in your region via the docs MCP rather than assuming.
- Pin the version in IaC (`kafka_version` on the MSK cluster resource) and plan upgrades (in-place version upgrade is supported but one-way).

## Terraform CLI & providers

```bash
terraform version                  # installed CLI
terraform providers                # providers + version constraints in use
terraform init -upgrade            # bump to newest allowed by constraints, updates the lock
```

- Resolve latest stable CLI + provider versions via the `@terraform` MCP / Terraform Registry; set `required_version` and provider `version` constraints, then commit `.terraform.lock.hcl`. See the `terraform-deployment` skill for the greenfield pin→lock→plan→apply gate.
- Pin providers with `~>` (allow patches, block surprise majors). Re-run `init -upgrade` deliberately, not implicitly.

## Docker base images (pin by digest)

```bash
# Resolve the current digest for a tag, then pin the digest (immutable), not the moving tag
docker manifest inspect <image>:<tag> | jq -r '.config.digest // .manifests[].digest'
```

- Reference base images as `image:1.2.3@sha256:...` — the tag documents intent, the digest guarantees immutability. **Never** ship `:latest`.
- Re-resolve digests on a cadence (renovate/dependabot) so security patches land deliberately, with a diff to review.

## Helm charts

```bash
helm repo update
helm search repo <repo>/<chart> --versions | head   # available chart versions
```

- Pin the chart `--version` in CI/GitOps; don't deploy whatever is newest at apply time.

## AWS CLI v2

```bash
aws --version    # confirm v2 (v1 is EOL-track); pin v2 in CI rather than `pip install awscli` (that's v1)
```

## Pitfalls

- **Version from memory** — the core anti-pattern. Always run the check command first.
- **Newest upstream k8s on EKS** — EKS lags; only EKS-supported versions exist. Use `describe-addon-versions`.
- **Running past EKS end-of-support** — silent extended-support billing + forced upgrade. Track the lifecycle dates.
- **Hardcoded add-on versions** — break on cluster upgrade. Resolve per cluster version.
- **Floating `:latest` images / unpinned charts** — non-reproducible deploys, surprise breakage. Pin digest/version.
- **Upgrading nodes before control plane** — violates skew. Control plane → nodes → add-ons.

## Related

- `terraform-deployment` — greenfield Terraform version pinning + lock + first deploy
- `docker-patterns` — image build/security (digest pinning, multi-stage)
- `aws-cloud` — EKS/Fargate/networking foundation
- `deployment-patterns` — CI/CD, rollout/rollback
