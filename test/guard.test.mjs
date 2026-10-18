// The guard's tests. The load-bearing one is at the bottom: THE GUARD MUST
// BE ABLE TO FAIL.
//
// A gate that cannot fail is indistinguishable from a gate that passes.
// The first version of this guard had a bug that made it fail EVERY
// package with a `files: ["dist"]` entry -- a directory in `files` was
// matched as a file name -- and it was found by running it against real
// packages, not by reading it. So these tests build real packages and run
// the real guard against them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, '..', 'guard', 'check-publishable.mjs');

function makePkg(dir, { name, main, files, build }) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name, version: '0.1.0', main, files: files ?? ['dist', 'README.md'],
  }, null, 2));
  writeFileSync(join(dir, 'README.md'), '# fixture\n');
  if (build) build(dir);
  return dir;
}

function runGuard(dir) {
  try {
    const out = execFileSync('node', [GUARD, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('a package whose entry point IS shipped passes', () => {
  const d = mkdtempSync(join(tmpdir(), 'guard-ok-'));
  try {
    makePkg(d, { name: 'guard-fixture-ok', main: 'dist/index.js',
      build: (p) => { mkdirSync(join(p, 'dist'), { recursive: true }); writeFileSync(join(p, 'dist', 'index.js'), 'module.exports={};\n'); } });
    const r = runGuard(d);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /PASS/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a package that declares an entry point it does NOT ship FAILS', () => {
  const d = mkdtempSync(join(tmpdir(), 'guard-bad-'));
  try {
    // the census's family: declares dist/index.js, ships dist/src/index.js
    makePkg(d, { name: 'guard-fixture-bad', main: 'dist/index.js',
      build: (p) => { mkdirSync(join(p, 'dist', 'src'), { recursive: true }); writeFileSync(join(p, 'dist', 'src', 'index.js'), 'module.exports={};\n'); } });
    const r = runGuard(d);
    assert.equal(r.code, 1, 'the guard MUST fail on a missing entry point');
    assert.match(r.out, /dist\/index\.js/);
    assert.match(r.out, /NOT IN THE TARBALL/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a `files` entry that is a DIRECTORY includes everything under it', () => {
  // The bug that the first version had: a directory entry was matched as a
  // file name, so `files: ["dist"]` packed nothing and every such package
  // failed. This test fails if that regresses.
  const d = mkdtempSync(join(tmpdir(), 'guard-dir-'));
  try {
    makePkg(d, { name: 'guard-fixture-dir', main: 'dist/index.js',
      build: (p) => { mkdirSync(join(p, 'dist'), { recursive: true }); writeFileSync(join(p, 'dist', 'index.js'), 'module.exports={};\n'); } });
    const r = runGuard(d);
    assert.equal(r.code, 0, 'a directory in `files` must include its contents: ' + r.out);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('THE GUARD CAN FAIL — a deliberately broken package makes it go red', () => {
  const d = mkdtempSync(join(tmpdir(), 'guard-mut-'));
  try {
    makePkg(d, { name: 'guard-fixture-mut', main: 'dist/index.js',
      build: (p) => { mkdirSync(join(p, 'dist'), { recursive: true }); writeFileSync(join(p, 'dist', 'index.js'), 'module.exports={};\n'); } });
    assert.equal(runGuard(d).code, 0, 'the fixture must start green');
    // MUTATE: move the file out from under the declared entry point
    rmSync(join(d, 'dist', 'index.js'));
    const r = runGuard(d);
    assert.equal(r.code, 1, 'after the mutation the guard MUST go red');
    assert.match(r.out, /FAIL/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
