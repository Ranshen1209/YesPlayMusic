/* eslint-env node */
/**
 * Unit tests for src/electron/download.js
 *
 * Strategy: transpile the ESM source to CommonJS with esbuild, then load it
 * with mocked `electron` / `axios` modules so handlers can run in Node.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const stream = require('stream');
const Module = require('module');
const esbuild = require('esbuild');
const assert = require('assert');

const SRC = path.resolve(__dirname, '../../src/electron/download.js');

let testCount = 0;
let failCount = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  for (const { name, fn } of tests) {
    testCount++;
    process.stdout.write(`  • ${name} ... `);
    try {
      await fn();
      console.log('OK');
    } catch (err) {
      failCount++;
      console.log('FAIL');
      console.error(err.stack || err);
    }
  }
  console.log(`\n${testCount - failCount}/${testCount} passed`);
  if (failCount > 0) process.exit(1);
}

function loadDownloadModule(mocks) {
  const compiled = esbuild.buildSync({
    entryPoints: [SRC],
    bundle: false,
    write: false,
    format: 'cjs',
    target: 'node16',
    platform: 'node',
  });
  // Rewrite dynamic `import("axios")` to require() so our require-mock can intercept it.
  const code = compiled.outputFiles[0].text.replace(
    /await import\("axios"\)/g,
    'await Promise.resolve(require("axios"))'
  );

  const m = new Module(SRC);
  m.filename = SRC;
  m.paths = Module._nodeModulePaths(path.dirname(SRC));

  const originalRequire = m.require.bind(m);
  m.require = id => {
    if (mocks[id]) return mocks[id];
    return originalRequire(id);
  };

  m._compile(code, SRC);
  return m.exports;
}

function makeIpcMainMock() {
  const handlers = {};
  return {
    handle(channel, fn) {
      handlers[channel] = fn;
    },
    invoke(channel, payload) {
      const fn = handlers[channel];
      if (!fn) throw new Error(`no handler for ${channel}`);
      return fn({}, payload);
    },
  };
}

function makeAxiosMock(responder) {
  return {
    default: {
      get: async (url, opts) => responder(url, opts),
    },
  };
}

function streamFromBuffer(buf) {
  return stream.Readable.from([buf]);
}

// ---------------- tests ----------------

test('registers all four IPC handlers', () => {
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => '/tmp' },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    ipcMain,
    shell: { openPath: async () => '' },
  };
  const dl = loadDownloadModule({ electron: electronMock });
  dl.registerDownloadHandlers({});
});

test('download:defaultFolder returns app.getPath("music")/YesPlayMusic', () => {
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: which => `/Users/test/${which}` },
    dialog: {},
    ipcMain,
    shell: {},
  };
  const dl = loadDownloadModule({ electron: electronMock });
  dl.registerDownloadHandlers({});
  const result = ipcMain.invoke('download:defaultFolder');
  assert.strictEqual(result, '/Users/test/music/YesPlayMusic');
});

test('download:track writes audio to disk and renames .part', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ypm-dl-'));
  const audioBytes = Buffer.from('FAKE-MP3-DATA');

  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => tmpRoot },
    dialog: {},
    ipcMain,
    shell: {},
  };
  const axiosMock = makeAxiosMock(async (url, opts) => {
    assert.strictEqual(opts.responseType, 'stream');
    return { data: streamFromBuffer(audioBytes) };
  });

  const dl = loadDownloadModule({
    electron: electronMock,
    axios: axiosMock,
  });
  dl.registerDownloadHandlers({});

  const result = await ipcMain.invoke('download:track', {
    id: 12345,
    url: 'https://music.example.com/song/12345.mp3?xx=1',
    track: { name: 'Test Song', ar: [{ name: 'Artist A' }, { name: 'B' }] },
    folder: tmpRoot,
    subFolder: 'My Album',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.id, 12345);
  const expected = path.join(tmpRoot, 'My Album', 'Test Song - Artist A,B.mp3');
  assert.strictEqual(result.path, expected);
  const written = await fs.promises.readFile(expected);
  assert.deepStrictEqual(written, audioBytes);

  assert.ok(!fs.existsSync(`${expected}.part`));

  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

test('download:track infers .flac extension from URL', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ypm-dl-'));
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => tmpRoot },
    dialog: {},
    ipcMain,
    shell: {},
  };
  const axiosMock = makeAxiosMock(async () => ({
    data: streamFromBuffer(Buffer.from('FLAC')),
  }));

  const dl = loadDownloadModule({
    electron: electronMock,
    axios: axiosMock,
  });
  dl.registerDownloadHandlers({});

  const result = await ipcMain.invoke('download:track', {
    id: 1,
    url: 'https://x/y.flac?token=abc',
    track: { name: 'Sample', ar: [{ name: 'X' }] },
    folder: tmpRoot,
    subFolder: '',
  });

  assert.strictEqual(result.ok, true);
  assert.ok(result.path.endsWith('Sample - X.flac'));
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

test('download:track sanitizes filesystem-illegal chars in name and folder', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ypm-dl-'));
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => tmpRoot },
    dialog: {},
    ipcMain,
    shell: {},
  };
  const axiosMock = makeAxiosMock(async () => ({
    data: streamFromBuffer(Buffer.from('x')),
  }));

  const dl = loadDownloadModule({
    electron: electronMock,
    axios: axiosMock,
  });
  dl.registerDownloadHandlers({});

  const result = await ipcMain.invoke('download:track', {
    id: 99,
    url: 'https://x/y.mp3',
    track: { name: 'A/B*C?D"E<F>G|H', ar: [{ name: 'Bad\\Name' }] },
    folder: tmpRoot,
    subFolder: 'Folder/With:Bad?Chars',
  });

  assert.strictEqual(result.ok, true);
  const rel = path.relative(tmpRoot, result.path);
  assert.ok(!/[:*?"<>|]/.test(rel), `path "${rel}" contains illegal chars`);
});

test('download:track returns ok:false with error when url missing', async () => {
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => '/tmp' },
    dialog: {},
    ipcMain,
    shell: {},
  };
  const dl = loadDownloadModule({ electron: electronMock });
  dl.registerDownloadHandlers({});
  const result = await ipcMain.invoke('download:track', {
    id: 7,
    url: '',
    track: { name: 'X', ar: [] },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'no_url');
});

test('download:track surfaces axios error without throwing', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ypm-dl-'));
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => tmpRoot },
    dialog: {},
    ipcMain,
    shell: {},
  };
  const axiosMock = makeAxiosMock(async () => {
    throw new Error('network down');
  });
  const dl = loadDownloadModule({
    electron: electronMock,
    axios: axiosMock,
  });
  dl.registerDownloadHandlers({});

  const result = await ipcMain.invoke('download:track', {
    id: 5,
    url: 'https://x/y.mp3',
    track: { name: 'X', ar: [{ name: 'A' }] },
    folder: tmpRoot,
    subFolder: '',
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.id, 5);
  assert.match(result.error, /network down/);
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

test('download:track falls back to default folder when folder is empty', async () => {
  const fallbackBase = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'ypm-fallback-')
  );
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => fallbackBase },
    dialog: {},
    ipcMain,
    shell: {},
  };
  const axiosMock = makeAxiosMock(async () => ({
    data: streamFromBuffer(Buffer.from('x')),
  }));
  const dl = loadDownloadModule({
    electron: electronMock,
    axios: axiosMock,
  });
  dl.registerDownloadHandlers({});

  const result = await ipcMain.invoke('download:track', {
    id: 1,
    url: 'https://x/y.mp3',
    track: { name: 'S', ar: [{ name: 'A' }] },
    folder: '',
    subFolder: 'sub',
  });

  assert.strictEqual(result.ok, true);
  assert.ok(
    result.path.startsWith(path.join(fallbackBase, 'YesPlayMusic', 'sub'))
  );
  await fs.promises.rm(fallbackBase, { recursive: true, force: true });
});

test('download:openFolder calls shell.openPath with resolved folder', async () => {
  let opened = null;
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => '/Users/test' },
    dialog: {},
    ipcMain,
    shell: {
      openPath: async p => {
        opened = p;
        return '';
      },
    },
  };
  const dl = loadDownloadModule({ electron: electronMock });
  dl.registerDownloadHandlers({});

  await ipcMain.invoke('download:openFolder', '/some/path');
  assert.strictEqual(opened, '/some/path');

  await ipcMain.invoke('download:openFolder', '');
  assert.strictEqual(opened, '/Users/test/YesPlayMusic');
});

test('download:pickFolder returns null when canceled, path when chosen', async () => {
  const ipcMain = makeIpcMainMock();
  let canceled = true;
  const electronMock = {
    app: { getPath: () => '/' },
    dialog: {
      showOpenDialog: async () =>
        canceled
          ? { canceled: true, filePaths: [] }
          : { canceled: false, filePaths: ['/picked/here'] },
    },
    ipcMain,
    shell: {},
  };
  const dl = loadDownloadModule({ electron: electronMock });
  dl.registerDownloadHandlers({});

  let r = await ipcMain.invoke('download:pickFolder');
  assert.strictEqual(r, null);
  canceled = false;
  r = await ipcMain.invoke('download:pickFolder');
  assert.strictEqual(r, '/picked/here');
});

test('download:track writes file even when track has no artists', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ypm-dl-'));
  const ipcMain = makeIpcMainMock();
  const electronMock = {
    app: { getPath: () => tmpRoot },
    dialog: {},
    ipcMain,
    shell: {},
  };
  const axiosMock = makeAxiosMock(async () => ({
    data: streamFromBuffer(Buffer.from('x')),
  }));
  const dl = loadDownloadModule({
    electron: electronMock,
    axios: axiosMock,
  });
  dl.registerDownloadHandlers({});

  const result = await ipcMain.invoke('download:track', {
    id: 42,
    url: 'https://x/y.mp3',
    track: { name: 'NoArtists', ar: [] },
    folder: tmpRoot,
    subFolder: '',
  });

  assert.strictEqual(result.ok, true);
  assert.ok(result.path.endsWith('NoArtists.mp3'));
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

runAll();
