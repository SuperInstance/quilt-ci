# publish-guard

**Would a consumer be able to use this package?**

A measurement over **455 published versions across 161 packages** (every
version fetched, zero errors) found:

| | count | share |
|---|---|---|
| versions declaring an entry point the package does not ship | **36** | 8.8% |
| **`require()` that provably throws** | **40 packages** | across 15 packages |
| `require()` OK but no `types` (TypeScript TS7016) | 18 | reported separately |
| not Node packages | 14 | excluded |

The pattern in one line: **no package here tests the artifact it publishes.**
The suite passes, the build is green, the package installs cleanly — and
then `require()` throws, because **the install is the happy path and the use
is the failure.**

## What it does

1. **Packs the package** — the file selection follows npm-packlist's rules
   (always-included `package.json` / `README*` / `LICENSE*` and the file at
   `main`; the `files` array if present, where a **directory** entry means
   everything under it; otherwise the tree minus the default ignores).
2. **Checks every declared entry point against the tarball** — `main`,
   `module`, `types`/`typings`, every branch of `exports`, every `bin`.
   A declared target that is not in the tarball is a failure.
3. **`--strict` also installs the tarball and `require()`s it** — the real
   consumer path, with the real dependency tree.

## Why it does not shell out to `npm pack`

Because `npm pack` is not reliable enough to be a gate. In this fleet it
dies with an `errno -122` on `close` and leaves **no tarball** — and a gate
that cannot run is a gate that does not exist. The file selection is done
here instead, and the report says it is an approximation of npm's
packlist.

The approximation is conservative in the direction that matters: a file npm
would exclude but this includes can only make the guard **pass** a package
npm would have shipped broken. And the `files`-field check — the one that
catches the root cause — does not depend on the approximation at all.

## It can fail, and that is verified

`test/guard.test.mjs` builds real packages and runs the real guard against
them. The load-bearing test moves the file out from under a declared entry
point and asserts the guard goes **red**.

**The first version of this guard had a bug that made it fail EVERY package
with a `files: ["dist"]` entry** — a directory in `files` was being matched
as a file name. It was found by running the guard against real packages,
not by reading it. The guard is a gate, and a gate that has never been run
against the fleet is a guess.

## Use it

As a reusable workflow, in a consuming repo:

```yaml
- uses: SuperInstance/quilt-ci/.github/workflows/publish-guard.yml@main
  with:
    package-dir: .
```

Or locally, before publishing:

```bash
node ../quilt-ci/guard/check-publishable.mjs . --strict
```

Or as a `prepublishOnly` step, so the failure lands at publish time rather
than at a consumer's install:

```json
{ "scripts": { "prepublishOnly": "node ../quilt-ci/guard/check-publishable.mjs . --strict" } }
```
