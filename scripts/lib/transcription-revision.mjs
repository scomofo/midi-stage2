import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Snapshot staged, unstaged and untracked files without changing the user's index. */
export function captureTranscriptionRevision(cwd = process.cwd()) {
  const directory = mkdtempSync(join(tmpdir(), 'midi-stage-benchmark-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, 'index') };
  const git = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  try {
    const baseCommit = git('rev-parse', 'HEAD');
    const baseTree = git('rev-parse', 'HEAD^{tree}');
    git('read-tree', 'HEAD');
    git('add', '-A', '--', '.');
    const testedTree = git('write-tree');
    return { baseCommit, testedTree, dirty: testedTree !== baseTree, capture: 'git-working-tree' };
  } finally {
    rmSync(directory, { recursive: true });
  }
}
