import store from '@/store';
import locale from '@/locale';
import { getMP3, getTrackDetail, getLyric } from '@/api/track';

const isElectron = process.env.IS_ELECTRON === true;

const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

const CONCURRENCY = 3;
const COVER_QUERY_SIZE = 1024;

function showToast(text) {
  store.dispatch('showToast', text);
}

function t(key, payload) {
  return locale.t(key, payload);
}

async function fetchSongUrl(id, br) {
  const result = await getMP3(String(id), br);
  const item = result?.data?.[0];
  if (!item || !item.url) {
    throw new Error('no_url');
  }
  return item.url;
}

function pickComposerFromLyric(lyricText) {
  if (!lyricText || typeof lyricText !== 'string') return '';
  const lines = lyricText.split(/\r?\n/);
  const composers = new Set();
  const re = /^(?:\[[^\]]*\]\s*)*作\s*曲\s*[:：]\s*(.+?)\s*$/;
  for (const raw of lines) {
    const match = raw.match(re);
    if (match && match[1]) {
      const cleaned = match[1].replace(/[\u3000\s]+$/, '').trim();
      if (cleaned) composers.add(cleaned);
    }
  }
  return Array.from(composers).join('/');
}

async function fetchComposer(trackId) {
  try {
    const result = await getLyric(trackId);
    return pickComposerFromLyric(result?.lrc?.lyric || '');
  } catch (e) {
    return '';
  }
}

function withCoverSize(url, size) {
  if (!url || typeof url !== 'string') return '';
  const dim = Number(size) > 0 ? Number(size) : COVER_QUERY_SIZE;
  if (url.includes('?param=')) return url;
  return `${url}?param=${dim}y${dim}`;
}

function buildMeta(song, settings) {
  if (!song) return null;
  const embedMetadata = settings?.downloadEmbedMetadata !== false;
  if (!embedMetadata) return { embed: false };

  const artists = (song.ar || song.artists || [])
    .map(a => a && a.name)
    .filter(Boolean);
  const album = song.al || song.album || {};
  const albumArtistRaw = album.artist?.name || album.artistName || '';
  const albumArtist = albumArtistRaw || artists[0] || '';
  const publishTime = album.publishTime || song.publishTime;
  const year =
    Number.isFinite(publishTime) && publishTime > 0
      ? new Date(publishTime).getFullYear()
      : '';
  const aliasParts = [];
  if (Array.isArray(song.alia) && song.alia.length > 0) {
    aliasParts.push(song.alia.filter(Boolean).join('; '));
  }
  if (Array.isArray(song.tns) && song.tns.length > 0) {
    aliasParts.push(song.tns.filter(Boolean).join('; '));
  }
  const albumName = String(album.name || '');
  const compilation =
    /合辑|合集|精选集|Compilation/i.test(albumName) ||
    (Array.isArray(song.tns) &&
      song.tns.some(t => /合辑|合集|Compilation/i.test(String(t || ''))));
  const coverSize =
    Number(settings?.downloadCoverSize) > 0
      ? Number(settings.downloadCoverSize)
      : COVER_QUERY_SIZE;
  const coverUrl = album.picUrl ? withCoverSize(album.picUrl, coverSize) : '';

  return {
    embed: true,
    embedCover: settings?.downloadEmbedCover !== false,
    title: song.name || '',
    artist: artists.join('/'),
    album: albumName,
    albumArtist,
    composer: '',
    genre: '',
    year: year ? String(year) : '',
    comment: aliasParts.filter(Boolean).join(' | '),
    trackNumber: song.no || '',
    trackTotal: album.size || album.trackCount || '',
    discNumber: song.cd || '',
    discTotal: '',
    compilation: Boolean(compilation),
    coverUrl,
  };
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

async function buildMetaForTrack(trackId, settings) {
  if (settings?.downloadEmbedMetadata === false) return { embed: false };
  try {
    const detail = await getTrackDetail(String(trackId));
    const song = detail?.songs?.[0];
    const meta = buildMeta(song, settings);
    if (!meta || meta.embed === false) return meta;
    if (!meta.composer) {
      meta.composer = await fetchComposer(trackId);
    }
    return meta;
  } catch (e) {
    return { embed: false };
  }
}

export async function downloadTracks(tracks, options = {}) {
  if (!isElectron) {
    showToast(t('toast.downloadElectronOnly'));
    return;
  }

  const list = (tracks || []).filter(Boolean);
  if (list.length === 0) {
    showToast(t('toast.noTracksToDownload'));
    return;
  }

  const settings = store.state.settings || {};
  const br = options.br ?? settings.downloadBitrate ?? 320000;
  const folder = options.folder ?? settings.downloadFolder ?? '';
  const subFolder = options.subFolder ?? '';

  const now = Date.now();
  store.commit(
    'addDownloadTasks',
    list.map(track => ({
      id: track.id,
      name: track.name,
      ar: track.ar || track.artists || [],
      subFolder,
      status: 'pending',
      startedAt: now,
    }))
  );

  showToast(t('toast.downloadStarted', { count: list.length }));

  const outcomes = await runPool(list, async track => {
    store.commit('updateDownloadTask', {
      id: track.id,
      patch: { status: 'downloading' },
    });
    try {
      const [url, meta] = await Promise.all([
        fetchSongUrl(track.id, br),
        buildMetaForTrack(track.id, settings),
      ]);
      const result = await ipcRenderer.invoke('download:track', {
        id: track.id,
        url,
        track: {
          name: track.name,
          ar: track.ar || track.artists,
        },
        folder,
        subFolder,
        meta,
      });
      store.commit('updateDownloadTask', {
        id: track.id,
        patch: result.ok
          ? {
              status: 'succeeded',
              target: result.path,
              finishedAt: Date.now(),
            }
          : {
              status: 'failed',
              error: result.error || 'unknown',
              finishedAt: Date.now(),
            },
      });
      return result;
    } catch (err) {
      const message = err?.message || String(err);
      store.commit('updateDownloadTask', {
        id: track.id,
        patch: { status: 'failed', error: message, finishedAt: Date.now() },
      });
      return { id: track.id, ok: false, error: message };
    }
  });

  const success = outcomes.filter(r => r && r.ok).length;
  const failed = outcomes.length - success;
  showToast(t('toast.downloadComplete', { success, failed }));
}

export async function retryDownloadTask(task) {
  if (!task) return;
  return downloadTracks(
    [
      {
        id: task.id,
        name: task.name,
        ar: task.ar,
      },
    ],
    { subFolder: task.subFolder || '' }
  );
}

export async function pickDownloadFolder() {
  if (!isElectron) return null;
  return ipcRenderer.invoke('download:pickFolder');
}

export async function openDownloadFolder(folder) {
  if (!isElectron) return null;
  return ipcRenderer.invoke('download:openFolder', folder || '');
}

export async function getDefaultDownloadFolder() {
  if (!isElectron) return '';
  return ipcRenderer.invoke('download:defaultFolder');
}

export function openDownloadConfirm(tracks, subFolder = '') {
  if (!isElectron) {
    showToast(t('toast.downloadElectronOnly'));
    return;
  }
  if (!tracks || tracks.length === 0) {
    showToast(t('toast.noTracksToDownload'));
    return;
  }
  store.commit('updateModal', {
    modalName: 'downloadConfirmModal',
    key: 'tracks',
    value: tracks,
  });
  store.commit('updateModal', {
    modalName: 'downloadConfirmModal',
    key: 'subFolder',
    value: subFolder,
  });
  store.commit('updateModal', {
    modalName: 'downloadConfirmModal',
    key: 'show',
    value: true,
  });
}
