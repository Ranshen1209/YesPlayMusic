import fs from 'fs';
import path from 'path';

const clc = require('cli-color');
const log = text => {
  console.log(`${clc.blueBright('[metadata.js]')} ${text}`);
};

const COVER_REFERER = 'https://music.163.com/';
const COVER_TIMEOUT_MS = 30000;
const COVER_MAX_BYTES = 5 * 1024 * 1024;

function pickExt(filePath) {
  return String(path.extname(filePath) || '')
    .replace('.', '')
    .toLowerCase();
}

function trimString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function buildTrackToken(trackNumber, trackTotal) {
  const n = Number(trackNumber);
  if (!Number.isFinite(n) || n <= 0) return '';
  const total = Number(trackTotal);
  if (Number.isFinite(total) && total > 0) return `${n}/${total}`;
  return String(n);
}

function buildDiscToken(discNumber, discTotal) {
  const raw = trimString(discNumber);
  if (!raw) return '';
  const match = raw.match(/^(\d+)/);
  if (!match) return '';
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return '';
  const total = Number(discTotal);
  if (Number.isFinite(total) && total > 0) return `${n}/${total}`;
  return String(n);
}

async function fetchCoverBuffer(url) {
  if (!url) return null;
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: COVER_TIMEOUT_MS,
      maxContentLength: COVER_MAX_BYTES,
      headers: { Referer: COVER_REFERER },
    });
    const buffer = Buffer.from(response.data);
    if (buffer.length === 0) return null;
    const headers = response.headers || {};
    const contentType = String(headers['content-type'] || '').toLowerCase();
    const mime = contentType.includes('png') ? 'image/png' : 'image/jpeg';
    return { buffer, mime };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`cover fetch failed: ${message}`);
    return null;
  }
}

function writeId3(filePath, meta, cover) {
  const NodeID3 = require('node-id3');
  const tags = {};
  if (meta.title) tags.title = meta.title;
  if (meta.artist) tags.artist = meta.artist;
  if (meta.album) tags.album = meta.album;
  if (meta.albumArtist) tags.performerInfo = meta.albumArtist;
  if (meta.composer) tags.composer = meta.composer;
  if (meta.genre) tags.genre = meta.genre;
  if (meta.year) tags.year = String(meta.year);
  if (meta.comment) {
    tags.comment = { language: 'eng', text: String(meta.comment) };
  }

  const trackToken = buildTrackToken(meta.trackNumber, meta.trackTotal);
  if (trackToken) tags.trackNumber = trackToken;

  const discToken = buildDiscToken(meta.discNumber, meta.discTotal);
  if (discToken) tags.partOfSet = discToken;

  if (meta.compilation === true || meta.compilation === 1) {
    tags.userDefinedText = [{ description: 'COMPILATION', value: '1' }];
  }

  if (cover && cover.buffer && cover.buffer.length > 0) {
    tags.image = {
      mime: cover.mime || 'image/jpeg',
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: cover.buffer,
    };
  }

  const result = NodeID3.update(tags, filePath);
  if (result instanceof Error) throw result;
  if (result !== true) throw new Error('id3_write_failed');
}

function writeFlac(filePath, meta, cover) {
  const Metaflac = require('metaflac-js');
  const flac = new Metaflac(filePath);

  const fields = [
    ['TITLE', meta.title],
    ['ARTIST', meta.artist],
    ['ALBUM', meta.album],
    ['ALBUMARTIST', meta.albumArtist],
    ['COMPOSER', meta.composer],
    ['GENRE', meta.genre],
    ['DATE', meta.year ? String(meta.year) : ''],
    ['COMMENT', meta.comment],
    [
      'TRACKNUMBER',
      meta.trackNumber ? String(Number(meta.trackNumber) || '') : '',
    ],
    [
      'TRACKTOTAL',
      meta.trackTotal ? String(Number(meta.trackTotal) || '') : '',
    ],
    ['DISCNUMBER', buildDiscToken(meta.discNumber).split('/')[0] || ''],
    ['DISCTOTAL', meta.discTotal ? String(Number(meta.discTotal) || '') : ''],
  ];

  for (const [name, value] of fields) {
    flac.removeTag(name);
    const trimmed = trimString(value);
    if (trimmed) flac.setTag(`${name}=${trimmed}`);
  }

  flac.removeTag('COMPILATION');
  if (meta.compilation === true || meta.compilation === 1) {
    flac.setTag('COMPILATION=1');
  }

  if (cover && cover.buffer && cover.buffer.length > 0) {
    try {
      flac.importPictureFromBuffer(cover.buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`flac picture skipped: ${message}`);
    }
  }

  flac.save();
}

export async function writeTags(filePath, meta) {
  if (!meta || meta.embed === false) return { ok: false, reason: 'disabled' };
  if (!filePath) return { ok: false, reason: 'no_path' };
  try {
    await fs.promises.access(filePath, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    return { ok: false, reason: 'no_file' };
  }

  const cover =
    meta.embedCover !== false && meta.coverUrl
      ? await fetchCoverBuffer(meta.coverUrl)
      : null;

  const ext = pickExt(filePath);
  try {
    if (ext === 'mp3') {
      writeId3(filePath, meta, cover);
    } else if (ext === 'flac') {
      writeFlac(filePath, meta, cover);
    } else {
      return { ok: false, reason: `unsupported_${ext || 'unknown'}` };
    }
    return { ok: true, hasCover: Boolean(cover) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`tag write failed: ${message}`);
    return { ok: false, reason: message };
  }
}
