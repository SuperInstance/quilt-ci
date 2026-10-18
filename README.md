# quilt-ci

> A reusable set of GitHub Actions workflows for any git.pp port repo. Drop them in `.github/workflows/` and you get a conformance check, a benchmark, and a release workflow — all maintained centrally.

## What's in it, and where it lives

These three files do **different** jobs, and they live in **different places** for a reason.

| file | role | where it lives |
|---|---|---|
| `conformance.yml` | a **reusable workflow** — called by a port repo with `uses:` | `.github/workflows/` |
| `bench.yml` | a **template** — copied into a port repo | the repository root |
| `release.yml` | a **template** — copied into a port repo | the repository root |

The distinction is not cosmetic.

- A **reusable workflow** must live in `.github/workflows/`, because that is the path a `uses:` reference resolves to. The reference every caller writes is
  `uses: SuperInstance/quilt-ci/.github/workflows/conformance.yml@main`
  so that is where the file has to be.
- The two **templates** are copied into a port repo and run *there*, against *that* repo's port. Run in `quilt-ci` itself they have no port to benchmark and no port to release, so they fail — and a permanently red workflow in this repo is a permanently red badge that teaches you to ignore red.

All three were at the repository root at first, which is why the reusable reference resolved to nothing.

## Use it

The workflows live in `.github/workflows/` so that the `uses:` reference
below resolves. They used to sit at the repository ROOT, which meant the
reusable reference pointed at a path that did not exist -- and GitHub
reports that as **a failure with zero jobs**: no error, no steps, no
explanation.

In your port repo (e.g. `SuperInstance/gitpp-foo`), add a small wrapper:

```yaml
# .github/workflows/conformance.yml (your copy)
name: conformance
on: [push, pull_request]
jobs:
  conformance:
    uses: SuperInstance/quilt-ci/.github/workflows/conformance.yml@main
    secrets: inherit
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
