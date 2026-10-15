# quilt-ci

> A reusable set of GitHub Actions workflows for any git.pp port repo. Drop them in `.github/workflows/` and you get a conformance check, a benchmark, and a release workflow — all maintained centrally.

## What's in it

- **`conformance.yml`** — runs the public conformance corpus (`SuperInstance/gitpp-conformance`) against your port on every push and PR.
- **`bench.yml`** — runs the benchmark suite (`SuperInstance/gitpp-bench`) on every push to main. Posts a comment to the PR with the mean / p50 / p99 numbers.
- **`release.yml`** — when you tag a version (e.g. `v0.2.0`), runs the conformance one more time, then if green, creates a GitHub release with the pre-built artifacts.

## Use it

In your port repo (e.g. `SuperInstance/gitpp-foo`):

```bash
mkdir -p .github/workflows
curl -sS https://raw.githubusercontent.com/SuperInstance/quilt-ci/main/conformance.yml > .github/workflows/conformance.yml
curl -sS https://raw.githubusercontent.com/SuperInstance/quilt-ci/main/bench.yml > .github/workflows/bench.yml
```

Then add a small wrapper that tells the workflow where your port is:

```yaml
# .github/workflows/conformance.yml (your copy)
name: conformance
on: [push, pull_request]
jobs:
  test:
    uses: SuperInstance/quilt-ci/.github/workflows/conformance.yml@main
    with:
      port-path: ./src
      port-command: node src/index.js
```

That's it. The central workflow knows how to clone `gitpp-conformance`, run the runner against your port, and report the verdict.

## Why a central workflow

Three reasons:

1. **One place to fix the runner when it changes.** When `gitpp-conformance` adds a new case, the workflow picks it up automatically. Port authors don't need to update their own CI.
2. **A uniform badge.** Every conformant port shows `conformance: passing` in the same format. Easy to compare.
3. **A uniform PR comment.** When a port PR breaks conformance, the bot posts the same table of pass/fail across all ports. Easy to triage.

## What you'll see

When the conformance workflow runs, you'll see:

```
=== Conformance: gitpp-foo @ <sha> ===
28 cases run; 28 passed; 0 failed
  L1/integer-encoding: PASS
  L1/signed-zero: PASS
  ...
  V1/mismatch: PASS
```

When the bench workflow runs, you'll see:

```
=== Bench: gitpp-foo @ <sha> ===
Live poc-quilt-1 fold: 0.32 ms mean / 0.20 ms p50 / 1.27 ms p99
Live poc-quilt-1 closure root: 1.03 ms mean / 0.67 ms p50 / 3.17 ms p99
  (regression check: fold time is < 1.5x of the JS port baseline)
```

## How the port is invoked

The workflow expects a port to be a CLI that takes:

```
<port-command> read <records.json>
```

The `read` subcommand reads a JSON record set from a file and prints `{ state, conflicts, order, orphans, closureRoot }` to stdout as JSON. The wrapper checks the output against the expected.

If your port has a different interface, write a thin adapter (a 10-line shell script) that translates.
