import initLocalStorage from './initLocalStorage';
import pkg from '../../package.json';
import updateApp from '@/utils/updateApp';

const savedPlayer = JSON.parse(localStorage.getItem('player')) || {};

if (localStorage.getItem('appVersion') === null) {
  localStorage.setItem('settings', JSON.stringify(initLocalStorage.settings));
  localStorage.setItem('data', JSON.stringify(initLocalStorage.data));
  localStorage.setItem('appVersion', pkg.version);
}

updateApp();

export default {
  showLyrics: false,
  enableScrolling: true,
  title: 'YesPlayMusic',
  liked: {
    songs: [],
    songsWithDetails: [], // 只有前12首
    playlists: [],
    albums: [],
    artists: [],
    mvs: [],
    cloudDisk: [],
    playHistory: {
      weekData: [],
      allData: [],
    },
  },
  contextMenu: {
    clickObjectID: 0,
    showMenu: false,
  },
  toast: {
    show: false,
    text: '',
    timer: null,
  },
  modals: {
    addTrackToPlaylistModal: {
      show: false,
      selectedTrackID: 0,
    },
    newPlaylistModal: {
      show: false,
      afterCreateAddTrackID: 0,
    },
    downloadConfirmModal: {
      show: false,
      tracks: [],
      subFolder: '',
    },
    hiddenCardsModal: {
      show: false,
    },
  },
  dailyTracks: [],
  downloads: (() => {
    const raw = JSON.parse(localStorage.getItem('downloads')) || {
      tasks: [],
    };
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    return {
      ...raw,
      tasks: tasks.map(task =>
        task && (task.status === 'pending' || task.status === 'downloading')
          ? {
              ...task,
              status: 'failed',
              error: 'interrupted',
              finishedAt: task.finishedAt || Date.now(),
            }
          : task
      ),
    };
  })(),
  lastfm: JSON.parse(localStorage.getItem('lastfm')) || {},
  player: savedPlayer,
  playerState: {
    currentTrack: savedPlayer._currentTrack || {},
    personalFMTrack: savedPlayer._personalFMTrack || {},
    progress: savedPlayer._progress || 0,
    volume: savedPlayer._volume ?? 1,
    playing: savedPlayer._playing || false,
    enabled: savedPlayer._enabled || false,
    isPersonalFM: savedPlayer._isPersonalFM || false,
    repeatMode: savedPlayer._repeatMode || 'off',
    shuffle: savedPlayer._shuffle || false,
    reversed: savedPlayer._reversed || false,
  },
  settings: JSON.parse(localStorage.getItem('settings')),
  data: JSON.parse(localStorage.getItem('data')),
};
