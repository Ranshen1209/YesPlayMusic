<template>
  <Modal
    class="hidden-cards-modal"
    :show="show"
    :close="close"
    :show-footer="true"
    :title="$t('settings.hiddenCards.title')"
    width="40vw"
  >
    <template slot="default">
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="tab"
          :class="{ active: currentTab === t.key }"
          @click="currentTab = t.key"
        >
          {{ $t(t.labelKey) }} ({{ count(t.key) }})
        </button>
      </div>
      <div v-if="currentList.length === 0" class="empty">
        {{ $t('settings.hiddenCards.empty') }}
      </div>
      <div v-else class="list">
        <div v-for="item in currentList" :key="item.id" class="row">
          <div class="name">{{ item.name }}</div>
          <button class="restore" @click="restore(item.id)">
            {{ $t('settings.hiddenCards.restore') }}
          </button>
        </div>
      </div>
    </template>
    <template slot="footer">
      <button @click="close">{{ $t('common.cancel') }}</button>
      <button
        class="primary"
        :disabled="currentList.length === 0"
        @click="clearCurrent"
      >
        {{ $t('settings.hiddenCards.clearTab') }}
      </button>
    </template>
  </Modal>
</template>

<script>
import { mapMutations, mapState } from 'vuex';
import Modal from '@/components/Modal.vue';

export default {
  name: 'ModalHiddenCards',
  components: { Modal },
  data() {
    return {
      currentTab: 'playlist',
      tabs: [
        { key: 'playlist', labelKey: 'settings.hiddenCards.tab.playlist' },
        { key: 'artist', labelKey: 'settings.hiddenCards.tab.artist' },
        { key: 'album', labelKey: 'settings.hiddenCards.tab.album' },
      ],
    };
  },
  computed: {
    ...mapState(['modals', 'data']),
    show: {
      get() {
        return (
          this.modals.hiddenCardsModal && this.modals.hiddenCardsModal.show
        );
      },
      set(value) {
        this.updateModal({
          modalName: 'hiddenCardsModal',
          key: 'show',
          value,
        });
      },
    },
    hiddenCards() {
      return (
        (this.data && this.data.hiddenCards) || {
          playlist: [],
          artist: [],
          album: [],
        }
      );
    },
    currentList() {
      return this.hiddenCards[this.currentTab] || [];
    },
  },
  methods: {
    ...mapMutations(['updateModal', 'unhideCard', 'clearHiddenCards']),
    count(key) {
      return (this.hiddenCards[key] || []).length;
    },
    close() {
      this.show = false;
    },
    restore(id) {
      this.unhideCard({ type: this.currentTab, id });
    },
    clearCurrent() {
      this.clearHiddenCards(this.currentTab);
    },
  },
};
</script>

<style lang="scss" scoped>
.tabs {
  display: flex;
  gap: 8px;
  padding: 0 6px 12px;
}
.tab {
  background: var(--color-secondary-bg-for-transparent);
  border: 0;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
}
.tab.active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-weight: 600;
}
.empty {
  padding: 32px;
  text-align: center;
  opacity: 0.6;
  font-size: 14px;
  color: var(--color-text);
}
.list {
  max-height: 50vh;
  overflow: auto;
}
.row {
  display: flex;
  align-items: center;
  padding: 6px;
  border-radius: 8px;
  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
  .name {
    flex: 1;
    font-size: 14px;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .restore {
    background: var(--color-secondary-bg-for-transparent);
    color: var(--color-text);
    border: 0;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }
}
</style>
