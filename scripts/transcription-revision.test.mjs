import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureTranscriptionRevision } from './lib/transcription-revision.mjs';

test('revision snapshots include actual dirty files and preserve the existing staged index', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'midi-stage-revision-test-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  try {
    git('init', '--quiet');
    writeFileSync(join(cwd, 'source.txt'), 'base\n');
    git('add', 'source.txt');
    git('-c', 'user.name=Benchmark test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
    const clean = captureTranscriptionRevision(cwd);
    assert.equal(clean.testedTree, git('rev-parse', 'HEAD^{tree}'));
    assert.equal(clean.dirty, false);
    writeFileSync(join(cwd, 'source.txt'), 'staged\n'); git('add', 'source.txt');
    writeFileSync(join(cwd, 'source.txt'), 'actually tested\n');
    writeFileSync(join(cwd, 'new.txt'), 'untracked input\n');
    const index = readFileSync(join(cwd, '.git/index'));
    const dirty = captureTranscriptionRevision(cwd);
    assert.equal(dirty.baseCommit, clean.baseCommit); assert.equal(dirty.dirty, true);
    assert.notEqual(dirty.testedTree, clean.testedTree);
    assert.equal(git('show', `${dirty.testedTree}:source.txt`), 'actually tested');
    assert.equal(git('show', `${dirty.testedTree}:new.txt`), 'untracked input');
    assert.deepEqual(readFileSync(join(cwd, '.git/index')), index);
    assert.equal(git('show', ':source.txt'), 'staged');
  } finally { rmSync(cwd, { recursive: true }); }
});
