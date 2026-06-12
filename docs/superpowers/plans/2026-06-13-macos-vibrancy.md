# macOS 毛玻璃（Vibrancy）背景 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 macOS 上为主窗口提供原生毛玻璃背景，由设置页开关控制，切换即时生效，非 macOS 行为不变。

**Architecture:** 新增设置键 `settings.enableVibrancy`。渲染层通过 `document.body` 上的 `data-vibrancy` 属性切换透明样式，并经 IPC `set-vibrancy` 通知主进程实时调用 `win.setVibrancy()`。主进程在窗口创建时按设置带上 `vibrancy: 'under-window'` 与透明背景，避免首帧闪烁。

**Tech Stack:** Electron `BrowserWindow.vibrancy` / `setVibrancy`（macOS NSVisualEffectView）、Vue 2 Options API、Vuex 3、SCSS、vue-i18n。

**Testing note:** 本项目无测试套件（见 CLAUDE.md）。每个任务以手动验证收尾：`yarn electron:serve` 在 macOS 上运行。提交受 husky pre-commit（prettier）约束；若本机 Node 与项目要求（14/16）不兼容导致钩子失败，用 `git commit --no-verify`，但需先手动确认改动符合 prettier 风格。

**Source spec:** `docs/superpowers/specs/2026-06-13-macos-vibrancy-design.md`

---

## File Structure

- `src/utils/common.js` — 新增 `changeVibrancy(on)`，与现有 `changeAppearance()` 并列。
- `src/store/index.js` — 启动时按设置调用一次 `changeVibrancy()`。
- `src/background.js` — 窗口创建时按设置加 `vibrancy` + 透明背景。
- `src/electron/ipcMain.js` — 新增 `set-vibrancy` IPC 通道。
- `src/assets/css/global.scss` — 新增 `[data-vibrancy='on']` 透明样式区块。
- `src/views/Settings.vue` — 新增仅 macOS 显示的开关 + computed。
- `src/locale/lang/{zh-CN,zh-TW,en,tr}.js` — 新增 `settings.enableVibrancy` 文案。

---

## Task 1: i18n 文案

**Files:**
- Modify: `src/locale/lang/zh-CN.js`（在 `showLibraryDefault` 行附近）
- Modify: `src/locale/lang/zh-TW.js`
- Modify: `src/locale/lang/en.js`
- Modify: `src/locale/lang/tr.js`

- [ ] **Step 1: 在每个语言文件的 `settings` 对象内 `showLibraryDefault` 同级新增一行**

`src/locale/lang/zh-CN.js`（约 line 257，紧跟 `showLibraryDefault:` 那行后）：

```js
    enableVibrancy: '毛玻璃背景（仅 macOS）',
```

`src/locale/lang/zh-TW.js`：

```js
    enableVibrancy: '毛玻璃背景（僅 macOS）',
```

`src/locale/lang/en.js`：

```js
    enableVibrancy: 'Frosted Glass Background (macOS only)',
```

`src/locale/lang/tr.js`：

```js
    enableVibrancy: 'Buzlu Cam Arka Planı (yalnızca macOS)',
```

- [ ] **Step 2: 验证 key 已加入**

Run: `grep -rn "enableVibrancy" src/locale/lang/`
Expected: 四个文件各命中一行。

- [ ] **Step 3: Commit**

```bash
git add src/locale/lang/zh-CN.js src/locale/lang/zh-TW.js src/locale/lang/en.js src/locale/lang/tr.js
git commit -m "i18n: 新增毛玻璃背景设置文案"
```

---

## Task 2: 渲染层切换函数 `changeVibrancy`

**Files:**
- Modify: `src/utils/common.js`（在 `changeAppearance` 函数之后，约 line 125 后）

- [ ] **Step 1: 在 `changeAppearance` 函数之后新增 `changeVibrancy`**

注意：`changeAppearance` 用 `document.body.setAttribute('data-theme', ...)`，本函数沿用 `document.body`。Electron 判断用 `process.env.IS_ELECTRON`，`ipcRenderer` 用 `window.require` 现取（与 `src/utils/download.js:7` 一致）。

```js
export function changeVibrancy(on) {
  document.body.setAttribute('data-vibrancy', on ? 'on' : 'off');
  if (process.env.IS_ELECTRON === true) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('set-vibrancy', on === true);
  }
}
```

- [ ] **Step 2: 验证导出存在**

Run: `grep -n "export function changeVibrancy" src/utils/common.js`
Expected: 命中一行。

- [ ] **Step 3: Commit**

```bash
git add src/utils/common.js
git commit -m "feat(vibrancy): 新增 changeVibrancy 渲染层切换函数"
```

---

## Task 3: 启动初始化调用

**Files:**
- Modify: `src/store/index.js`（line 6 import；line 44 附近调用）

- [ ] **Step 1: 扩展 import，加入 `changeVibrancy`**

把 line 6：

```js
import { changeAppearance } from '@/utils/common';
```

改为：

```js
import { changeAppearance, changeVibrancy } from '@/utils/common';
```

- [ ] **Step 2: 在 `changeAppearance(...)` 调用之后（line 44 之后）新增初始化调用**

```js
changeAppearance(store.state.settings.appearance);
changeVibrancy(store.state.settings.enableVibrancy === true);
```

- [ ] **Step 3: 验证**

Run: `grep -n "changeVibrancy" src/store/index.js`
Expected: import 行 + 调用行，共两处命中。

- [ ] **Step 4: Commit**

```bash
git add src/store/index.js
git commit -m "feat(vibrancy): 启动时按设置初始化毛玻璃状态"
```

---

## Task 4: 主进程 IPC 通道 `set-vibrancy`

**Files:**
- Modify: `src/electron/ipcMain.js`（`isMac` 已于 line 8 导入；在 `ipcMain.on('minimize', ...)` 块附近新增，约 line 223 后）

注意：`src/electron/*` 只编译到 ES2015，禁止 ES2020 语法（如带方括号的可选链 `obj?.['key']`）。

- [ ] **Step 1: 在 `ipcMain.on('minimize', ...)` 块之后新增 `set-vibrancy` 处理**

```js
  ipcMain.on('set-vibrancy', (event, on) => {
    if (!isMac) return;
    win.setVibrancy(on === true ? 'under-window' : null);
  });
```

- [ ] **Step 2: 验证**

Run: `grep -n "set-vibrancy" src/electron/ipcMain.js`
Expected: 命中一行。

- [ ] **Step 3: Commit**

```bash
git add src/electron/ipcMain.js
git commit -m "feat(vibrancy): 新增 set-vibrancy IPC 实时切换窗口材质"
```

---

## Task 5: 主进程窗口创建带 vibrancy

**Files:**
- Modify: `src/background.js`（`options` 对象，line 179-203；`isMac` 已于顶部 import）

- [ ] **Step 1: 在 `const options = {` 之前读取设置**

在 line 179 `const options = {` 上方新增（`appearance` 已在 line 176 读取）：

```js
    const enableVibrancy = isMac && this.store.get('settings.enableVibrancy') === true;
```

- [ ] **Step 2: 修改 `backgroundColor` 字段，启用时透明**

把现有 `options` 中的 `backgroundColor` 字段（line 197-202）：

```js
      backgroundColor:
        ((appearance === undefined || appearance === 'auto') &&
          nativeTheme.shouldUseDarkColors) ||
        appearance === 'dark'
          ? '#222'
          : '#fff',
```

改为：

```js
      backgroundColor: enableVibrancy
        ? '#00000000'
        : ((appearance === undefined || appearance === 'auto') &&
            nativeTheme.shouldUseDarkColors) ||
          appearance === 'dark'
        ? '#222'
        : '#fff',
```

- [ ] **Step 3: 在 `this.window = new BrowserWindow(options);`（line 244）之前按需设置 vibrancy**

在 line 244 上方新增：

```js
    if (enableVibrancy) {
      options.vibrancy = 'under-window';
    }
```

- [ ] **Step 4: 验证**

Run: `grep -n "enableVibrancy\|vibrancy" src/background.js`
Expected: 读取行、backgroundColor 三元、`options.vibrancy` 赋值，共三处命中。

- [ ] **Step 5: Commit**

```bash
git add src/background.js
git commit -m "feat(vibrancy): 窗口创建时按设置启用 under-window 材质与透明背景"
```

---

## Task 6: 渲染层透明样式

**Files:**
- Modify: `src/assets/css/global.scss`（`body` 规则 line 70-72；滚动条 track line 117-121）

- [ ] **Step 1: 在 `body { background-color: var(--color-body-bg); }`（line 70-72）之后新增透明覆盖规则**

```scss
body {
  background-color: var(--color-body-bg);
}

body[data-vibrancy='on'] {
  background-color: transparent;
}

body[data-vibrancy='on'] ::-webkit-scrollbar-track {
  background: transparent;
}
```

说明：导航栏已用含 alpha 的 `--color-navbar-bg`，可透出模糊，无需改动。主内容区底色来自 `body`，置透明即可让 `under-window` 材质透出。

- [ ] **Step 2: 验证**

Run: `grep -n "data-vibrancy" src/assets/css/global.scss`
Expected: 两处命中。

- [ ] **Step 3: Commit**

```bash
git add src/assets/css/global.scss
git commit -m "feat(vibrancy): 开启毛玻璃时 body 与滚动条 track 透明"
```

---

## Task 7: 设置页开关

**Files:**
- Modify: `src/views/Settings.vue`（模板：`<h3>{{ $t('settings.others') }}</h3>` line 685 之前插入；computed：`showLibraryDefault` setter 之后，line 1616 附近）

`isMac` computed（line 1154）与 `ipcRenderer`（line 1102）已存在。`changeVibrancy` 尚未在本文件 import，需新增。

- [ ] **Step 1: 在 `<script>` 顶部 import 区新增 `changeVibrancy`**

找到从 `@/utils/common` 的现有 import（若无则新增一行）。检查：

Run: `grep -n "from '@/utils/common'" src/views/Settings.vue`

若已有该 import，把 `changeVibrancy` 加入解构；若没有，在 `import pkg from '../../package.json';`（line 1097）之后新增：

```js
import { changeVibrancy } from '@/utils/common';
```

- [ ] **Step 2: 在模板 `<h3>{{ $t('settings.others') }}</h3>`（line 685）之前新增开关 item**

```html
      <div v-if="isElectron && isMac" class="item">
        <div class="left">
          <div class="title">{{ $t('settings.enableVibrancy') }}</div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="enable-vibrancy"
              v-model="enableVibrancy"
              type="checkbox"
              name="enable-vibrancy"
            />
            <label for="enable-vibrancy"></label>
          </div>
        </div>
      </div>

- [ ] **Step 3: 在 `computed` 中 `showLibraryDefault` setter 之后新增 `enableVibrancy` computed**

setter 中先 commit 设置，再调 `changeVibrancy` 即时生效：

```js
    enableVibrancy: {
      get() {
        return this.settings.enableVibrancy || false;
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'enableVibrancy',
          value,
        });
        changeVibrancy(value === true);
      },
    },
```

- [ ] **Step 4: 验证（web 构建可编译，检查无语法错误）**

Run: `yarn lint`
Expected: 无新增 error（warning 可接受，以现有基线为准）。

- [ ] **Step 5: Commit**

```bash
git add src/views/Settings.vue
git commit -m "feat(vibrancy): 设置页新增毛玻璃开关（仅 macOS）"
```

---

## Task 8: 端到端手动验证

**Files:** 无（仅验证）

- [ ] **Step 1: 在 macOS 启动 Electron 开发环境**

Run: `yarn netease_api:run`（另开一个终端）然后 `yarn electron:serve`
Expected: 应用启动，设置页「其他」分组上方出现「毛玻璃背景（仅 macOS）」开关。

- [ ] **Step 2: 打开开关**
Expected: 窗口背景即时变为毛玻璃，能透出桌面 / 壁纸；无需重启。

- [ ] **Step 3: 切换系统深 / 浅外观（系统设置 → 外观）**
Expected: 模糊底色随系统自适应，文字清晰可读。

- [ ] **Step 4: 关闭开关**
Expected: 即时恢复原不透明背景。

- [ ] **Step 5: 开关置为开，重启应用**
Expected: 设置被记住，启动即为毛玻璃，无先不透明后透明的首帧闪烁。

- [ ] **Step 6: （若可测）在非 macOS 平台启动**
Expected: 设置页无该开关，外观与行为与改动前一致。

---

## Self-Review

**Spec coverage:**
- 设置项 `enableVibrancy` 默认 false → Task 1（文案）+ Task 7（开关/computed，get 回退 false）。✓
- 设置页开关仅 macOS → Task 7 `v-if="isElectron && isMac"`。✓
- 即时切换（IPC + CSS）→ Task 2（changeVibrancy）+ Task 4（set-vibrancy IPC）+ Task 6（CSS）。✓
- 主进程窗口创建带 vibrancy + 透明背景防闪烁 → Task 5。✓
- 启动初始化 → Task 3。✓
- 非 macOS 行为不变 → Task 4（`if (!isMac) return`）+ Task 5（`isMac &&`）+ Task 7（`isMac` v-if）。✓
- 深浅自适应靠 `under-window` 系统材质 → Task 5，CSS 不写深色模糊色值（Task 6）。✓
- 验证方式 → Task 8 覆盖 spec 全部 6 条验证项。✓

**Placeholder scan:** 无 TBD/TODO；每个代码步骤含完整代码。Task 7 Step 1 含条件分支（import 已存在则解构合并），已给出明确判断命令与两种处理。✓

**Type/命名一致性:** `changeVibrancy` 在 Task 2 定义，Task 3/Task 7 调用，签名一致 `(on)` / `(value === true)`。IPC 通道名 `set-vibrancy` 在 Task 2（send）与 Task 4（on）一致。设置键 `enableVibrancy` 全程一致。`data-vibrancy` 属性值 `'on'/'off'` 在 Task 2 写、Task 6 选择器读，一致。✓

**ES2015 约束:** Task 4/Task 5 主进程代码未用可选链或 ES2020 语法。✓


