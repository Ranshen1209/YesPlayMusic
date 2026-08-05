<template>
  <div ref="contextMenu" class="context-menu">
    <Teleport to="body">
      <div
        v-if="showMenu"
        ref="menu"
        class="menu context-menu-surface"
        tabindex="-1"
        :style="{ top: top, left: left }"
        @blur="closeMenu"
        @click="closeMenu"
      >
        <slot></slot>
      </div>
    </Teleport>
  </div>
</template>

<script>
import { mapState } from 'vuex';

export default {
  name: 'ContextMenu',
  data() {
    return {
      showMenu: false,
      top: '0px',
      left: '0px',
    };
  },
  computed: {
    ...mapState(['playerState']),
  },
  methods: {
    setMenu(top, left) {
      let heightOffset = this.playerState.enabled ? 64 : 0;
      let largestHeight =
        window.innerHeight - this.$refs.menu.offsetHeight - heightOffset;
      let largestWidth = window.innerWidth - this.$refs.menu.offsetWidth - 25;
      top = Math.max(0, Math.min(top, largestHeight));
      left = Math.max(0, Math.min(left, largestWidth));
      this.top = top + 'px';
      this.left = left + 'px';
    },

    closeMenu() {
      this.showMenu = false;
      if (this.$parent.closeMenu !== undefined) {
        this.$parent.closeMenu();
      }
      this.$store.commit('enableScrolling', true);
    },

    openMenu(e) {
      this.showMenu = true;
      this.$nextTick(
        function () {
          this.$refs.menu.focus();
          this.setMenu(e.clientY ?? e.y, e.clientX ?? e.x);
        }.bind(this)
      );
      e.preventDefault();
      this.$store.commit('enableScrolling', false);
    },
  },
};
</script>

<style lang="scss" scoped>
.context-menu {
  width: 100%;
  height: 100%;
  user-select: none;
}

.menu {
  position: fixed;
  min-width: 136px;
  max-width: 240px;
  list-style: none;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.58);
  -webkit-backdrop-filter: saturate(190%) blur(32px);
  backdrop-filter: saturate(190%) blur(32px);
  border-radius: 12px;
  box-sizing: border-box;
  padding: 6px;
  z-index: 1000;
  isolation: isolate;
  -webkit-app-region: no-drag;
  transition: background 125ms ease-out, opacity 125ms ease-out,
    transform 125ms ease-out;

  &:focus {
    outline: none;
  }
}

[data-theme='dark'] .menu {
  background: rgba(28, 28, 30, 0.82);
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.52);
  -webkit-backdrop-filter: saturate(160%) blur(28px) brightness(72%);
  backdrop-filter: saturate(160%) blur(28px) brightness(72%);
}

@supports (-moz-appearance: none) {
  .menu {
    background-color: var(--color-body-bg) !important;
  }
}

.menu :deep(.item) {
  font-weight: 600;
  font-size: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: default;
  color: var(--color-text);
  display: flex;
  align-items: center;
  &:hover {
    color: var(--color-primary);
    background: var(--color-primary-bg-for-transparent);
    transition: opacity 125ms ease-out, transform 125ms ease-out;
  }
  &:active {
    opacity: 0.75;
    transform: scale(0.95);
  }

  .svg-icon {
    height: 16px;
    width: 16px;
    margin-right: 5px;
  }
}

.menu :deep(hr) {
  margin: 4px 10px;
  background: rgba(128, 128, 128, 0.18);
  height: 1px;
  box-shadow: none;
  border: none;
}

.menu :deep(.item-info) {
  padding: 10px 10px;
  display: flex;
  align-items: center;
  color: var(--color-text);
  cursor: default;
  img {
    height: 38px;
    width: 38px;
    border-radius: 4px;
  }
  .info {
    margin-left: 10px;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
  .subtitle {
    font-size: 12px;
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
}
</style>
