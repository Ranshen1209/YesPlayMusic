const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { _electron: electron } = require('playwright');
const { expect } = require('@playwright/test');
const pkg = require('../package.json');

const executablePath = process.argv[2] && path.resolve(process.argv[2]);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ypm-release-smoke-'));
let app;
let pageForDiagnostics;
let apiPort;
let rendererOrigin;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function launch() {
  const args = [`--user-data-dir=${profile}`];
  if (!executablePath) args.push(path.resolve('dist_electron/bundled'));
  // 仅 CI 的无桌面 Linux 会话需要此参数；发布应用不改变沙箱配置。
  if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
  app = await electron.launch({
    executablePath: executablePath || require('electron'),
    args,
    env: {
      ...process.env,
      IS_TEST: 'true',
      YPM_TEST_API_PORT: String(apiPort),
      YPM_TEST_RENDERER_PORT: new URL(rendererOrigin).port,
    },
    timeout: 45000,
  });
  const page = await app.firstWindow({ timeout: 30000 });
  pageForDiagnostics = page;
  page.on('pageerror', error =>
    console.error('Renderer startup error:', error)
  );
  page.on('console', message => {
    if (message.type() === 'error')
      console.error('Renderer console:', message.text());
  });
  await page.waitForSelector('nav');
  await page.waitForFunction(() => !!window.yesplaymusic.player);
  const info = await app.evaluate(({ app }) => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    arch: process.arch,
    profile: app.getPath('userData'),
  }));
  assert.equal(info.version, pkg.version);
  assert.equal(info.electron, pkg.dependencies.electron);
  assert.equal(fs.realpathSync(info.profile), fs.realpathSync(profile));
  assert.equal(
    await page.evaluate(
      () =>
        Object.keys(window.require('@unblockneteasemusic/rust-napi')).length > 0
    ),
    true
  );
  const response = await fetch(`http://127.0.0.1:${apiPort}/login/status`, {
    method: 'OPTIONS',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 204);
  await page.evaluate(() => {
    location.hash = '/settings';
  });
  await page.waitForSelector('.settings-page');
  console.log('Application startup:', JSON.stringify(info));
  return page;
}

async function materialState() {
  return app.evaluate(({ BrowserWindow, nativeTheme }, origin) => {
    const win = BrowserWindow.getAllWindows().find(window =>
      window.webContents.getURL().startsWith(origin + '/')
    );
    return {
      supported: win.ypmVibrancySupported,
      enabled: win.ypmVibrancyEnabled,
      background: win.getBackgroundColor(),
      theme: nativeTheme.themeSource,
      reducedTransparency: nativeTheme.prefersReducedTransparency,
      highContrast:
        nativeTheme.shouldUseHighContrastColors ||
        nativeTheme.inForcedColorsMode,
      resizable: win.isResizable(),
      maximizable: win.isMaximizable(),
    };
  }, rendererOrigin);
}

async function main() {
  apiPort = await freePort();
  let rendererPort = await freePort();
  while (rendererPort === apiPort) rendererPort = await freePort();
  rendererOrigin = `http://localhost:${rendererPort}`;
  let page = await launch();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (process.platform === 'linux') {
    assert.equal(await page.locator('#enable-vibrancy').count(), 0);
    assert.equal(await page.getAttribute('body', 'data-vibrancy'), 'off');
  } else {
    const checkbox = page.locator('#enable-vibrancy');
    const initial = await materialState();
    assert.equal(await checkbox.isDisabled(), !initial.supported);
    if (initial.supported) {
      await page.locator('label[for="enable-vibrancy"]').click();
      await expect(checkbox).toBeChecked();
      if (process.platform === 'darwin') {
        // macOS 保持重启生效，同时验证新运行时能恢复已保存的原生毛玻璃。
        await app.close();
        app = null;
        page = await launch();
        page.on('pageerror', error => errors.push(error.message));
      }
      const expected =
        process.platform === 'darwin' ||
        (!initial.reducedTransparency && !initial.highContrast);
      await expect
        .poll(async () => (await materialState()).enabled)
        .toBe(expected);
      await expect(page.locator('body')).toHaveAttribute(
        'data-vibrancy',
        expected ? 'on' : 'off'
      );
      await page
        .locator('select:has(option[value="dark"])')
        .first()
        .selectOption('dark');
      await expect.poll(async () => (await materialState()).theme).toBe('dark');
      await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
      if (process.platform === 'win32') {
        const bounds = await page.evaluate(() => ({
          navigation: document.querySelector('nav').getBoundingClientRect()
            .bottom,
          content: document.querySelector('main').getBoundingClientRect().top,
        }));
        if (expected) assert.ok(bounds.content >= bounds.navigation);
        const state = await materialState();
        assert.equal(state.resizable, true);
        assert.equal(state.maximizable, true);
        await page.screenshot({
          path: 'dist_electron/smoke-win32-acrylic.png',
        });
        await page.locator('label[for="enable-vibrancy"]').click();
        await expect
          .poll(async () => (await materialState()).enabled)
          .toBe(false);
        await expect(page.locator('body')).toHaveAttribute(
          'data-vibrancy',
          'off'
        );
        if (!initial.highContrast) {
          assert.match((await materialState()).background, /^#(?:ff)?222222$/i);
        }
      }
    }
  }
  // 运行时升级后的 OAuth 弹窗仍可将回调交回主窗口；不连接真实账号。
  await app.context().route('https://www.last.fm/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<a id="finish-auth" href="${rendererOrigin}/?token=smoke-test#/lastfm/callback">Finish</a>`,
    })
  );
  await app.context().route('https://ws.audioscrobbler.com/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ session: { name: 'Smoke Test', key: 'test' } }),
    })
  );
  const popupReady = app.waitForEvent('window');
  await page.evaluate(() => {
    window.open('https://www.last.fm/api/auth/');
  });
  const popup = await popupReady;
  await popup.waitForSelector('#finish-auth');
  assert.equal(await popup.evaluate(() => typeof window.require), 'undefined');
  await popup.locator('#finish-auth').click();
  await expect(page.locator('.lastfm-callback .message')).toHaveText(
    '已成功连接到 Last.fm'
  );
  await page.locator('.lastfm-callback button').click();
  await page.waitForSelector('.settings-page');
  assert.deepEqual(errors, [], 'Renderer errors during settings interactions');
  await page.screenshot({
    path: `dist_electron/smoke-${process.platform}.png`,
  });
  console.log(
    'Native background checks:',
    JSON.stringify(await materialState())
  );
  console.log('Release smoke check passed.');
}

main()
  .catch(async error => {
    console.error(error);
    if (pageForDiagnostics && !pageForDiagnostics.isClosed()) {
      console.error('Failed page:', pageForDiagnostics.url());
      await pageForDiagnostics
        .screenshot({
          path: `dist_electron/smoke-${process.platform}-failure.png`,
        })
        .catch(() => {});
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    fs.rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  });
