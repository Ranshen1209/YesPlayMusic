const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');
const esbuild = require('esbuild');

const source = path.resolve(__dirname, '../../src/electron/windowsVibrancy.js');
const code = esbuild.buildSync({
  entryPoints: [source],
  bundle: false,
  write: false,
  format: 'cjs',
  target: 'es2015',
  platform: 'node',
}).outputFiles[0].text;

function setup({
  windows = true,
  release = '10.0.22621',
  nativeApi = true,
} = {}) {
  const theme = Object.assign(new EventEmitter(), {
    shouldUseDarkColors: false,
    shouldUseHighContrastColors: false,
    inForcedColorsMode: false,
    prefersReducedTransparency: false,
  });
  const calls = { materials: [], colors: [], messages: [] };
  const win = Object.assign(new EventEmitter(), {
    ypmVibrancyEnabled: false,
    isDestroyed: () => false,
    setBackgroundColor: value => calls.colors.push(value),
    webContents: {
      isDestroyed: () => false,
      send: (...args) => calls.messages.push(args),
    },
  });
  if (nativeApi) {
    win.setBackgroundMaterial = value => calls.materials.push(value);
  }
  const settings = { enableVibrancy: true };
  const mocks = {
    electron: {
      nativeTheme: theme,
      systemPreferences: { getColor: () => '#123456' },
    },
    os: { release: () => release },
    '@/utils/platform': { isWindows: windows },
  };
  const module = new Module(source);
  module.filename = source;
  module.require = id => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency ${id}`);
    return mocks[id];
  };
  module._compile(code, source);
  const api = module.exports;
  const init = () => api.initWindowsVibrancy(win, { get: () => settings });
  const update = () => api.updateWindowsVibrancy(win, settings);
  return { api, win, theme, settings, calls, init, update };
}

test('supports Windows 11 22H2+, with a public Electron material API', () => {
  for (const release of ['10.0.22621', '10.0.26100', '11.0.1']) {
    const { api, win } = setup({ release });
    assert.equal(api.supportsWindowsVibrancy(win), true, release);
  }
  for (const options of [
    { windows: false },
    { nativeApi: false },
    { release: '10.0.22000' },
    { release: '10.0.19045' },
    { release: '6.3.9600' },
    { release: 'unknown' },
  ]) {
    const { api, win } = setup(options);
    assert.equal(
      api.supportsWindowsVibrancy(win),
      false,
      JSON.stringify(options)
    );
  }
});

test('initializes acrylic and publishes the actual enabled state', () => {
  const { init, win, calls } = setup();
  init();
  assert.equal(win.ypmVibrancySupported, true);
  assert.equal(win.ypmVibrancyEnabled, true);
  assert.deepEqual(calls.materials, ['acrylic']);
  assert.deepEqual(calls.colors, ['#00000000']);
  assert.deepEqual(calls.messages, [['vibrancy-changed', true]]);
});

test('older Windows keeps an opaque window without invoking native material APIs', () => {
  const { init, win, calls } = setup({ release: '10.0.19045' });
  init();
  assert.equal(win.ypmVibrancyEnabled, false);
  assert.deepEqual(calls.materials, []);
  assert.deepEqual(calls.colors, ['#ffffff']);
});

test('does not modify macOS or Linux window state', () => {
  const { init, update, win, theme, calls } = setup({ windows: false });
  win.ypmVibrancyEnabled = true;
  init();
  update();
  assert.equal(win.ypmVibrancyEnabled, true);
  assert.equal(theme.listenerCount('updated'), 0);
  assert.deepEqual(calls, { materials: [], colors: [], messages: [] });
});

test('toggles immediately and restores a theme-matched opaque background', () => {
  const { init, update, settings, theme, win, calls } = setup();
  settings.enableVibrancy = false;
  init();
  settings.enableVibrancy = true;
  update();
  theme.shouldUseDarkColors = true;
  settings.enableVibrancy = false;
  update();
  assert.equal(win.ypmVibrancyEnabled, false);
  assert.deepEqual(calls.materials, ['acrylic', 'none']);
  assert.deepEqual(calls.colors, ['#ffffff', '#00000000', '#222222']);
  theme.shouldUseDarkColors = false;
  theme.emit('updated');
  assert.equal(calls.colors.at(-1), '#ffffff');
});

for (const flag of [
  'shouldUseHighContrastColors',
  'inForcedColorsMode',
  'prefersReducedTransparency',
]) {
  test(`${flag} disables acrylic and restores it when the preference clears`, () => {
    const { init, win, theme, calls, settings } = setup();
    init();
    theme[flag] = true;
    theme.emit('updated');
    assert.equal(win.ypmVibrancyEnabled, false);
    assert.equal(settings.enableVibrancy, true);
    assert.equal(
      calls.colors.at(-1),
      flag === 'shouldUseHighContrastColors' ? '#123456' : '#ffffff'
    );
    theme[flag] = false;
    theme.emit('updated');
    assert.equal(win.ypmVibrancyEnabled, true);
    assert.deepEqual(calls.materials, ['acrylic', 'none', 'acrylic']);
  });
}

test('native API failure never exposes a transparent renderer over a failed material', () => {
  const { init, win, calls } = setup();
  win.setBackgroundMaterial = () => {
    throw new Error('DWM unavailable');
  };
  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    init();
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(win.ypmVibrancyEnabled, false);
  assert.deepEqual(calls.colors, ['#ffffff']);
  assert.deepEqual(calls.messages, []);
});

test('unrelated settings updates do not reapply the effect or send redundant IPC', () => {
  const { init, update, theme, calls } = setup();
  init();
  update();
  theme.emit('updated');
  assert.deepEqual(calls.materials, ['acrylic']);
  assert.deepEqual(calls.colors, ['#00000000']);
  assert.deepEqual(calls.messages, [['vibrancy-changed', true]]);
});

test('releases theme listeners and ignores updates after the window closes', () => {
  const { init, update, win, theme, calls } = setup();
  init();
  assert.equal(theme.listenerCount('updated'), 1);
  win.isDestroyed = () => true;
  win.emit('closed');
  assert.equal(theme.listenerCount('updated'), 0);
  theme.shouldUseHighContrastColors = true;
  theme.emit('updated');
  update();
  assert.deepEqual(calls.materials, ['acrylic']);
});
