// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const http = require('http');
const express = require('express');

const DIST = path.resolve(__dirname, '../../dist');
let server;
let baseUrl;

test.beforeAll(async () => {
  const app = express();
  app.use(express.static(DIST));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  await new Promise(resolve => {
    server = http.createServer(app).listen(0, '127.0.0.1', resolve);
  });
  const { port } = /** @type {any} */ (server.address());
  baseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

async function blockApi(page) {
  await page.route(/\/api\//, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200 }),
    })
  );
}

test.describe('Web build hides all download entry points', () => {
  test('IS_ELECTRON is undefined in the web bundle', async ({ page }) => {
    await blockApi(page);
    await page.goto(`${baseUrl}/`);
    const isElectron = await page.evaluate(
      () =>
        typeof window.process !== 'undefined' &&
        !!window.process?.versions?.electron
    );
    expect(isElectron).toBe(false);
  });

  test('Settings page does not show 下载音质 / 下载位置', async ({ page }) => {
    await blockApi(page);
    await page.goto(`${baseUrl}/settings`);
    await page.waitForSelector('.settings-page', { timeout: 10000 });
    // Wait for i18n / Vue to render setting rows
    await page.waitForTimeout(500);

    // Sanity: the music quality setting (always present) should be rendered
    const musicQualityRow = page
      .locator('.item', { hasText: /音质选择|Music Quality/ })
      .first();
    await expect(musicQualityRow).toBeVisible();

    // Download settings — must NOT appear in web mode
    await expect(page.locator('text=下载音质')).toHaveCount(0);
    await expect(page.locator('text=下载位置')).toHaveCount(0);
    await expect(page.locator('text=Default Download Quality')).toHaveCount(0);
    await expect(page.locator('text=Download Location')).toHaveCount(0);
  });

  test('Album page renders no download/select buttons', async ({ page }) => {
    await blockApi(page);
    await page.goto(`${baseUrl}/album/34720827`);
    await page.waitForSelector('nav', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator('use[*|href$="#icon-download"]')).toHaveCount(0);
    await expect(page.locator('button:has-text("下载")')).toHaveCount(0);
    await expect(page.locator('button:has-text("DOWNLOAD")')).toHaveCount(0);
    await expect(page.locator('button:has-text("多选")')).toHaveCount(0);
  });

  test('Playlist page renders no download/select buttons', async ({ page }) => {
    await blockApi(page);
    await page.goto(`${baseUrl}/playlist/2829816518`);
    await page.waitForSelector('nav', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator('use[*|href$="#icon-download"]')).toHaveCount(0);
    await expect(page.locator('button:has-text("下载")')).toHaveCount(0);
    await expect(page.locator('button:has-text("多选")')).toHaveCount(0);
  });

  test('Download confirm modal is not mounted in web build', async ({
    page,
  }) => {
    await blockApi(page);
    await page.goto(`${baseUrl}/`);
    await page.waitForSelector('nav', { timeout: 10000 });
    await expect(page.locator('.download-confirm-modal')).toHaveCount(0);
  });
});
