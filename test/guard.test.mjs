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
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
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

// --- the --strict arm was never tested, and it was broken ------------------
//
// `--strict` referenced an undeclared `uc`, so every strict run raised a
// ReferenceError BEFORE the probe ran: it failed on every package, healthy
// ones included, with a blank message. Wired into `prepublishOnly` as it
// stood, it would have blocked the entire fleet. And the suite never
// passed --strict, so nothing noticed.
//
// These are the tests that should have existed.

// npm's CLI is broken in some sandboxes (an errno -122 on close, which
// kills every `npm install` including a trivial one). The strict arm
// shells out to npm, so in such a sandbox it CANNOT be exercised.
//
// A skip here must be LOUD. A silently-skipped test is a green badge over
// a test that did not happen -- which is the fleet's own signature defect.
// The probe must do what the guard does: install a TARBALL. A plain
// `npm install` of a dependency-free package can succeed in an
// environment where installing a local tarball dies (npm's errno -122 on
// close). Probing the wrong thing would make the skip fire where the
// guard would actually work.
const NPM_WORKS = (() => {
  const d = mkdtempSync(join(tmpdir(), 'npm-canary-'));
  try {
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'npm-canary', version: '1.0.0', main: './index.js' }));
    writeFileSync(join(d, 'index.js'), 'module.exports = {};\n');
    const pack = spawnSync('npm', ['pack', '--pack-destination', d], { cwd: d, encoding: 'utf8' });
    if (pack.status !== 0) return false;
    const tgz = readdirSync(d).find((f) => f.endsWith('.tgz'));
    if (!tgz) return false;
    const c2 = mkdtempSync(join(tmpdir(), 'npm-canary2-'));
    try {
      writeFileSync(join(c2, 'package.json'), JSON.stringify({ name: 'npm-canary-consumer', version: '1.0.0' }));
      const r = spawnSync('npm', ['install', join(d, tgz), '--no-audit', '--no-fund', '--userconfig', '/dev/null'],
        { cwd: c2, encoding: 'utf8' });
      return r.status === 0;
    } finally { rmSync(c2, { recursive: true, force: true }); }
  } catch { return false; } finally { rmSync(d, { recursive: true, force: true }); }
})();
if (!NPM_WORKS) {
  console.log('  NOTE: npm cannot install in this environment, so the --strict arm ' +
              'CANNOT be exercised here. The two --strict tests are SKIPPED, not passed.');
}

test('--strict works on a HEALTHY package', { skip: !NPM_WORKS && 'npm cannot install in this environment' }, () => {
  // A canary that exports something and has a real dist/.
  const dir = mkdtempSync(join(tmpdir(), 'guard-strict-'));
  try {
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'guard-strict-canary', version: '1.0.0',
      main: './dist/index.js', types: './dist/index.d.ts',
    }));
    writeFileSync(join(dir, 'dist', 'index.js'), 'module.exports = { hello: () => "hi" };\n');
    writeFileSync(join(dir, 'dist', 'index.d.ts'), 'export declare function hello(): string;\n');
    const r = spawnSync('node', [GUARD, dir, '--strict'], { encoding: 'utf8' });
    assert.notEqual(r.status, 1,
      '--strict must NOT fail a healthy package: ' + (r.stdout || '') + (r.stderr || ''));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--strict FAILS a package whose entry point does not load', { skip: !NPM_WORKS && 'npm cannot install in this environment' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-strict-bad-'));
  try {
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'guard-strict-bad', version: '1.0.0', main: './dist/index.js',
    }));
    // the file exists but THROWS on load -- the install-is-fine, use-fails case
    writeFileSync(join(dir, 'dist', 'index.js'), 'throw new Error("boom at import time");\n');
    const r = spawnSync('node', [GUARD, dir, '--strict'], { encoding: 'utf8' });
    assert.equal(r.status, 1, '--strict must fail a package that throws on load');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the guard does not ignore dist/, because npm SHIPS dist/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-dist-'));
  try {
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'guard-dist-canary', version: '1.0.0', main: './dist/index.js',
    }));
    writeFileSync(join(dir, 'dist', 'index.js'), 'module.exports = {};\n');
    const r = spawnSync('node', [GUARD, dir], { encoding: 'utf8' });
    assert.ok(!/NOT IN THE TARBALL/.test(r.stdout || ''),
      'a package shipping dist/index.js must not be reported as missing it');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
