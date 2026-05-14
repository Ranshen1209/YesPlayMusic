import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { writeTags } from './metadata';

const clc = require('cli-color');
const log = text => {
  console.log(`${clc.blueBright('[download.js]')} ${text}`);
};

const streamPipeline = promisify(pipeline);

const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;

function sanitize(name) {
  if (!name) return '';
  const trimmed = String(name).trim().replace(ILLEGAL_CHARS, '_');
  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

function inferExt(url, fallback = 'mp3') {
  try {
    const cleaned = url.split('?')[0];
    const ext = path.extname(cleaned).replace('.', '').toLowerCase();
    if (ext && ext.length <= 4) return ext;
  } catch (e) {
    // ignore
  }
  return fallback;
}

function defaultDownloadFolder() {
  return path.join(app.getPath('music'), 'YesPlayMusic');
}

function resolveFolder(folder) {
  if (folder && typeof folder === 'string' && folder.trim() !== '') {
    return folder;
  }
  return defaultDownloadFolder();
}

async function downloadOne(axios, { url, target }) {
  const tmp = `${target}.part`;
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 60000,
  });
  await streamPipeline(response.data, fs.createWriteStream(tmp));
  await fs.promises.rename(tmp, target);
}

export function registerDownloadHandlers(win) {
  ipcMain.handle('download:defaultFolder', () => defaultDownloadFolder());

  ipcMain.handle('download:openFolder', async (_, folder) => {
    const target = resolveFolder(folder);
    try {
      await fs.promises.mkdir(target, { recursive: true });
    } catch (e) {
      log(`mkdir failed: ${e.message}`);
    }
    return shell.openPath(target);
  });

  ipcMain.handle('download:pickFolder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    'download:track',
    async (_, { id, url, track, folder, subFolder, meta }) => {
      if (!url) {
        return { id, ok: false, error: 'no_url' };
      }
      try {
        const axios = (await import('axios')).default;
        const baseFolder = resolveFolder(folder);
        const targetDir = path.join(baseFolder, sanitize(subFolder));
        await fs.promises.mkdir(targetDir, { recursive: true });

        const artists = (track && (track.ar || track.artists)) || [];
        const artistNames = artists
          .map(a => a && a.name)
          .filter(Boolean)
          .join(',');
        const trackName = (track && track.name) || String(id);
        const baseName = sanitize(
          artistNames ? `${trackName} - ${artistNames}` : trackName
        );
        const ext = inferExt(url, 'mp3');
        const target = path.join(targetDir, `${baseName}.${ext}`);

        await downloadOne(axios, { url, target });
        log(`downloaded: ${target}`);

        let tagResult = null;
        if (meta && meta.embed !== false) {
          tagResult = await writeTags(target, meta);
          if (tagResult && !tagResult.ok) {
            log(`tag skipped [${id}]: ${tagResult.reason || 'unknown'}`);
          }
        }

        return { id, ok: true, path: target, tag: tagResult };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`download failed [${id}]: ${message}`);
        return { id, ok: false, error: message };
      }
    }
  );
}
