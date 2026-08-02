import { createI18n } from 'vue-i18n';
import store from '@/store';

import en from './lang/en.js';
import zhCN from './lang/zh-CN.js';
import zhTW from './lang/zh-TW.js';
import tr from './lang/tr.js';

const i18n = createI18n({
  legacy: true,
  locale: store.state.settings.lang,
  messages: {
    en,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    tr,
  },
  missingWarn: false,
  fallbackWarn: false,
});

// Keep the Vue 2-shaped API available to utility modules while components use
// the Vue 3 legacy-mode plugin through `app.use(i18n)`.
i18n.t = (...args) => i18n.global.t(...args);
i18n.tc = (...args) => i18n.global.t(...args);
i18n.te = (...args) => i18n.global.te(...args);
i18n.d = (...args) => i18n.global.d(...args);
i18n.n = (...args) => i18n.global.n(...args);
Object.defineProperty(i18n, 'locale', {
  configurable: true,
  get: () => i18n.global.locale,
  set: value => {
    i18n.global.locale = value;
  },
});

export default i18n;
