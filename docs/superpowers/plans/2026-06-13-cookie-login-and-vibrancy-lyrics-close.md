# Cookie 登录 + 毛玻璃歌词页关闭重影修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复毛玻璃模式下关闭歌词页出现的主界面透出重影，并为账号登录页新增「粘贴 MUSIC_U Cookie 登录」。

**Architecture:** 两个独立改动。(1) `App.vue` 增加 `lyricsClosing` 标志，毛玻璃下延迟主界面元素重新出现，直到歌词页 0.4s 下滑动画结束。(2) `loginAccount.vue` 新增 `cookie` 模式，智能解析粘贴内容中的 `MUSIC_U`，复用现有 `setCookies()` 写入并用 `userAccount()` 校验，失败则回滚。无 API/后端改动。

**Tech Stack:** Vue 2 (Options API) + Vuex 3 + Electron，vue-i18n，无单元测试套件。

---

## 重要约定

- **本项目没有测试套件**（见 `CLAUDE.md`）。每个任务用 `yarn lint` 做静态校验，功能用运行 app 手动验证。
- **提交环境**：husky pre-commit 在 node 16 下跑 `npm run prettier`。当前 shell 若为 node 24，会触发 engine 报错。
  提交前先确认 node 版本；若无法切到 16，使用 `git commit --no-verify` 并**先手动执行 `yarn prettier`** 保证格式。
- 提交信息使用简体中文，结尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 注释/文案与周边代码一致，使用中文。

## 文件结构

| 文件 | 责任 | 改动类型 |
|------|------|---------|
| `src/App.vue` | 顶层布局；歌词页与主界面元素的显隐编排 | 修改（模板 + script） |
| `src/views/loginAccount.vue` | 账号登录页，多登录模式切换 | 修改（模板 + script + style） |
| `src/locale/lang/en.js` | 英文文案 | 修改（新增 3 个 key） |
| `src/locale/lang/zh-CN.js` | 简体中文文案 | 修改（新增 3 个 key） |
| `src/locale/lang/zh-TW.js` | 繁体中文文案 | 修改（新增 3 个 key） |
| `src/locale/lang/tr.js` | 土耳其文文案 | 修改（新增 3 个 key） |

---

## Task 1：修复毛玻璃下歌词页关闭重影（App.vue）

**Files:**
- Modify: `src/App.vue`（模板 `template`，及 `data` / `watch` / 新方法）

- [ ] **Step 1：在 `data()` 中新增 `lyricsClosing` 标志**

打开 `src/App.vue`，找到 `data()`（约 61-66 行）：

```js
  data() {
    return {
      isElectron: process.env.IS_ELECTRON, // true || undefined
      userSelectNone: false,
    };
  },
```

改为：

```js
  data() {
    return {
      isElectron: process.env.IS_ELECTRON, // true || undefined
      userSelectNone: false,
      // 毛玻璃下歌词页透明，关闭时需等下滑动画结束再显示主界面，避免重影
      lyricsClosing: false,
    };
  },
```

- [ ] **Step 2：新增对 `showLyrics` 的 watcher**

在 `export default { ... }` 内、`computed` 之后、`created()` 之前，新增 `watch`：

```js
  watch: {
    showLyrics(val) {
      // 仅毛玻璃模式：歌词页关闭瞬间不立即显示主界面，
      // 等下滑动画结束（@after-leave）再显示，避免透明歌词页透出主界面内容。
      if (!val && document.body.getAttribute('data-vibrancy') === 'on') {
        this.lyricsClosing = true;
      }
    },
  },
```

（注意：`computed` 块以 `}` 结束后是逗号，再加 `watch`。保持 Options API 选项顺序与现有风格一致。）

- [ ] **Step 3：模板中给主界面元素的 v-show 追加 `&& !lyricsClosing`，并给 Lyrics 的 transition 加 @after-leave**

将模板（1-32 行）改为：

```html
<template>
  <div id="app" :class="{ 'user-select-none': userSelectNone }">
    <Scrollbar v-show="!showLyrics && !lyricsClosing" ref="scrollbar" />
    <Navbar v-show="showNavbar && !showLyrics && !lyricsClosing" ref="navbar" />
    <main
      ref="main"
      v-show="!showLyrics && !lyricsClosing"
      :style="{ overflow: enableScrolling ? 'auto' : 'hidden' }"
      @scroll="handleScroll"
    >
      <keep-alive>
        <router-view v-if="$route.meta.keepAlive"></router-view>
      </keep-alive>
      <router-view v-if="!$route.meta.keepAlive"></router-view>
    </main>
    <transition name="slide-up">
      <Player
        v-if="enablePlayer"
        v-show="showPlayer && !showLyrics && !lyricsClosing"
        ref="player"
      />
    </transition>
    <Toast />
    <ModalAddTrackToPlaylist v-if="isAccountLoggedIn" />
    <ModalNewPlaylist v-if="isAccountLoggedIn" />
    <ModalDownloadConfirm v-if="isElectron" />
    <ModalHiddenCards />
    <transition v-if="enablePlayer" name="slide-up" @after-leave="lyricsClosing = false">
      <Lyrics v-show="showLyrics" />
    </transition>
  </div>
</template>
```

唯一改动点：`Scrollbar` / `Navbar` / `main` / `Player` 的 `v-show` 各追加 `&& !lyricsClosing`，以及最后一个 `<transition>` 增加 `@after-leave="lyricsClosing = false"`。其余保持原样。

- [ ] **Step 4：lint 校验**

Run: `yarn lint`
Expected: 通过，无新增 error/warning（若 node 版本导致 lint 无法运行，见「重要约定」）。

- [ ] **Step 5：提交**

```bash
yarn prettier   # 确保格式（若 husky 因 node 版本失效）
git add src/App.vue
git commit -m "fix(vibrancy): 关闭歌词页时延迟主界面出现，消除毛玻璃下重影

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

（如 husky 报 node engine 错误：`git commit --no-verify ...`，但务必已先跑 `yarn prettier`。）

---

## Task 2：新增 4 个语言的 Cookie 登录文案（i18n）

**Files:**
- Modify: `src/locale/lang/en.js`
- Modify: `src/locale/lang/zh-CN.js`
- Modify: `src/locale/lang/zh-TW.js`
- Modify: `src/locale/lang/tr.js`

- [ ] **Step 1：en.js**

在 `src/locale/lang/en.js` 第 100 行 `loginWithPhone: 'Login with Phone',` 之后新增：

```js
    loginWithCookie: 'Login with Cookie',
    cookiePlaceholder: 'Paste your MUSIC_U cookie',
    cookieNotice: `Open music.163.com in a browser, log in, then copy the MUSIC_U cookie from DevTools (Application → Cookies). You can paste the full cookie string or just the MUSIC_U value.`,
```

- [ ] **Step 2：zh-CN.js**

在 `src/locale/lang/zh-CN.js` 第 97 行 `loginWithPhone: '手机号登录',` 之后新增：

```js
    loginWithCookie: 'Cookie 登录',
    cookiePlaceholder: '粘贴你的 MUSIC_U Cookie',
    cookieNotice: `在浏览器打开 music.163.com 并登录后，从开发者工具（应用 → Cookie）复制 MUSIC_U 的值。整段 Cookie 字符串或仅 MUSIC_U 值都可以粘贴。`,
```

- [ ] **Step 3：zh-TW.js**

在 `src/locale/lang/zh-TW.js` 第 93 行 `loginWithPhone: '手機號碼登入',` 之后新增：

```js
    loginWithCookie: 'Cookie 登入',
    cookiePlaceholder: '貼上你的 MUSIC_U Cookie',
    cookieNotice: `在瀏覽器開啟 music.163.com 並登入後，從開發者工具（應用程式 → Cookie）複製 MUSIC_U 的值。整段 Cookie 字串或僅 MUSIC_U 值都可以貼上。`,
```

- [ ] **Step 4：tr.js**

在 `src/locale/lang/tr.js` 第 96 行 `loginWithPhone: 'Phone ile giriş yap',` 之后新增：

```js
    loginWithCookie: 'Cookie ile giriş yap',
    cookiePlaceholder: 'MUSIC_U cookie değerini yapıştırın',
    cookieNotice: `Tarayıcıda music.163.com adresini açıp giriş yaptıktan sonra geliştirici araçlarından (Application → Cookies) MUSIC_U değerini kopyalayın. Tüm cookie dizesini veya yalnızca MUSIC_U değerini yapıştırabilirsiniz.`,
```

- [ ] **Step 5：lint + 提交**

Run: `yarn lint`
Expected: 通过。

```bash
yarn prettier
git add src/locale/lang/en.js src/locale/lang/zh-CN.js src/locale/lang/zh-TW.js src/locale/lang/tr.js
git commit -m "feat(login): 新增 Cookie 登录的多语言文案

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3：loginAccount.vue 实现 Cookie 登录模式

**Files:**
- Modify: `src/views/loginAccount.vue`（模板 + script + style）

- [ ] **Step 1：导入 userAccount 与 removeCookie**

将顶部 import（118-126 行）：

```js
import { mapMutations } from 'vuex';
import { setCookies } from '@/utils/auth';
import nativeAlert from '@/utils/nativeAlert';
import {
  loginWithPhone,
  loginWithEmail,
  loginQrCodeKey,
  loginQrCodeCheck,
} from '@/api/auth';
```

改为：

```js
import { mapMutations } from 'vuex';
import { setCookies, removeCookie } from '@/utils/auth';
import nativeAlert from '@/utils/nativeAlert';
import { userAccount } from '@/api/user';
import {
  loginWithPhone,
  loginWithEmail,
  loginQrCodeKey,
  loginQrCodeCheck,
} from '@/api/auth';
```

- [ ] **Step 2：data 增加 cookieInput 字段**

在 `data()`（130-144 行）的 `inputFocus: '',` 之后新增一行：

```js
      cookieInput: '',
```

- [ ] **Step 3：created() 路由 query 白名单加入 'cookie'**

将（152-154 行）：

```js
    if (['phone', 'email', 'qrCode'].includes(this.$route.query.mode)) {
      this.mode = this.$route.query.mode;
    }
```

改为：

```js
    if (
      ['phone', 'email', 'qrCode', 'cookie'].includes(this.$route.query.mode)
    ) {
      this.mode = this.$route.query.mode;
    }
```

- [ ] **Step 4：login() 增加 cookie 分支**

将 `login()`（187-216 行）整体替换为下面版本（仅在最前面增加 cookie 分支，phone/email 逻辑原样保留）：

```js
    login() {
      if (this.mode === 'cookie') {
        return this.loginWithCookie();
      }
      if (this.mode === 'phone') {
        this.processing = this.validatePhone();
        if (!this.processing) return;
        loginWithPhone({
          countrycode: this.countryCode.replace('+', '').replace(/\s/g, ''),
          phone: this.phoneNumber.replace(/\s/g, ''),
          password: 'fakePassword',
          md5_password: md5(this.password).toString(),
        })
          .then(this.handleLoginResponse)
          .catch(error => {
            this.processing = false;
            nativeAlert(`发生错误，请检查你的账号密码是否正确\n${error}`);
          });
      } else {
        this.processing = this.validateEmail();
        if (!this.processing) return;
        loginWithEmail({
          email: this.email.replace(/\s/g, ''),
          password: 'fakePassword',
          md5_password: md5(this.password).toString(),
        })
          .then(this.handleLoginResponse)
          .catch(error => {
            this.processing = false;
            nativeAlert(`发生错误，请检查你的账号密码是否正确\n${error}`);
          });
      }
    },
```

- [ ] **Step 5：新增 loginWithCookie() 方法**

在 `handleLoginResponse(data) { ... }` 方法之后（234 行后）新增一个方法：

```js
    loginWithCookie() {
      // 从粘贴内容中解析 MUSIC_U（及可选的 __csrf）。
      // 支持粘贴整段 cookie 字符串，或仅粘贴 MUSIC_U 的值。
      const raw = this.cookieInput.trim();
      const musicU = (raw.match(/MUSIC_U=([^;,\s]+)/) || [, raw])[1];
      const csrf = (raw.match(/__csrf=([^;,\s]+)/) || [])[1];
      if (!musicU) {
        nativeAlert('请粘贴有效的 MUSIC_U Cookie');
        return;
      }
      this.processing = true;
      setCookies(`MUSIC_U=${musicU}`);
      if (csrf) setCookies(`__csrf=${csrf}`);
      this.updateData({ key: 'loginMode', value: 'account' });
      userAccount()
        .then(result => {
          if (result.code === 200 && result.profile && result.profile.userId) {
            this.updateData({ key: 'user', value: result.profile });
            this.$store.dispatch('fetchLikedPlaylist').then(() => {
              this.$router.push({ path: '/library' });
            });
          } else {
            this.rollbackCookieLogin();
            nativeAlert('Cookie 无效或已过期，请重新获取');
          }
        })
        .catch(error => {
          this.rollbackCookieLogin();
          nativeAlert(`登录失败，请检查 Cookie 是否正确\n${error}`);
        });
    },
    rollbackCookieLogin() {
      removeCookie('MUSIC_U');
      removeCookie('__csrf');
      this.updateData({ key: 'loginMode', value: null });
      this.updateData({ key: 'user', value: {} });
      this.processing = false;
    },
```

- [ ] **Step 6：模板新增 cookie 输入框，并修正密码框显隐条件**

(a) 在二维码块 `<div v-show="mode == 'qrCode'">...</div>`（73-80 行）之前，新增 cookie 输入块。即在第 72 行（密码框 `</div>` 之后、`<div v-show="mode == 'qrCode'">` 之前）插入：

```html
        <div v-show="mode === 'cookie'" class="input-box cookie-box">
          <div class="container" :class="{ active: inputFocus === 'cookie' }">
            <svg-icon icon-class="lock" />
            <div class="inputs">
              <textarea
                id="cookie"
                v-model="cookieInput"
                rows="3"
                :placeholder="
                  inputFocus === 'cookie' ? '' : $t('login.cookiePlaceholder')
                "
                @focus="inputFocus = 'cookie'"
                @blur="inputFocus = ''"
              ></textarea>
            </div>
          </div>
        </div>
```

(b) 密码框现为 `<div v-show="mode !== 'qrCode'" class="input-box">`（54 行）。cookie 模式不需要密码框，将该行改为：

```html
        <div v-show="['phone', 'email'].includes(mode)" class="input-box">
```

(c) 在 `.other-login`（92-104 行）的二维码链接之后、`</div>` 之前，新增 Cookie 登录链接：

```html
        <span v-show="mode !== 'cookie'">|</span>
        <a v-show="mode !== 'cookie'" @click="changeMode('cookie')">{{
          $t('login.loginWithCookie')
        }}</a>
```

(d) 在 `notice`（105-109 行）之后，新增 cookie 模式说明：

```html
      <div v-show="mode === 'cookie'" class="notice">
        {{ $t('login.cookieNotice') }}
      </div>
```

- [ ] **Step 7：样式——让 textarea 与现有输入框一致**

在 `<style lang="scss" scoped>` 的 `.input-box` 规则块内（约 341-400 行的 `.input-box { ... }`），与现有 `input { ... }` 选择器并列，补充 textarea 样式。具体：找到 `.input-box` 内的 `input { ... }` 段（371-379 行），将选择器从 `input` 扩展为 `input,\n  textarea`，即：

```scss
  input,
  textarea {
    font-size: 20px;
    border: none;
    background: transparent;
    width: 100%;
    font-weight: 600;
    margin-top: -1px;
    color: var(--color-text);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--color-text);
    opacity: 0.38;
  }
```

（即把原 `input::placeholder` 也扩展为 `input::placeholder, textarea::placeholder`。）

然后在 `.input-box { ... }` 规则块**之后**新增 cookie 专属布局（textarea 需要更高、不可横向拉伸、字号小一点便于阅读长串）：

```scss
.cookie-box {
  .container {
    height: auto;
    padding: 8px 0;
    align-items: flex-start;
  }
  .svg-icon {
    margin-top: 10px;
  }
  textarea {
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    font-family: inherit;
    word-break: break-all;
  }
}
```

- [ ] **Step 8：lint 校验**

Run: `yarn lint`
Expected: 通过，无新增 error。

- [ ] **Step 9：提交**

```bash
yarn prettier
git add src/views/loginAccount.vue
git commit -m "feat(login): 新增 Cookie 登录模式（粘贴 MUSIC_U 智能解析）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4：运行验证

**Files:** 无（手动验证）

- [ ] **Step 1：启动后端 API 与 Electron**

```bash
yarn netease_api:run   # 终端 A，:3000 / 内置 :10754
yarn electron:serve    # 终端 B
```

- [ ] **Step 2：验证 Bug 修复（毛玻璃歌词页关闭）**

- 设置中开启毛玻璃；播放一首歌，打开歌词页，再关闭。
- Expected：歌词页在纯玻璃背景上向下滑出，滑完后主界面才出现，**无主界面内容透过歌词页的重影**。
- 关闭毛玻璃后，再次开/关歌词页。
- Expected：下滑动画与原先一致，行为无回归。

- [ ] **Step 3：验证 Cookie 登录**

- 进入账号登录页（`/login/account`），点击「Cookie 登录」切到 cookie 模式。
- 在浏览器登录 music.163.com，复制 MUSIC_U。粘贴**整段 cookie 字符串**，点登录。
- Expected：成功进入 `/library`，导航栏显示已登录用户。
- 退出后再试：仅粘贴 **MUSIC_U 的值**（不含 `MUSIC_U=`）。
- Expected：同样登录成功。
- 退出后再试：粘贴一段**无效/乱填**的值。
- Expected：弹出「Cookie 无效或已过期，请重新获取」，且未进入登录态（仍在登录页，刷新后不是登录状态）。

- [ ] **Step 4：（可选）Web 模式快速回归**

```bash
yarn serve
```
Expected：登录页 Cookie 模式 UI 正常显示、可切换（web 下 cookie 通过 request.js 的 query 注入，行为一致）。

---

## 自检记录（Self-Review）

- **Spec 覆盖**：Item 1（Task 1）；Item 2 UI/解析/流程/i18n（Task 2、3）；验证（Task 4）。无遗漏。
- **占位符**：无 TBD/TODO；所有代码步骤含完整代码。
- **类型/命名一致**：`lyricsClosing`、`cookieInput`、`loginWithCookie`、`rollbackCookieLogin`、
  i18n key `loginWithCookie`/`cookiePlaceholder`/`cookieNotice` 在各 Task 间命名一致。
- **无测试套件**：已用 `yarn lint` + 手动运行替代单元测试，符合 `CLAUDE.md`。
