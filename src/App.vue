<template>
  <div id="app" :class="{ 'user-select-none': userSelectNone }">
    <Scrollbar v-show="!showLyrics && !lyricsClosing" ref="scrollbar" />
    <Navbar v-show="showNavbar && !showLyrics && !lyricsClosing" ref="navbar" />
    <main
      v-show="!showLyrics && !lyricsClosing"
      ref="main"
      :style="{ overflow: enableScrolling ? 'auto' : 'hidden' }"
      @scroll="handleScroll"
    >
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" v-if="$route.meta.keepAlive" />
        </keep-alive>
        <component :is="Component" v-if="!$route.meta.keepAlive" />
      </router-view>
    </main>
    <transition name="slide-up">
      <Player
        v-if="enablePlayer"
        v-show="showPlayer && !showLyrics && !lyricsClosing"
        ref="player"
      />
    </transition>
    <Toast />
    <ModalAddTrackToPlaylist v-if="isAccountLoggedIn" />
    <ModalNewPlaylist v-if="isAccountLoggedIn" />
    <ModalDownloadConfirm v-if="isElectron" />
    <ModalHiddenCards />
    <transition
      v-if="enablePlayer"
      name="slide-up"
      @after-leave="finishLyricsClosing"
    >
      <Lyrics v-show="showLyrics" />
    </transition>
  </div>
</template>

<script>
import ModalAddTrackToPlaylist from './components/ModalAddTrackToPlaylist.vue';
import ModalNewPlaylist from './components/ModalNewPlaylist.vue';
import ModalDownloadConfirm from './components/ModalDownloadConfirm.vue';
import ModalHiddenCards from './components/ModalHiddenCards.vue';
import Scrollbar from './components/Scrollbar.vue';
import Navbar from './components/Navbar.vue';
import Player from './components/Player.vue';
import Toast from './components/Toast.vue';
import { ipcRenderer } from './electron/ipcRenderer';
import { isAccountLoggedIn, isLooseLoggedIn } from '@/utils/auth';
import Lyrics from './views/lyrics.vue';
import { mapState } from 'vuex';

export default {
  name: 'App',
  components: {
    Navbar,
    Player,
    Toast,
    ModalAddTrackToPlaylist,
    ModalNewPlaylist,
    ModalDownloadConfirm,
    ModalHiddenCards,
    Lyrics,
    Scrollbar,
  },
  data() {
    return {
      isElectron: process.env.IS_ELECTRON, // true || undefined
      userSelectNone: false,
      // 原生毛玻璃下歌词页透明，关闭动画结束前不能显示主界面，否则会重影。
      lyricsClosing: false,
      lyricsClosingTimer: null,
    };
  },
  computed: {
    ...mapState(['showLyrics', 'settings', 'player', 'enableScrolling']),
    isAccountLoggedIn() {
      return isAccountLoggedIn();
    },
    showPlayer() {
      return (
        [
          'mv',
          'loginUsername',
          'login',
          'loginAccount',
          'lastfmCallback',
        ].includes(this.$route.name) === false
      );
    },
    enablePlayer() {
      return this.player.enabled && this.$route.name !== 'lastfmCallback';
    },
    showNavbar() {
      return this.$route.name !== 'lastfmCallback';
    },
  },
  watch: {
    showLyrics(show) {
      clearTimeout(this.lyricsClosingTimer);
      this.lyricsClosingTimer = null;
      if (show) {
        this.lyricsClosing = false;
        return;
      }
      if (document.body.getAttribute('data-vibrancy') === 'on') {
        this.lyricsClosing = true;
        // transition 被卸载时 after-leave 不会触发，定时器负责兜底复位。
        this.lyricsClosingTimer = setTimeout(() => {
          this.finishLyricsClosing();
        }, 450);
      }
    },
  },
  created() {
    if (this.isElectron) ipcRenderer(this);
    window.addEventListener('keydown', this.handleKeydown);
    this.fetchData();
  },
  beforeUnmount() {
    clearTimeout(this.lyricsClosingTimer);
    window.removeEventListener('keydown', this.handleKeydown);
  },
  beforeDestroy() {
    clearTimeout(this.lyricsClosingTimer);
    window.removeEventListener('keydown', this.handleKeydown);
  },
  methods: {
    finishLyricsClosing() {
      clearTimeout(this.lyricsClosingTimer);
      this.lyricsClosingTimer = null;
      this.lyricsClosing = false;
    },
    handleKeydown(e) {
      if (e.code === 'Space') {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return false;
        if (this.$route.name === 'mv') return false;
        e.preventDefault();
        this.player.playOrPause();
      }
    },
    fetchData() {
      if (!isLooseLoggedIn()) return;
      this.$store.dispatch('fetchLikedSongs');
      this.$store.dispatch('fetchLikedSongsWithDetails');
      this.$store.dispatch('fetchLikedPlaylist');
      if (isAccountLoggedIn()) {
        this.$store.dispatch('fetchLikedAlbums');
        this.$store.dispatch('fetchLikedArtists');
        this.$store.dispatch('fetchLikedMVs');
        this.$store.dispatch('fetchCloudDisk');
      }
    },
    handleScroll() {
      this.$refs.scrollbar.handleScroll();
    },
  },
};
</script>

<style lang="scss">
#app {
  width: 100%;
  transition: all 0.4s;
}

main {
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  overflow: auto;
  padding: 64px 10vw 96px 10vw;
  box-sizing: border-box;
  scrollbar-width: none; // firefox
}

@media (max-width: 1336px) {
  main {
    padding: 64px 5vw 96px 5vw;
  }
}

main::-webkit-scrollbar {
  width: 0px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.4s;
}
.slide-up-enter,
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
