# macOS 毛玻璃（Vibrancy）背景设计

## 目标

在 macOS 上为应用主窗口提供原生毛玻璃（半透明、自适应深色模式）背景，让桌面 / 壁纸能透过窗口模糊显示。通过设置页的一个开关控制，切换后**即时生效**，无需重启。

非 macOS 平台（Windows / Linux）不显示该开关，行为完全不变。

## 背景与约束

- 这是 YesPlayMusic v1.x 维护分支，仅接受关键修复与小范围改动，需保持改动聚焦。
- 当前窗口背景是不透明的：`src/background.js:197` 把 `backgroundColor` 设为 `#222`（深）/`#fff`（浅）。
- 渲染层 `src/assets/css/global.scss:71` 用 `body { background-color: var(--color-body-bg) }` 铺满不透明底色，会完全遮挡任何窗口模糊。
- 因此要实现真正能透出桌面的毛玻璃，**主进程窗口背景**与**渲染层 body 背景**必须同时透明。
- 主题切换现状：`src/utils/common.js` 的 `changeAppearance()` 在 `document.body` 上设 `data-theme`；CSS 变量按 `:root` / `[data-theme='dark']` 切换。Vibrancy 开关沿用同一套机制。

## 方案选型

**采用：原生 `vibrancy` + 渲染层透明。** 使用 Electron `BrowserWindow` 内建的 `vibrancy` 选项（底层是 macOS 原生 `NSVisualEffectView`）。启用时设 `vibrancy: 'under-window'` 并把窗口背景设为透明，同时渲染层给 `body` 加透明类让模糊透出。`under-window` 材质由系统按深 / 浅外观自动适配，GPU 加速。

**否决 — CSS `backdrop-filter: blur()`：** 纯渲染层模糊。但窗口本身不透明，web 内容背后没有可模糊的桌面内容，只能让 app 内容自我模糊，无法透出壁纸，达不到目标效果。

**否决 — 始终开启、无开关：** 实现更简单，但用户明确要求设置页开关 + 即时切换。

## 涉及改动

### 1. 设置项（数据层）

- 新增设置键 `settings.enableVibrancy`，默认 `false`。
- 沿用现有设置机制：在 `Settings.vue` 中提交到 Vuex `settings`，`plugins/localStorage.js` 自动持久化，`plugins/sendSettings.js`（仅 Electron）镜像到主进程的 electron-store。

### 2. 设置页开关（`src/views/Settings.vue`）

- 新增一个 `item`，仅在 `isMac` 时显示（参考现有 `v-if="isElectron"` 的 `showLibraryDefault` 块，组件已可访问平台判断）。
- 沿用现有 `toggle` 结构（checkbox + label）。
- 新增 computed `enableVibrancy`，get 读 `this.settings.enableVibrancy || false`，set 中：
  1. `this.$store.commit('updateSettings', { key: 'enableVibrancy', value })`
  2. 调用 `changeVibrancy(value)`（见下）实现即时生效。

### 3. 即时切换逻辑（`src/utils/common.js`）

- 新增 `changeVibrancy(on)`，仿照 `changeAppearance()`：
  1. `document.body.setAttribute('data-vibrancy', on ? 'on' : 'off')` —— 切换渲染层透明样式。
  2. 若在 Electron 环境（`process.env.IS_ELECTRON` 且可拿到 `ipcRenderer`），`ipcRenderer.send('set-vibrancy', on)` 通知主进程实时调用 `setVibrancy`。
- 启动初始化：在 `src/store/index.js` 现有 appearance 初始化附近，按 `settings.enableVibrancy` 调用一次 `changeVibrancy()`，保证刷新 / 启动时样式与窗口状态一致。

### 4. 主进程窗口创建（`src/background.js`）

- 创建窗口时读 `settings.enableVibrancy`。
- 当 `isMac && enableVibrancy` 为真：
  - `options.vibrancy = 'under-window'`
  - `options.backgroundColor = '#00000000'`（透明，避免启动首帧先显示不透明底色再变透明的闪烁）
- 否则保持现有 `backgroundColor` 的 `#222`/`#fff` 逻辑不变。
- 非 macOS 完全忽略 `vibrancy`，行为零变化。

### 5. 主进程 IPC（`src/electron/ipcMain.js`）

- 新增 `set-vibrancy` 通道：收到布尔值 `enable` 后，对主窗口调用 `win.setVibrancy(enable ? 'under-window' : null)`。
- 仅在 macOS 生效；非 mac 可直接忽略（`setVibrancy` 在其他平台无效果，但仍做平台判断以保持清晰）。
- 注意：`src/electron/*` 只编译到 ES2015，不要使用 ES2020 语法（如带方括号的可选链）。

### 6. 样式（`src/assets/css/global.scss`）

- 新增 `[data-vibrancy='on']` 区块（作用在 `body[data-vibrancy='on']`，与 `data-theme` 同元素）：
  - `body` 背景透明：覆盖为 `background-color: transparent`。
  - 滚动条 track 透明：`::-webkit-scrollbar-track` 的 `background` 改为 `transparent`。
  - 把会铺满、且遮挡模糊的不透明面板换成半透明：导航栏已用 `--color-navbar-bg`（含 alpha）问题不大；主内容区 / `#nav` 等铺底处改用半透明色值，让模糊透出。
- 深 / 浅模糊由系统 `under-window` 材质自动处理，**无需**单独写深色模糊色值。
- 半透明面板保留一定不透明度兜底，避免 app 内 appearance 与系统外观不一致时文字对比过低、可读性差。

## 边界情况

- **非 macOS：** 开关不显示，主进程忽略 `vibrancy`，CSS 的 `data-vibrancy` 即使存在也只是把 body 透明（但窗口不透明 → 看到的是纯窗口背景）；因此开关仅对 mac 暴露，从源头规避。
- **深 / 浅模式切换：** `under-window` 随系统外观自适应。app 内 appearance 与系统不一致时，靠半透明面板的兜底不透明度保证可读性。
- **关闭开关：** `changeVibrancy(false)` → body `data-vibrancy="off"` 恢复不透明底色，并 IPC 调 `setVibrancy(null)` 撤销材质，两端同步。
- **启动闪烁：** 设置为开时，主进程在 `BrowserWindow` 构造阶段即带上 `vibrancy` 与透明背景，避免先不透明后透明的闪烁。

## 验证方式

无测试套件，手动验证（`yarn electron:serve`，在 macOS 上）：

1. 设置页出现「毛玻璃背景」开关（仅 macOS）。
2. 打开开关 → 窗口即时变为毛玻璃，能透出桌面 / 壁纸。
3. 切换系统深 / 浅外观 → 模糊底色随之自适应，文字清晰可读。
4. 关闭开关 → 即时恢复原不透明背景。
5. 重启应用 → 设置被记住，启动即为对应状态，无首帧闪烁。
6. 在非 macOS（若可测）→ 无该开关，外观与行为不变。

## 不做的事（YAGNI）

- 不提供 vibrancy 材质种类（sidebar / fullscreen-ui 等）的选择，固定 `under-window`。
- 不为 Windows 的 Mica / Acrylic 做等价实现（超出本次范围，可后续单独立项）。
- 不改动除铺底背景外的组件视觉风格。
