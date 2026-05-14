export default store => {
  store.subscribe((mutation, state) => {
    localStorage.setItem('settings', JSON.stringify(state.settings));
    localStorage.setItem('data', JSON.stringify(state.data));
    if (state.downloads) {
      localStorage.setItem('downloads', JSON.stringify(state.downloads));
    }
  });
};
