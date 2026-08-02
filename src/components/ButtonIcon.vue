<template>
  <button class="button-icon" @click="$emit('click', $event)">
    <slot></slot>
  </button>
</template>

<script>
export default {
  name: 'ButtonIcon',
  emits: ['click'],
};
</script>

<style lang="scss" scoped>
button {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 16px;
  line-height: 1;
  padding: 8px;
  background: transparent;
  margin: 4px;
  border-radius: 25%;
  transition: 0.2s;
  :slotted(.svg-icon) {
    color: var(--color-text);
  }
  &:first-child {
    margin-left: 0;
  }
  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
  &:active {
    transform: scale(0.92);
  }
}
</style>
