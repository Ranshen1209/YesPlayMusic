import store from '@/store';
import locale from '@/locale';
import { getMP3 } from '@/api/track';

const isElectron = process.env.IS_ELECTRON === true;

const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

const CONCURRENCY = 3;

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
      const url = await fetchSongUrl(track.id, br);
      const result = await ipcRenderer.invoke('download:track', {
        id: track.id,
        url,
        track: {
          name: track.name,
          ar: track.ar || track.artists,
        },
        folder,
        subFolder,
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
