<template>
  <div class="lyrics-page" :class="{ 'no-lyric': noLyric }" :data-theme="theme">
    <div v-if="useDynamicBackground" class="amll-background">
      <!-- 当前依赖版本的 playing 属性内部将 true 映射为 pause。 -->
      <BackgroundRender
        :key="bgImageUrl"
        class="amll-background-render"
        :album="bgImageUrl"
        :playing="!showLyrics"
        :has-lyric="!noLyric"
        :fps="settings.lyricsBackground === 'dynamic' ? 30 : 0"
        :flow-speed="settings.lyricsBackground === 'dynamic' ? 2 : 0"
      />
    </div>
    <div
      v-else-if="settings.lyricsBackground === 'blur'"
      class="blur-background"
      :style="{ backgroundImage: `url(${bgImageUrl})` }"
    ></div>
    <div class="background-tint"></div>

    <div class="window-actions">
      <ButtonIcon title="Fullscreen" @click="fullscreen">
        <svg-icon
          :icon-class="isFullscreen ? 'fullscreen-exit' : 'fullscreen'"
        />
      </ButtonIcon>
      <ButtonIcon title="Collapse lyric view" @click="toggleLyrics">
        <svg-icon icon-class="arrow-down" />
      </ButtonIcon>
    </div>

    <section class="now-playing">
      <div v-if="settings.showLyricsTime" class="date">{{ date }}</div>
      <img class="cover" :src="imageUrl" :alt="currentTrack.name" />

      <div class="track-row">
        <div class="track-info">
          <div class="title" :title="currentTrack.name">
            <router-link
              v-if="hasList()"
              :to="getListPath()"
              @click="toggleLyrics"
            >
              {{ currentTrack.name }}
            </router-link>
            <span v-else>{{ currentTrack.name }}</span>
          </div>
          <div class="subtitle">
            <router-link
              v-if="artist.id !== 0"
              :to="`/artist/${artist.id}`"
              @click="toggleLyrics"
            >
              {{ artist.name }}
            </router-link>
            <span v-else>{{ artist.name }}</span>
            <template v-if="album.id !== 0">
              <span> - </span>
              <router-link
                :to="`/album/${album.id}`"
                :title="album.name"
                @click="toggleLyrics"
              >
                {{ album.name }}
              </router-link>
            </template>
          </div>
        </div>
        <div class="track-actions">
          <ButtonIcon
            :title="$t('player.like')"
            @click="likeATrack(currentTrack.id)"
          >
            <svg-icon
              :icon-class="isCurrentTrackLiked ? 'heart-solid' : 'heart'"
            />
          </ButtonIcon>
          <ButtonIcon
            :title="$t('contextMenu.addToPlaylist')"
            @click="addToPlaylist"
          >
            <svg-icon icon-class="plus" />
          </ButtonIcon>
        </div>
      </div>

      <div class="progress-bar">
        <span>{{ formatTrackTime(playerState.progress) || '0:00' }}</span>
        <vue-slider
          :model-value="playerState.progress"
          class="progress-slider"
          :min="0"
          :max="currentTrackDuration"
          :interval="1"
          :drag-on-click="true"
          :duration="0"
          :dot-size="12"
          :height="2"
          :tooltip-formatter="formatTrackTime"
          :lazy="true"
          :silent="true"
          @update:model-value="updateProgress"
        />
        <span>{{ formatTrackTime(currentTrackDuration) }}</span>
      </div>

      <div class="media-controls">
        <div class="secondary-controls secondary-controls-left">
          <ButtonIcon
            v-show="!playerState.isPersonalFM"
            :title="
              playerState.repeatMode === 'one'
                ? $t('player.repeatTrack')
                : $t('player.repeat')
            "
            :class="{ active: playerState.repeatMode !== 'off' }"
            @click="switchRepeatMode"
          >
            <svg-icon
              :icon-class="
                playerState.repeatMode === 'one' ? 'repeat-1' : 'repeat'
              "
            />
          </ButtonIcon>
        </div>

        <div class="primary-controls">
          <ButtonIcon
            v-if="playerState.isPersonalFM"
            title="不喜欢"
            @click="moveToFMTrash"
          >
            <svg-icon icon-class="thumbs-down" />
          </ButtonIcon>
          <ButtonIcon
            v-else
            :title="$t('player.previous')"
            @click="playPrevTrack"
          >
            <svg-icon icon-class="previous" />
          </ButtonIcon>
          <ButtonIcon
            class="play-button"
            :title="$t(playerState.playing ? 'player.pause' : 'player.play')"
            @click="playOrPause"
          >
            <svg-icon :icon-class="playerState.playing ? 'pause' : 'play'" />
          </ButtonIcon>
          <ButtonIcon :title="$t('player.next')" @click="playNextTrack">
            <svg-icon icon-class="next" />
          </ButtonIcon>
        </div>

        <div class="secondary-controls secondary-controls-right">
          <ButtonIcon
            v-show="!playerState.isPersonalFM"
            :title="$t('player.shuffle')"
            :class="{ active: playerState.shuffle }"
            @click="switchShuffle"
          >
            <svg-icon icon-class="shuffle" />
          </ButtonIcon>

          <ButtonIcon
            v-if="isShowLyricTypeSwitch && settings.showLyricsTranslation"
            :title="
              $t(
                lyricType === 'translation'
                  ? 'player.translationLyric'
                  : 'player.PronunciationLyric'
              )
            "
            @click="switchLyricType"
          >
            <span class="lyric-switch-icon">{{
              lyricType === 'translation' ? '译' : '音'
            }}</span>
          </ButtonIcon>
        </div>
      </div>

      <div class="volume-control">
        <ButtonIcon :title="$t('player.mute')" @click="mute">
          <svg-icon :icon-class="volumeIcon" />
        </ButtonIcon>
        <vue-slider
          :model-value="volume"
          class="volume-slider"
          :min="0"
          :max="1"
          :interval="0.01"
          :drag-on-click="true"
          :duration="0"
          tooltip="none"
          :dot-size="12"
          @update:model-value="updateVolume"
        />
        <span>{{ volumePercent }}</span>
      </div>
    </section>

    <section class="lyrics-panel">
      <div v-if="!noLyric" class="amll-player" :style="lyricStyle">
        <LyricPlayer
          :key="currentTrack.id"
          ref="lyricPlayer"
          class="amll-player-content"
          :lyric-lines="amllLyricLines"
          :current-time="currentTime"
          :playing="playerState.playing && showLyrics"
          :disabled="!showLyrics"
          :enable-blur="true"
          :enable-scale="true"
          :enable-spring="true"
          :word-fade-width="0.5"
          @line-click="clickLyricLine"
          @line-contextmenu="openLyricMenu"
          @pointerup="scheduleLyricResync"
          @wheel.passive="scheduleLyricResync"
        />
      </div>
      <div v-else class="empty-lyrics">♪</div>

      <ContextMenu v-if="!noLyric" ref="lyricMenu">
        <div class="item" @click="copySelectedLyric(false)">
          {{ $t('contextMenu.copyLyric') }}
        </div>
        <div
          v-if="rightClickLyric && rightClickLyric.secondary"
          class="item"
          @click="copySelectedLyric(true)"
        >
          {{ $t('contextMenu.copyLyricWithTranslation') }}
        </div>
      </ContextMenu>
    </section>
  </div>
</template>

<script>
import { BackgroundRender, LyricPlayer } from '@applemusic-like-lyrics/vue';
import '@applemusic-like-lyrics/core/dist/style.css';
import { mapActions, mapMutations, mapState } from 'vuex';
import VueSlider from 'vue-slider-component';
import ButtonIcon from '@/components/ButtonIcon.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import { getLyric } from '@/api/track';
import { formatTrackTime } from '@/utils/common';
import { copyLyric, lyricParser } from '@/utils/lyrics';
import { isAccountLoggedIn } from '@/utils/auth';
import { getListSourcePath, hasListSource } from '@/utils/playList';
import locale from '@/locale';

export default {
  name: 'Lyrics',
  components: {
    BackgroundRender,
    ButtonIcon,
    ContextMenu,
    LyricPlayer,
    VueSlider,
  },
  data() {
    return {
      lyric: [],
      tlyric: [],
      romalyric: [],
      lyricType: 'translation',
      currentTime: 0,
      progressTimer: null,
      lyricResyncTimer: null,
      clockTimer: null,
      date: this.formatTime(new Date()),
      isFullscreen: !!document.fullscreenElement,
      rightClickLyric: null,
      systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    };
  },
  computed: {
    ...mapState(['player', 'playerState', 'settings', 'showLyrics', 'liked']),
    currentTrack() {
      return this.playerState.currentTrack || this.player.currentTrack || {};
    },
    currentTrackDuration() {
      const duration = Math.trunc((this.currentTrack.dt || 1000) / 1000);
      return duration > 1 ? duration - 1 : duration;
    },
    artist() {
      return this.currentTrack.ar?.[0] || { id: 0, name: 'unknown' };
    },
    album() {
      return this.currentTrack.al || { id: 0, name: 'unknown' };
    },
    imageUrl() {
      return `${this.currentTrack.al?.picUrl || ''}?param=1024y1024`;
    },
    bgImageUrl() {
      return `${this.currentTrack.al?.picUrl || ''}?param=512y512`;
    },
    theme() {
      if (['light', 'dark'].includes(this.settings.appearance)) {
        return this.settings.appearance;
      }
      return this.systemDark ? 'dark' : 'light';
    },
    useDynamicBackground() {
      return [true, 'dynamic'].includes(this.settings.lyricsBackground);
    },
    volume: {
      get() {
        return this.playerState.volume;
      },
      set(value) {
        this.player.volume = value;
      },
    },
    volumePercent() {
      return `${Math.round(this.volume * 100)}%`;
    },
    volumeIcon() {
      if (this.volume === 0) return 'volume-mute';
      return this.volume > 0.5 ? 'volume' : 'volume-half';
    },
    isCurrentTrackLiked() {
      return this.liked.songs.includes(this.currentTrack.id);
    },
    noLyric() {
      return this.lyric.length === 0;
    },
    isShowLyricTypeSwitch() {
      return this.tlyric.length > 0 && this.romalyric.length > 0;
    },
    lyricStyle() {
      const fontFamilies = {
        system:
          "'Barlow', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        'sans-serif':
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        serif:
          "ui-serif, 'Songti SC', SimSun, 'Noto Serif CJK SC', Georgia, serif",
      };
      return {
        '--amll-lp-font-size': `${this.settings.lyricFontSize || 28}px`,
        fontFamily:
          fontFamilies[this.settings.lyricFontFamily] || fontFamilies.system,
        fontWeight: Number(this.settings.lyricFontWeight) || 600,
      };
    },
    amllLyricLines() {
      const visibleLines = this.lyric.filter(({ content }) => Boolean(content));
      const lastLine = visibleLines[visibleLines.length - 1];
      const duration = Math.max(
        this.currentTrackDuration * 1000,
        (lastLine?.time || 0) * 1000 + 5000
      );

      return visibleLines.map((line, index) => {
        const startTime = Math.round(line.time * 1000);
        const nextTime = visibleLines[index + 1]?.time * 1000;
        const endTime = Math.max(
          startTime + 1,
          Math.round(nextTime ?? duration)
        );
        const translatedLyric = this.findSecondaryLyric(this.tlyric, line);
        const romanLyric = this.findSecondaryLyric(this.romalyric, line);

        return {
          words: [{ startTime, endTime, word: line.content }],
          translatedLyric:
            this.settings.showLyricsTranslation &&
            this.lyricType === 'translation'
              ? translatedLyric
              : '',
          romanLyric:
            this.settings.showLyricsTranslation &&
            this.lyricType === 'romaPronunciation'
              ? romanLyric
              : '',
          startTime,
          endTime,
          isBG: false,
          isDuet: false,
        };
      });
    },
  },
  watch: {
    'currentTrack.id'() {
      this.clearLyrics();
      this.getLyric();
    },
    showLyrics(show) {
      if (show) {
        this.startProgressSync();
        this.$store.commit('enableScrolling', false);
      } else {
        this.stopProgressSync();
        this.$store.commit('enableScrolling', true);
      }
    },
  },
  created() {
    this.getLyric();
    this.clockTimer = setInterval(() => {
      this.date = this.formatTime(new Date());
    }, 1000);
    this.handleKeydown = event => {
      if (event.key === 'F11') {
        event.preventDefault();
        this.fullscreen();
      }
    };
    this.handleFullscreenChange = () => {
      this.isFullscreen = !!document.fullscreenElement;
    };
    this.systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    this.handleSystemThemeChange = event => {
      this.systemDark = event.matches;
    };
    document.addEventListener('keydown', this.handleKeydown);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    this.systemThemeMedia.addEventListener(
      'change',
      this.handleSystemThemeChange
    );
  },
  mounted() {
    if (this.showLyrics) this.startProgressSync();
  },
  beforeUnmount() {
    this.cleanup();
  },
  beforeDestroy() {
    this.cleanup();
  },
  methods: {
    ...mapMutations(['toggleLyrics', 'updateModal']),
    ...mapActions(['likeATrack', 'showToast']),
    cleanup() {
      clearInterval(this.clockTimer);
      clearTimeout(this.lyricResyncTimer);
      this.stopProgressSync();
      document.removeEventListener('keydown', this.handleKeydown);
      document.removeEventListener(
        'fullscreenchange',
        this.handleFullscreenChange
      );
      this.systemThemeMedia.removeEventListener(
        'change',
        this.handleSystemThemeChange
      );
    },
    startProgressSync() {
      this.stopProgressSync();
      const sync = () => {
        const realtimeProgress = this.player.seek(null, false);
        const snapshotProgress = Number(this.playerState.progress) || 0;
        // Howler may briefly report 0 while a source is loading. Keep the
        // smooth realtime value in normal playback and use the Vuex snapshot
        // only for that invalid zero state.
        const progress =
          Number.isFinite(realtimeProgress) &&
          (realtimeProgress > 0 || snapshotProgress <= 0)
            ? realtimeProgress
            : snapshotProgress;
        this.currentTime = Math.max(0, Math.round(progress * 1000));
      };
      sync();
      this.progressTimer = setInterval(sync, 50);
    },
    stopProgressSync() {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    },
    updateProgress(value) {
      this.player.progress = value;
      this.$nextTick(() => this.resyncLyricPosition());
    },
    updateVolume(value) {
      this.player.volume = value;
    },
    findSecondaryLyric(lines, line) {
      return lines.find(item => item.rawTime === line.rawTime)?.content || '';
    },
    getLyric() {
      if (!this.currentTrack.id) return Promise.resolve(false);
      const trackId = this.currentTrack.id;
      return getLyric(trackId).then(data => {
        if (trackId !== this.currentTrack.id) return false;
        if (!data?.lrc?.lyric) {
          this.clearLyrics();
          return false;
        }

        let { lyric, tlyric, romalyric } = lyricParser(data);
        lyric = lyric.filter(
          line => !/^作(词|曲)\s*(:|：)\s*无$/.test(line.content)
        );

        const isInstrumental =
          lyric.length <= 10 &&
          lyric.some(line => line.content === '纯音乐，请欣赏');
        if (isInstrumental) {
          const author = this.currentTrack.ar?.[0]?.name;
          lyric = lyric.filter(line => {
            const credit = line.content.match(/^作(词|曲)\s*(:|：)\s*/);
            return !credit || line.content.replace(credit[0], '') !== author;
          });
        }

        if (lyric.length === 1 && isInstrumental) {
          this.clearLyrics();
          return false;
        }

        this.lyric = lyric;
        this.tlyric = tlyric;
        this.romalyric = romalyric;
        this.lyricType =
          tlyric.length > 0 ? 'translation' : 'romaPronunciation';
        return true;
      });
    },
    clearLyrics() {
      this.lyric = [];
      this.tlyric = [];
      this.romalyric = [];
      this.rightClickLyric = null;
    },
    clickLyricLine(event) {
      const line = this.amllLyricLines[event.lineIndex];
      if (!line) return;
      this.player.seek(line.startTime / 1000);
      this.scheduleLyricResync();
    },
    scheduleLyricResync() {
      clearTimeout(this.lyricResyncTimer);
      this.lyricResyncTimer = setTimeout(() => {
        this.resyncLyricPosition();
      }, 5200);
    },
    resyncLyricPosition() {
      const exposedPlayer = this.$refs.lyricPlayer?.lyricPlayer;
      const lyricPlayer = exposedPlayer?.value || exposedPlayer;
      if (!lyricPlayer) return;
      lyricPlayer.setCurrentTime(this.currentTime, true);
      lyricPlayer.calcLayout(false, false);
    },
    openLyricMenu(event) {
      const line = this.amllLyricLines[event.lineIndex];
      if (!line) return;
      this.rightClickLyric = {
        content: line.words.map(word => word.word).join(''),
        secondary: line.translatedLyric || line.romanLyric,
      };
      this.$refs.lyricMenu.openMenu(event);
    },
    copySelectedLyric(withTranslation) {
      if (!this.rightClickLyric) return;
      const value = withTranslation
        ? `${this.rightClickLyric.content} ${this.rightClickLyric.secondary}`
        : this.rightClickLyric.content;
      copyLyric(value.trim());
    },
    switchLyricType() {
      this.lyricType =
        this.lyricType === 'translation' ? 'romaPronunciation' : 'translation';
    },
    formatTrackTime,
    formatTime(value) {
      return [value.getHours(), value.getMinutes(), value.getSeconds()]
        .map(part => part.toString().padStart(2, '0'))
        .join(':');
    },
    fullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    },
    addToPlaylist() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.t('toast.needToLogin'));
        return;
      }
      this.$store.dispatch('fetchLikedPlaylist');
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'show',
        value: true,
      });
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'selectedTrackID',
        value: this.currentTrack.id,
      });
    },
    playPrevTrack() {
      this.player.playPrevTrack();
    },
    playOrPause() {
      this.player.playOrPause();
    },
    playNextTrack() {
      this.playerState.isPersonalFM
        ? this.player.playNextFMTrack()
        : this.player.playNextTrack();
    },
    moveToFMTrash() {
      this.player.moveToFMTrash();
    },
    switchRepeatMode() {
      this.player.switchRepeatMode();
    },
    switchShuffle() {
      this.player.switchShuffle();
    },
    mute() {
      this.player.mute();
    },
    hasList() {
      return hasListSource();
    },
    getListPath() {
      return getListSourcePath();
    },
  },
};
</script>

<style lang="scss" scoped>
.lyrics-page {
  --lyrics-text: #f8f8fa;
  --lyrics-muted: rgba(248, 248, 250, 0.62);
  --lyrics-surface: rgba(20, 20, 22, 0.28);
  --lyrics-hover: rgba(255, 255, 255, 0.12);
  position: fixed;
  top: -1px;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
  display: grid;
  grid-template-columns: minmax(280px, 46%) minmax(360px, 54%);
  overflow: hidden;
  color: var(--lyrics-text);
  background: #18181a;
  contain: paint;
  -webkit-app-region: drag;
}

.lyrics-page[data-theme='light'] {
  --lyrics-text: #171719;
  --lyrics-muted: rgba(23, 23, 25, 0.62);
  --lyrics-surface: rgba(255, 255, 255, 0.44);
  --lyrics-hover: rgba(0, 0, 0, 0.08);
  background: #f4f4f6;
}

.amll-background,
.blur-background,
.background-tint {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.amll-background,
.blur-background {
  transform: scale(1.06);
}

.blur-background {
  background-position: center;
  background-size: cover;
  filter: blur(48px) saturate(1.15);
}

.background-tint {
  z-index: 1;
  background: rgba(14, 14, 16, 0.52);
}

.lyrics-page[data-theme='light'] .background-tint {
  background: rgba(250, 250, 252, 0.7);
}

.window-actions {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 4;
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.window-actions :deep(button) {
  width: 42px;
  height: 42px;
  margin: 0;
  font-size: 20px;
  color: var(--lyrics-text);
  background: var(--lyrics-surface);
  backdrop-filter: blur(18px) saturate(130%);
}

.window-actions :deep(.svg-icon) {
  width: 20px;
  height: 20px;
  color: currentColor;
}

.now-playing,
.lyrics-panel {
  position: relative;
  z-index: 2;
  min-width: 0;
  min-height: 0;
  -webkit-app-region: no-drag;
}

.now-playing {
  width: min(54vh, 520px);
  align-self: center;
  justify-self: end;
  margin-right: clamp(28px, 4vw, 72px);
}

.date {
  margin-bottom: 18px;
  overflow: hidden;
  color: var(--lyrics-text);
  font-size: clamp(32px, 4vw, 58px);
  font-weight: 650;
  text-align: center;
  white-space: nowrap;
}

.cover {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  object-fit: cover;
  user-select: none;
}

.track-row {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
}

.track-info {
  min-width: 0;
}

.title,
.subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title {
  font-size: 21px;
  font-weight: 650;
}

.subtitle {
  margin-top: 4px;
  color: var(--lyrics-muted);
  font-size: 14px;
}

.track-actions,
.media-controls,
.primary-controls,
.volume-control,
.progress-bar {
  display: flex;
  align-items: center;
}

.track-actions {
  flex: none;
}

.progress-bar {
  gap: 12px;
  margin-top: 20px;
  color: var(--lyrics-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.progress-slider {
  flex: 1;
  min-width: 0;
}

.media-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  margin-top: 10px;
}

.secondary-controls {
  display: flex;
  align-items: center;
}

.secondary-controls-left {
  justify-content: flex-start;
}

.secondary-controls-right {
  justify-content: flex-end;
}

.primary-controls {
  gap: 4px;
}

.primary-controls :deep(button) {
  font-size: 22px;
}

.primary-controls .play-button {
  font-size: 30px;
}

.now-playing :deep(button) {
  color: var(--lyrics-text);
}

.now-playing :deep(button:hover) {
  background: var(--lyrics-hover);
}

.now-playing :deep(.svg-icon) {
  color: currentColor;
}

.primary-controls :deep(.svg-icon) {
  width: 22px;
  height: 22px;
  opacity: 0.9;
}

.primary-controls .play-button :deep(.svg-icon) {
  width: 30px;
  height: 30px;
}

.active :deep(.svg-icon) {
  opacity: 1;
}

.lyric-switch-icon {
  color: currentColor;
  font-size: 14px;
  font-weight: 650;
}

.volume-control {
  gap: 8px;
  width: min(240px, 55%);
  margin: 4px auto 0;
  color: var(--lyrics-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.volume-slider {
  flex: 1;
  min-width: 0;
}

.volume-control span {
  width: 34px;
  text-align: right;
}

.lyrics-panel {
  height: 100vh;
  padding: 4vh 40px 4vh 0;
  box-sizing: border-box;
}

.amll-player {
  --amll-lp-color: var(--lyrics-text);
  --amll-lp-hover-bg-color: var(--lyrics-hover);
  width: min(680px, 100%);
  height: 100%;
  mix-blend-mode: normal;
}

.amll-background :deep(.amll-background-render),
.amll-player :deep(.amll-player-content) {
  width: 100%;
  height: 100%;
}

.empty-lyrics {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--lyrics-muted);
  font-size: 64px;
}

.lyrics-panel :deep(.context-menu) {
  position: absolute;
  inset: 0;
  width: 0;
  height: 0;
}

@media (max-aspect-ratio: 10/9), (max-width: 820px) {
  .lyrics-page {
    grid-template-columns: 1fr;
  }

  .now-playing {
    display: none;
  }

  .lyrics-panel {
    padding: 5vh 22px;
  }

  .amll-player {
    width: 100%;
  }
}

@media (max-height: 720px) and (min-width: 821px) {
  .now-playing {
    width: min(48vh, 390px);
  }

  .track-row {
    margin-top: 12px;
  }

  .progress-bar {
    margin-top: 12px;
  }
}
</style>
