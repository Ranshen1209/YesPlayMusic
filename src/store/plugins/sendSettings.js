export function getSendSettingsPlugin() {
  const electron = window.require('electron');
  const ipcRenderer = electron.ipcRenderer;
  return store => {
    store.subscribe((mutation, state) => {
      // console.log(mutation);
      if (mutation.type !== 'updateSettings') return;
      // Vue 3 state is a Proxy and cannot be cloned by Electron IPC.
      const settings = JSON.parse(JSON.stringify(state.settings));
      ipcRenderer.send('settings', settings);
    });
  };
}
