# Eval Harness Guide

Formal evaluation framework for Kiro sessions implementing eval-driven development (EDD).

## When to Use

- Setting up eval-driven development for AI-assisted workflows
- Defining pass/fail criteria for task completion
- Measuring reliability with pass@k metrics
- Creating regression test suites for prompt or agent changes

## Eval Types

### Capability Evals
Test if a new capability works:
```
[CAPABILITY EVAL: feature-name]
Task: Description
Success Criteria:
  - [ ] Criterion 1
  - [ ] Criterion 2
Expected Output: Description
```

### Regression Evals
Ensure changes don't break existing functionality:
```
[REGRESSION EVAL: feature-name]
Baseline: SHA or checkpoint
Tests:
  - test-1: PASS/FAIL
  - test-2: PASS/FAIL
Result: X/Y passed
```

## Grader Types

1. Code-Based — deterministic checks (grep, test runners, build)
2. Model-Based — LLM-as-judge rubric scoring 1-5
3. Human — manual review for security/ambiguous outputs

## Metrics

- pass@1: first attempt success rate
- pass@3: success within 3 attempts (target > 90%)
- pass^3: all 3 trials succeed (target 100% for release-critical)

## Workflow

### 1. Define (before coding)
```
EVAL DEFINITION: feature-xyz

Capability Evals:
1. Can create new user account
2. Can validate email format

Regression Evals:
1. Existing login still works
2. Session management unchanged

Success Metrics:
- pass@3 > 90% for capability
- pass^3 = 100% for regression
```

### 2. Implement
Write code to pass the defined evals.

### 3. Evaluate
Run each eval, record PASS/FAIL. Use getDiagnostics for type/lint checks.
Remind user to run test suites manually.

### 4. Report
```
EVAL REPORT: feature-xyz
========================
Capability: 3/3 passed (pass@3: 100%)
Regression: 3/3 passed (pass^3: 100%)
Status: READY FOR REVIEW
```

## Eval Storage

```
.kiro/evals/
  feature-xyz.md      # eval definition
  feature-xyz.log     # run history
  baseline.json       # regression baselines
```

## Best Practices

1. Define evals BEFORE coding
2. Run evals frequently
3. Track pass@k over time
4. Use code graders when possible
5. Human review for security
6. Keep evals fast
7. Version evals with code

## Anti-Patterns

- Overfitting prompts to known eval examples
- Measuring only happy-path outputs
- Ignoring cost/latency drift while chasing pass rates
- Allowing flaky graders in release gates
