# 设计文档：Cookie 登录 + 毛玻璃下歌词页关闭重影修复

日期：2026-06-13
分支：feat/macos-vibrancy

## 背景

两个独立的工作项：

1. **Bug 修复**：开启 macOS 毛玻璃（vibrancy）后，关闭歌词页时，歌词页会以透明状态下滑，
   期间把已经瞬间出现的主界面内容透出来，形成"双重曝光"的难看观感。
2. **新功能**：增加 Cookie 登录，让用户直接粘贴网易云 `MUSIC_U` Cookie 登录，
   用于二维码/手机/邮箱登录失效的场景（参考 VutronMusic#222）。

> 注：按 `CLAUDE.md`，本仓库是 v1.x 维护分支，通常只接受关键 bug 修复。Cookie 登录属于新功能，
> 但这是用户的 fork，由用户决定接受。

---

## Item 1 — 毛玻璃下歌词页关闭重影修复

### 根因

- `src/App.vue`：`Scrollbar` / `Navbar` / `main` / `Player` 都用 `v-show="...!showLyrics"`，
  当 `showLyrics` 变为 `false` 时它们**瞬间**重新显示。
- 歌词页 `<Lyrics>` 被 `<transition name="slide-up">` 包裹，关闭时会下滑 0.4s（`App.vue` 的
  `.slide-up-leave-active { transition: transform 0.4s }`）。
- 毛玻璃模式下 `src/assets/css/global.scss` 把 `.lyrics-page` 设为 `background: transparent`。
- 于是这 0.4s 内：主界面已经出现，而透明的歌词页仍在其上方下滑 → 主界面内容透过歌词页显示出来。
- 非毛玻璃模式下歌词页是不透明的（`var(--color-body-bg)`），下滑过程正常，所以该 bug 仅在毛玻璃下出现。

### 方案（仅作用于毛玻璃模式，保留下滑动画）

在 `src/App.vue` 中：

1. 新增 data 字段 `lyricsClosing: false`。
2. 新增对 `showLyrics` 的 watcher：当其变为 `false` **且**
   `document.body.getAttribute('data-vibrancy') === 'on'` 时，将 `lyricsClosing = true`。
   （在 watcher 中与 `showLyrics` 同一次渲染刷新内置位，避免闪烁。）
3. 给包裹 `<Lyrics>` 的 `<transition>` 加上 `@after-leave="lyricsClosing = false"`，
   在 0.4s 下滑动画结束后复位。
4. 将主界面元素的 `v-show` 追加 `&& !lyricsClosing`：
   - `Scrollbar`：`v-show="!showLyrics && !lyricsClosing"`
   - `Navbar`：`v-show="showNavbar && !showLyrics && !lyricsClosing"`
   - `main`：`v-show="!showLyrics && !lyricsClosing"`
   - `Player`：`v-show="showPlayer && !showLyrics && !lyricsClosing"`

### 效果

- 毛玻璃模式：歌词页在纯玻璃背景上下滑消失，滑完后主界面才出现，无重影。
- 非毛玻璃模式：`data-vibrancy !== 'on'`，`lyricsClosing` 永不置 true，行为完全不变。

### 受影响文件

- `src/App.vue`（模板 + script，无新增依赖）

---

## Item 2 — Cookie 登录

在现有 `src/views/loginAccount.vue` 的 phone/email/qrCode 切换中，新增一个 `cookie` 模式。
**不改动任何 API / 后端**，复用现有 `setCookies()` 与 `userAccount()`。

### UI

- 当 `mode === 'cookie'` 时，显示一个 `<textarea>`（Cookie 较长，用多行输入），
  复用 `.input-box .container` 的样式容器，`v-model="cookieInput"`。
- 手机号/邮箱/密码输入框在 cookie 模式下隐藏（它们已分别按 mode 控制；
  密码框条件由 `v-show="mode !== 'qrCode'"` 改为 `v-show="['phone','email'].includes(mode)"`）。
- 在 `.other-login` 增加一个链接 `Cookie 登录`（`@click="changeMode('cookie')"`）。
- 确认按钮区 `v-show="mode !== 'qrCode'"` 已覆盖 cookie 模式，无需改。
- cookie 模式下显示一条简短说明（如何获取 Cookie），通过新 i18n key 提供。

### 智能解析

```
parseMusicU(input):
  s = input.trim()
  m = s.match(/MUSIC_U=([^;,\s]+)/)
  musicU = m ? m[1] : s
  csrf  = (s.match(/__csrf=([^;,\s]+)/) || [])[1]
  return { musicU, csrf }
```

即：粘贴整段 Cookie 字符串或仅 `MUSIC_U` 值都能识别。

### 登录流程（`login()` 中的 cookie 分支）

1. 解析得到 `musicU`；为空 → `nativeAlert`，`processing = false`，return。
2. `setCookies('MUSIC_U=' + musicU)`；若解析出 `csrf` 再 `setCookies('__csrf=' + csrf)`。
3. `this.updateData({ key: 'loginMode', value: 'account' })`。
4. 调用 `userAccount()` 校验：
   - `result.code === 200 && result.profile && result.profile.userId` →
     `updateData({ key: 'user', value: result.profile })`，
     `dispatch('fetchLikedPlaylist')` 后 `router.push('/library')`。
   - 否则视为无效/过期：`removeCookie('MUSIC_U')`（及 `__csrf`）、
     `updateData({ key: 'loginMode', value: null })`、
     `nativeAlert('Cookie 无效或已过期，请重新获取')`、`processing = false`。
5. `.catch` 同样回滚并提示。

### changeMode / created

- `created()` 路由 query 白名单加入 `'cookie'`：
  `['phone', 'email', 'qrCode', 'cookie'].includes(...)`。
- `changeMode('cookie')` 走现有 else 分支（清除二维码轮询）即可。

### i18n

为 `en` / `zh-CN` / `zh-TW` / `tr` 四个语言的 `login` 节点新增：

- `loginWithCookie`：链接文案（如 "Cookie 登录" / "Login with Cookie"）
- `cookiePlaceholder`：textarea 占位文案（如 "粘贴 MUSIC_U Cookie"）
- `cookieNotice`：简短获取说明

（现有硬编码的 `二维码登录` 文案属历史遗留，本次不动。）

### 受影响文件

- `src/views/loginAccount.vue`（模板 + script + 少量 style）
- `src/locale/lang/{en,zh-CN,zh-TW,tr}.js`
- 需从 `@/api/user` 引入 `userAccount`，从 `@/utils/auth` 引入 `removeCookie`。

---

## 验证方式

无测试套件。按 `CLAUDE.md` 通过运行 app 验证：

1. **Bug**：`yarn electron:serve`（需先 `yarn netease_api:run`），开启毛玻璃，打开歌词页再关闭，
   确认无主界面透出的重影；关闭毛玻璃后再次开关歌词页，确认下滑动画行为不变。
2. **Cookie 登录**：进入账号登录页切到 Cookie 模式，粘贴有效 `MUSIC_U`（整段或纯值）能登录到 `/library`；
   粘贴无效值能得到 "Cookie 无效或已过期" 提示且不会进入登录态。

## 不做的范围（YAGNI）

- 不重构现有二维码硬编码文案。
- 不改 `request.js` / 后端 / `src/api/auth.js`。
- 不增加 Cookie 自动刷新或导出功能。
