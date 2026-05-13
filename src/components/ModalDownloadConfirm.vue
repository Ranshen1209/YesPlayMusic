<template>
  <Modal
    class="download-confirm-modal"
    :show="show"
    :close="close"
    :show-footer="true"
    :title="$t('toast.downloadConfirm')"
    width="25vw"
  >
    <template slot="default">
      <div class="row">
        <div class="label">{{ $t('settings.musicQuality.text') }}</div>
        <select v-model="bitrate">
          <option value="128000">
            {{ $t('settings.musicQuality.low') }} - 128Kbps
          </option>
          <option value="192000">
            {{ $t('settings.musicQuality.medium') }} - 192Kbps
          </option>
          <option value="320000">
            {{ $t('settings.musicQuality.high') }} - 320Kbps
          </option>
          <option value="flac">
            {{ $t('settings.musicQuality.lossless') }} - FLAC
          </option>
          <option value="999000">Hi-Res</option>
        </select>
      </div>
      <div class="row">
        <div class="label">{{ $t('settings.downloadFolder.text') }}</div>
        <div class="folder">{{ folderDisplay }}</div>
      </div>
      <div class="summary">{{ summary }}</div>
    </template>
    <template slot="footer">
      <button @click="close">{{ $t('common.cancel') }}</button>
      <button class="primary" @click="confirm">
        {{ $t('common.confirm') }}
      </button>
    </template>
  </Modal>
</template>

<script>
import { mapMutations, mapState } from 'vuex';
import Modal from '@/components/Modal.vue';
import { downloadTracks, getDefaultDownloadFolder } from '@/utils/download';

export default {
  name: 'ModalDownloadConfirm',
  components: { Modal },
  data() {
    return {
      bitrate: '320000',
      defaultFolder: '',
    };
  },
  computed: {
    ...mapState(['modals', 'settings']),
    show: {
      get() {
        return this.modals.downloadConfirmModal.show;
      },
      set(value) {
        this.updateModal({
          modalName: 'downloadConfirmModal',
          key: 'show',
          value,
        });
      },
    },
    tracks() {
      return this.modals.downloadConfirmModal.tracks || [];
    },
    subFolder() {
      return this.modals.downloadConfirmModal.subFolder || '';
    },
    folderDisplay() {
      const f = this.settings?.downloadFolder;
      if (f && f.trim() !== '') return f;
      return (
        this.defaultFolder || this.$t('settings.downloadFolder.defaultHint')
      );
    },
    summary() {
      const count = this.tracks.length;
      return this.$t('toast.downloadStarted', { count });
    },
  },
  watch: {
    show(value) {
      if (value) {
        this.bitrate = String(this.settings?.downloadBitrate ?? '320000');
        this.ensureDefaultFolder();
      }
    },
  },
  methods: {
    ...mapMutations(['updateModal']),
    async ensureDefaultFolder() {
      if (this.defaultFolder) return;
      try {
        this.defaultFolder = await getDefaultDownloadFolder();
      } catch (e) {
        this.defaultFolder = '';
      }
    },
    close() {
      this.show = false;
    },
    async confirm() {
      const tracks = this.tracks.slice();
      const subFolder = this.subFolder;
      const br = this.bitrate;
      this.close();
      this.updateModal({
        modalName: 'downloadConfirmModal',
        key: 'tracks',
        value: [],
      });
      this.updateModal({
        modalName: 'downloadConfirmModal',
        key: 'subFolder',
        value: '',
      });
      await downloadTracks(tracks, { br, subFolder });
    },
  },
};
</script>

<style lang="scss" scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 6px;
  font-size: 14px;
  color: var(--color-text);
  .label {
    font-weight: 600;
  }
  select {
    background: var(--color-secondary-bg-for-transparent);
    border: 0;
    color: var(--color-text);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 13px;
  }
  .folder {
    max-width: 70%;
    text-align: right;
    word-break: break-all;
    opacity: 0.78;
    font-size: 13px;
  }
}
.summary {
  margin-top: 8px;
  padding: 8px 6px;
  font-size: 13px;
  opacity: 0.7;
  color: var(--color-text);
}
</style>
