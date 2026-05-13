// @ts-check
/**
 * Real Electron E2E test — requires user to log into Netease in the app window.
 *
 * Run with:
 *   node tests/e2e/electron-login-and-download.js
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Use the npm `electron` binary + bundled main script — standard Playwright pattern.
// (Launching the packaged .app fails CDP handshake on macOS Tahoe.)
const ELECTRON_BIN = require('electron');
const BUNDLED_DIR = path.resolve(__dirname, '../../dist_electron/bundled');

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

function log(msg) {
  console.log(`\x1b[36m[e2e]\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
}

async function pollFor(fn, { timeoutMs, intervalMs, label }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fn();
    if (r) return r;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function getUserId(page) {
  return page.evaluate(() => {
    try {
      const data = JSON.parse(localStorage.getItem('data') || '{}');
      return (data.user && data.user.userId) || 0;
    } catch (e) {
      return 0;
    }
  });
}

async function readSettings(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('settings') || '{}')
  );
}

async function writeSettings(page, patch) {
  await page.evaluate(p => {
    const s = JSON.parse(localStorage.getItem('settings') || '{}');
    Object.assign(s, p);
    localStorage.setItem('settings', JSON.stringify(s));
  }, patch);
}

async function listFilesRec(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFilesRec(p)));
    else out.push(p);
  }
  return out;
}

(async () => {
  if (!fs.existsSync(BUNDLED_DIR)) {
    throw new Error(
      `Bundled dir not found at ${BUNDLED_DIR}. Run: npx vue-cli-service electron:build --dir -p never`
    );
  }

  const downloadDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'ypm-e2e-')
  );
  log(`download folder: ${downloadDir}`);

  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [BUNDLED_DIR],
    timeout: 30_000,
  });

  log('waiting for main window...');
  const win = await app.firstWindow({ timeout: 30_000 });
  await win.waitForLoadState('domcontentloaded');
  log(`main window: ${win.url()}`);

  await writeSettings(win, {
    downloadFolder: downloadDir,
    downloadBitrate: '128000',
  });
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(500);

  let settings = await readSettings(win);
  log(
    `settings.downloadFolder after reload: ${
      settings.downloadFolder || '(empty)'
    }`
  );
  if (settings.downloadFolder !== downloadDir) {
    // The localStorage plugin may have overwritten our patch with the in-memory
    // Vuex state from a previous session. Patch via the store directly.
    log('patching settings via Vuex updateSettings mutation...');
    await win.evaluate(
      p => {
        const store = window.$nuxt
          ? window.$nuxt.$store
          : (document.getElementById('app') || {}).__vue__
          ? (document.getElementById('app') || {}).__vue__.$store
          : null;
        if (!store) throw new Error('store not exposed on window');
        store.commit('updateSettings', {
          key: 'downloadFolder',
          value: p.folder,
        });
        store.commit('updateSettings', {
          key: 'downloadBitrate',
          value: p.bitrate,
        });
      },
      { folder: downloadDir, bitrate: '128000' }
    );
    await win.waitForTimeout(500);
    settings = await readSettings(win);
    log(
      `settings.downloadFolder after Vuex patch: ${
        settings.downloadFolder || '(empty)'
      }`
    );
  }
  if (settings.downloadFolder !== downloadDir) {
    throw new Error('downloadFolder did not persist');
  }
  ok('download folder + bitrate persisted in localStorage');

  let userId = await getUserId(win);
  if (!userId) {
    log('');
    log('============================================================');
    log('  NOT LOGGED IN. Please log into Netease in the app window.');
    log('  Use 手机号 / 邮箱 / 扫码 — whichever works for you.');
    log(`  Test will resume automatically once login is detected.`);
    log(`  Timeout: ${LOGIN_TIMEOUT_MS / 1000}s`);
    log('============================================================');
    log('');

    userId = await pollFor(() => getUserId(win), {
      timeoutMs: LOGIN_TIMEOUT_MS,
      intervalMs: POLL_INTERVAL_MS,
      label: 'login',
    });
  }
  ok(`logged in as userId=${userId}`);

  log('navigating to /library...');
  await win.evaluate(() => {
    window.location.hash = '/library';
  });
  await win.waitForTimeout(1500);

  log('opening 我喜欢的音乐 playlist...');
  await win
    .locator('text=我喜欢的音乐, text=Liked Songs')
    .first()
    .click({ timeout: 10_000 })
    .catch(async () => {
      const likedID = await win.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('data') || '{}');
        return data.likedSongPlaylistID || 0;
      });
      if (likedID) {
        log(`fallback: navigate to /playlist/${likedID}`);
        await win.evaluate(id => {
          window.location.hash = `/playlist/${id}`;
        }, likedID);
      } else {
        throw new Error('Cannot find liked songs');
      }
    });

  await win.waitForSelector('button:has-text("下载全部")', { timeout: 15_000 });
  ok('下载全部 button visible on liked-songs page');

  await win.waitForSelector('button:has-text("多选")', { timeout: 5_000 });
  ok('多选 button visible');

  await win.locator('button:has-text("多选")').first().click();
  await win.waitForTimeout(500);

  const checkboxes = win.locator('input.select-checkbox');
  const totalTracks = await checkboxes.count();
  log(`select-mode: ${totalTracks} checkboxes rendered`);
  if (totalTracks < 2) {
    throw new Error(
      `Expected ≥2 liked tracks for the test, got ${totalTracks}. Like a couple of songs first.`
    );
  }
  await checkboxes.nth(0).click();
  await checkboxes.nth(1).click();
  await win.waitForTimeout(300);
  ok('selected 2 tracks');

  await win.locator('button:has-text("下载所选")').first().click();
  await win.waitForTimeout(500);

  await win.waitForSelector('.download-confirm-modal', { timeout: 5000 });
  ok('ModalDownloadConfirm appeared');

  await win.locator('.download-confirm-modal button.primary').click();
  log('confirm clicked, waiting for downloads...');

  const files = await pollFor(
    async () => {
      const all = await listFilesRec(downloadDir);
      const finished = all.filter(p => !p.endsWith('.part'));
      return finished.length >= 2 ? finished : null;
    },
    { timeoutMs: 90_000, intervalMs: 1500, label: '≥2 downloaded files' }
  );

  ok(`downloaded ${files.length} file(s):`);
  files.forEach(f => {
    const stat = fs.statSync(f);
    log(`  ${path.relative(downloadDir, f)} (${stat.size} bytes)`);
    if (stat.size === 0) fail(`File is empty: ${f}`);
  });

  log('testing right-click menu Download item...');
  await win
    .locator('button:has-text("取消多选")')
    .first()
    .click()
    .catch(() => {});
  await win.waitForTimeout(300);
  const firstTrack = win.locator('.track').first();
  await firstTrack.click({ button: 'right' });
  await win.waitForSelector('.menu .item:has-text("下载")', { timeout: 3000 });
  ok('right-click menu has 下载 item');
  await win.keyboard.press('Escape');

  log('all tests passed; cleaning up...');
  await app.close();
  if (process.exitCode === 0) {
    await fs.promises.rm(downloadDir, { recursive: true, force: true });
    log(`removed ${downloadDir}`);
  } else {
    log(`download folder kept for inspection: ${downloadDir}`);
  }
})().catch(err => {
  console.error('\x1b[31m[FATAL]\x1b[0m', err);
  process.exit(1);
});
