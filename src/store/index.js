import { createStore } from 'vuex';
import { markRaw } from 'vue';
import state from './state';
import mutations from './mutations';
import actions from './actions';
import {
  changeAppearance,
  changeThemeColor,
  changeVibrancy,
} from '@/utils/common';
import Player from '@/utils/Player';
// vuex 自定义插件
import saveToLocalStorage from './plugins/localStorage';
import { getSendSettingsPlugin } from './plugins/sendSettings';

let plugins = [saveToLocalStorage];
if (process.env.IS_ELECTRON === true) {
  let sendSettings = getSendSettingsPlugin();
  plugins.push(sendSettings);
}
const options = {
  state,
  mutations,
  actions,
  plugins,
};

const store = createStore(options);

if ([undefined, null].includes(store.state.settings.lang)) {
  const defaultLang = 'en';
  const langMapper = new Map()
    .set('zh', 'zh-CN')
    .set('zh-TW', 'zh-TW')
    .set('en', 'en')
    .set('tr', 'tr');
  store.state.settings.lang =
    langMapper.get(
      langMapper.has(navigator.language)
        ? navigator.language
        : navigator.language.slice(0, 2)
    ) || defaultLang;
  localStorage.setItem('settings', JSON.stringify(store.state.settings));
}

changeAppearance(store.state.settings.appearance);
changeThemeColor(store.state.settings.themeColor);
let vibrancyEnabled = false;
if (process.env.IS_ELECTRON === true) {
  const electron = window.require('electron');
  electron.ipcRenderer.on('vibrancy-changed', (_, enabled) => {
    changeVibrancy(enabled === true);
  });
  vibrancyEnabled = electron.ipcRenderer.sendSync('getVibrancyStatus') === true;
}
changeVibrancy(vibrancyEnabled);

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (store.state.settings.appearance === 'auto') {
      changeAppearance(store.state.settings.appearance);
      changeThemeColor(store.state.settings.themeColor);
    }
  });

let player = new Player();
player = markRaw(
  new Proxy(player, {
    set(target, prop, value) {
      target[prop] = value;
      if (prop === '_howler') return true;
      target.saveSelfToLocalStorage();
      target.sendSelfToIpcMain();
      store.commit('syncPlayerState');
      return true;
    },
  })
);
store.commit('setPlayer', player);
store.commit('syncPlayerState');
window.yesplaymusic.player = store.state.player;

export default store;
