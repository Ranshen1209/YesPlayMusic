<template>
  <div class="downloads-page">
    <div class="header">
      <h1>{{ $t('downloads.title') }}</h1>
      <div class="actions">
        <button @click="openFolder">
          {{ $t('downloads.action.openFolder') }}
        </button>
        <button :disabled="tasks.length === 0" @click="clearAll">
          {{ $t('downloads.action.clearAll') }}
        </button>
      </div>
    </div>

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
      {{ $t('downloads.empty') }}
    </div>
    <div v-else class="list">
      <div
        v-for="task in currentList"
        :key="task.id"
        class="task"
        :class="task.status"
      >
        <div class="status-badge" :class="task.status">{{
          $t('downloads.status.' + task.status)
        }}</div>
        <div class="info">
          <div class="name">{{ task.name }}</div>
          <div class="meta">
            <span class="artist">{{ artistText(task) }}</span>
            <span v-if="task.target" class="target" :title="task.target">{{
              task.target
            }}</span>
            <span v-if="task.error" class="error">{{ task.error }}</span>
          </div>
        </div>
        <div class="row-actions">
          <button
            v-if="task.status === 'failed'"
            class="row-btn"
            @click="retry(task)"
          >
            {{ $t('downloads.action.retry') }}
          </button>
          <button
            v-if="task.status === 'succeeded' && task.target"
            class="row-btn"
            @click="reveal(task)"
          >
            {{ $t('downloads.action.reveal') }}
          </button>
          <button class="row-btn" @click="remove(task)">
            {{ $t('downloads.action.remove') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapMutations, mapState } from 'vuex';
import { retryDownloadTask, openDownloadFolder } from '@/utils/download';

const isElectron = process.env.IS_ELECTRON;

export default {
  name: 'Downloads',
  data() {
    return {
      currentTab: 'active',
      tabs: [
        { key: 'active', labelKey: 'downloads.tab.active' },
        { key: 'done', labelKey: 'downloads.tab.done' },
        { key: 'failed', labelKey: 'downloads.tab.failed' },
      ],
    };
  },
  computed: {
    ...mapState(['downloads', 'settings']),
    tasks() {
      return (this.downloads && this.downloads.tasks) || [];
    },
    activeList() {
      return this.tasks.filter(
        t => t.status === 'pending' || t.status === 'downloading'
      );
    },
    doneList() {
      return this.tasks.filter(t => t.status === 'succeeded');
    },
    failedList() {
      return this.tasks.filter(t => t.status === 'failed');
    },
    currentList() {
      if (this.currentTab === 'active') return this.activeList;
      if (this.currentTab === 'done') return this.doneList;
      if (this.currentTab === 'failed') return this.failedList;
      return [];
    },
  },
  methods: {
    ...mapMutations(['removeDownloadTask', 'clearDownloadTasks']),
    count(key) {
      if (key === 'active') return this.activeList.length;
      if (key === 'done') return this.doneList.length;
      if (key === 'failed') return this.failedList.length;
      return 0;
    },
    artistText(task) {
      const ar = task.ar || [];
      return ar
        .map(a => (a && a.name) || '')
        .filter(Boolean)
        .join(', ');
    },
    retry(task) {
      retryDownloadTask(task);
    },
    reveal(task) {
      if (!isElectron || !task.target) return;
      const electron = window.require('electron');
      electron.shell.showItemInFolder(task.target);
    },
    remove(task) {
      this.removeDownloadTask(task.id);
    },
    openFolder() {
      openDownloadFolder(this.settings && this.settings.downloadFolder);
    },
    clearAll() {
      this.clearDownloadTasks(
        t => t.status === 'pending' || t.status === 'downloading'
      );
    },
  },
};
</script>

<style lang="scss" scoped>
.downloads-page {
  margin-top: 32px;
  color: var(--color-text);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  h1 {
    font-size: 36px;
    font-weight: 700;
  }
  .actions button {
    background: var(--color-secondary-bg-for-transparent);
    border: 0;
    color: var(--color-text);
    border-radius: 8px;
    padding: 8px 12px;
    font-weight: 600;
    margin-left: 8px;
    cursor: pointer;
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    &:hover:not(:disabled) {
      transform: scale(1.04);
    }
  }
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tab {
  background: transparent;
  border: 0;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  opacity: 0.6;
  cursor: pointer;
  &:hover {
    opacity: 1;
  }
}
.tab.active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  opacity: 1;
}

.empty {
  margin-top: 80px;
  text-align: center;
  font-size: 16px;
  opacity: 0.55;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.task {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
  .status-badge {
    flex-shrink: 0;
    width: 88px;
    text-align: center;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    margin-right: 16px;
    background: var(--color-secondary-bg);
    &.downloading {
      color: var(--color-primary);
      background: var(--color-primary-bg);
    }
    &.succeeded {
      color: #2eaa53;
      background: rgba(46, 170, 83, 0.12);
    }
    &.failed {
      color: #d33;
      background: rgba(221, 51, 51, 0.12);
    }
    &.pending {
      opacity: 0.7;
    }
  }
  .info {
    flex: 1;
    min-width: 0;
    .name {
      font-size: 15px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      display: flex;
      gap: 10px;
      font-size: 12px;
      opacity: 0.65;
      margin-top: 2px;
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .artist {
        flex-shrink: 0;
      }
      .target {
        max-width: 360px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      }
      .error {
        color: #d33;
      }
    }
  }
  .row-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    .row-btn {
      background: transparent;
      border: 0;
      color: var(--color-text);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      opacity: 0.7;
      &:hover {
        opacity: 1;
        background: var(--color-secondary-bg);
      }
    }
  }
}
</style>
