const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const script = path.resolve(__dirname, '../../scripts/build-release.sh');

function build(mode, runner) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ypm-release-build-'));
  const counter = path.join(dir, 'calls');
  fs.writeFileSync(
    path.join(dir, 'yarn'),
    `#!/usr/bin/env bash
test "$*" = electron:build || exit 99
calls=$(cat "$YPM_BUILD_TEST_COUNT" 2>/dev/null || echo 0)
calls=$((calls + 1))
echo "$calls" > "$YPM_BUILD_TEST_COUNT"
case "$YPM_BUILD_TEST_MODE" in
  success) exit 0 ;;
  transient) if [[ "$calls" -gt 1 ]]; then exit 0; fi ;;
  compile) echo 'Compilation failed'; exit 2 ;;
esac
echo 'hdiutil: could not eject disk2 - Resource busy' >&2
exit 16
`,
    { mode: 0o755 }
  );
  fs.writeFileSync(path.join(dir, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', {
    mode: 0o755,
  });
  try {
    const result = spawnSync('bash', [script], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: dir + path.delimiter + process.env.PATH,
        RUNNER_OS: runner,
        YPM_BUILD_TEST_COUNT: counter,
        YPM_BUILD_TEST_MODE: mode,
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(result.error);
    return { status: result.status, calls: Number(fs.readFileSync(counter)) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// POSIX executable fixtures run on Linux and macOS; Windows runs the actual
// release script under the workflow's Git Bash shell.
const options = { skip: process.platform === 'win32' };
test('successful builds run once', options, () => {
  assert.deepEqual(build('success', 'macOS'), { status: 0, calls: 1 });
});
test('a transient macOS DMG lock is retried', options, () => {
  assert.deepEqual(build('transient', 'macOS'), { status: 0, calls: 2 });
});
test('persistent DMG locks fail after three attempts', options, () => {
  assert.deepEqual(build('busy', 'macOS'), { status: 16, calls: 3 });
});
test('compiler failures fail immediately', options, () => {
  assert.deepEqual(build('compile', 'macOS'), { status: 2, calls: 1 });
});
test('other platforms never retry DMG errors', options, () => {
  assert.deepEqual(build('busy', 'Linux'), { status: 16, calls: 1 });
  assert.deepEqual(build('busy', 'Windows'), { status: 16, calls: 1 });
});
