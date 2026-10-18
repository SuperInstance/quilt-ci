#!/usr/bin/env python3
"""Every `uses:` path this repo's README tells people to copy must RESOLVE.

The guard was documented as

    uses: SuperInstance/quilt-ci/.github/workflows/publish-guard.yml@main

and the file was at the REPOSITORY ROOT. GitHub resolves `uses:` against
`.github/workflows/`, so **the documented adoption path did not work** -- and
the README that documented it was in the same commit that shipped it.

This is the same shape as the three files the guard's own README says it
fixes: a documented path that does not exist. So it gets a check.

The check is deliberately literal: it reads the README, finds every
`uses: <owner>/<repo>/.github/workflows/<file>@<ref>` it mentions, and
asserts the file is where that path says it is.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
README = os.path.join(HERE, "README.md")
GUARD = os.path.join(HERE, "guard", "README.md")

paths = set()
for f in (README, GUARD):
    if not os.path.exists(f):
        continue
    text = open(f, encoding="utf-8").read()
    for m in re.finditer(r"uses:\s*([\w.-]+)/([\w.-]+)/\.github/workflows/([\w.-]+)@([\w.-]+)", text):
        owner, repo, wf, ref = m.groups()
        paths.add((owner, repo, wf, ref))

if not paths:
    print("FAIL: no `uses:` workflow paths found in the docs -- the regex may have rotted")
    sys.exit(1)

bad = 0
for owner, repo, wf, ref in sorted(paths):
    if owner == "SuperInstance" and repo == "quilt-ci":
        target = os.path.join(HERE, ".github", "workflows", wf)
    else:
        print(f"  skip  {owner}/{repo}/.github/workflows/{wf}@{ref}  (not this repo)")
        continue
    if os.path.exists(target):
        print(f"  ok    {owner}/{repo}/.github/workflows/{wf}@{ref}")
    else:
        print(f"  MISSING {owner}/{repo}/.github/workflows/{wf}@{ref}")
        print(f"         expected at {target}")
        bad += 1

if bad:
    print(f"\nFAIL: {bad} documented `uses:` path(s) do not resolve.")
    sys.exit(1)
print(f"\nPASS: {len(paths)} documented workflow path(s) resolve.")
