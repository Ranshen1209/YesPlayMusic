const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const checks = [
  [
    'AMLL lyrics renderer',
    'src/views/lyrics.vue',
    /<LyricPlayer[\s\S]*:lyric-lines="amllLyricLines"/,
  ],
  [
    'AMLL dynamic background',
    'src/views/lyrics.vue',
    /<BackgroundRender[\s\S]*:key="bgImageUrl"[\s\S]*:album="bgImageUrl"[\s\S]*:playing="!showLyrics"/,
  ],
  ['lyrics close transition', 'src/App.vue', /v-show="!showLyrics"/],
  [
    'vibrancy lyrics integration',
    'src/assets/css/global.scss',
    /\.lyrics-page/,
  ],
  [
    'macOS native vibrancy',
    'src/background.js',
    /options\.vibrancy = 'under-window'/,
  ],
  [
    'Windows native acrylic material',
    'src/electron/windowsVibrancy.js',
    /setBackgroundMaterial\(enabled \? 'acrylic' : 'none'\)/,
  ],
  [
    'Windows accessibility fallback',
    'src/electron/windowsVibrancy.js',
    /!nativeTheme\.shouldUseHighContrastColors[\s\S]*!nativeTheme\.prefersReducedTransparency/,
  ],
  [
    'Windows native material initialization',
    'src/background.js',
    /initWindowsVibrancy\(this\.window, this\.store\)/,
  ],
  [
    'renderer uses applied native material state',
    'src/store/index.js',
    /let vibrancyEnabled = false[\s\S]*'vibrancy-changed'[\s\S]*sendSync\('getVibrancyStatus'\)/,
  ],
  [
    'Windows glass respects the custom title bar',
    'src/assets/css/global.scss',
    /\[data-vibrancy='on'\]\[data-electron-os='win32'\] main\s*\{\s*top: 84px/,
  ],
  [
    'native material setting checks platform support',
    'src/views/settings.vue',
    /isElectron && \(isMac \|\| isWindows\)[\s\S]*:disabled="!vibrancySupported"/,
  ],
  [
    'isolated OAuth window callback after Electron upgrade',
    'src/background.js',
    /setWindowOpenHandler[\s\S]*nodeIntegration: false[\s\S]*did-create-window[\s\S]*will-redirect/,
  ],
  [
    'same-origin desktop assets for modern Chromium',
    'vue.config.js',
    /customFileProtocol: '\/'/,
  ],
  [
    'Cookie login',
    'src/views/loginAccount.vue',
    /loginWithCookie\(\)[\s\S]*MUSIC_U=/,
  ],
  ['download metadata', 'src/electron/metadata.js', /writeTags/],
  [
    'LRC sidecar download',
    'src/electron/download.js',
    /meta\.saveLrcFile[\s\S]*\.lrc/,
  ],
  ['home section settings', 'src/views/settings.vue', /showFollowedArtists/],
  ['hidden home cards', 'src/components/CoverRow.vue', /hideCard/],
  ['volume percentage', 'src/components/Player.vue', /volumePercent/],
  [
    'Vue 3 player state synchronization',
    'src/store/index.js',
    /markRaw\([\s\S]*store\.commit\('syncPlayerState'\)/,
  ],
  [
    'player UI state snapshot',
    'src/store/state.js',
    /playerState:[\s\S]*currentTrack:[\s\S]*progress:[\s\S]*volume:/,
  ],
  [
    'player slider updates',
    'src/components/Player.vue',
    /@update:model-value="updateProgress"[\s\S]*@update:model-value="updateVolume"/,
  ],
  ['lyrics font settings', 'src/views/settings.vue', /lyricFontWeight/],
  [
    'reactive liked-track controls',
    'src/views/lyrics.vue',
    /isCurrentTrackLiked\(\)[\s\S]*liked\.songs\.includes/,
  ],
  [
    'lyrics scroll resynchronization',
    'src/views/lyrics.vue',
    /scheduleLyricResync[\s\S]*setCurrentTime\(this\.currentTime, true\)/,
  ],
  [
    'normal playback leaves Personal FM mode',
    'src/utils/Player.js',
    /playTrackOnListByID\([\s\S]*this\._isPersonalFM = false/,
  ],
  [
    'compact For You cards',
    'src/views/home.vue',
    /height: clamp\(190px, 25vh, 280px\)/,
  ],
  [
    'centered daily recommendation cover',
    'src/components/DailyTracksCard.vue',
    /height: 100%[\s\S]*object-position: center/,
  ],
  [
    'shared top-level glass menus',
    'src/components/ContextMenu.vue',
    /<Teleport to="body">[\s\S]*background: var\(--color-context-menu-bg\)[\s\S]*backdrop-filter: saturate\(190%\) blur\(32px\)/,
  ],
  [
    'glass menus respect transparency and contrast preferences',
    'src/components/ContextMenu.vue',
    /prefers-reduced-transparency: reduce[\s\S]*forced-colors: active[\s\S]*backdrop-filter: none/,
  ],
  [
    'fork owns the release repository',
    'src/config/repository.js',
    /owner: 'Ranshen1209',[\s\S]*repo: 'YesPlayMusic'/,
  ],
  [
    'explicit fork update feed and release page',
    'src/background.js',
    /setFeedURL\(repository\)[\s\S]*openExternal\(releasesUrl\)/,
  ],
  [
    'packaging uses the same release repository',
    'vue.config.js',
    /publish: \[[\s\S]*\.\.\.repository/,
  ],
  [
    'upstream cloud lyrics use the AMLL renderer',
    'src/views/lyrics.vue',
    /getCloudLyric\(trackId, userId\)[\s\S]*parseLyric\(data\.lrc\)/,
  ],
  [
    'closing lyrics exits fullscreen',
    'src/views/lyrics.vue',
    /showLyrics\(show\)[\s\S]*this\.exitFullscreen\(\)/,
  ],
  [
    'macOS release uses a supported Intel runner for both package architectures',
    '.github/workflows/build.yaml',
    /os: \[macos-15-intel, windows-latest, ubuntu-22\.04\]/,
  ],
  [
    'unsigned macOS release with single CI publisher',
    '.github/workflows/build.yaml',
    /CSC_IDENTITY_AUTO_DISCOVERY: false[\s\S]*run: bash scripts\/build-release\.sh[\s\S]*publish-release:/,
  ],
  [
    'matrix platforms build independently',
    '.github/workflows/build.yaml',
    /strategy:\s*fail-fast: false/,
  ],
  [
    'release build helper uses the non-publishing package script',
    'scripts/build-release.sh',
    /yarn electron:build/,
  ],
  [
    'package builds explicitly disable publishing',
    'package.json',
    /"electron:build": "vue-cli-service electron:build -p never"/,
  ],
  [
    'release asset names match update manifests',
    '.github/workflows/build.yaml',
    /Normalize Windows release filenames[\s\S]*normalized="\$\{file\/\/ \/-\}"[\s\S]*Update manifest references missing asset/,
  ],
  [
    'stable duplicate lyric timestamps',
    'src/utils/lyrics.js',
    /midTime <= time[\s\S]*return low/,
  ],
  [
    'zero timestamp lyric duration handling',
    'src/views/lyrics.vue',
    /Math\.round\(nextTime \?\? duration\)/,
  ],
  [
    'serializable Electron download payload',
    'src/utils/download.js',
    /createDownloadPayload[\s\S]*JSON\.parse\(JSON\.stringify\(payload\)\)/,
  ],
];

const forbiddenChecks = [
  ['legacy lyrics theme UI', 'src/views/settings.vue', /lyricsTheme/],
  [
    'legacy lyrics theme defaults',
    'src/store/initLocalStorage.js',
    /lyricsTheme/,
  ],
  ...['en', 'tr', 'zh-CN', 'zh-TW'].map(lang => [
    `legacy lyrics theme translation (${lang})`,
    `src/locale/lang/${lang}.js`,
    /lyricsTheme/,
  ]),
  [
    'hidden AMLL background in vibrancy mode',
    'src/assets/css/global.scss',
    /body\[data-vibrancy='on'\][\s\S]*\.amll-background[\s\S]*display:\s*none/,
  ],
];

const failures = [];
for (const [name, file, pattern] of checks) {
  const absolutePath = path.join(root, file);
  const source = fs.existsSync(absolutePath)
    ? fs.readFileSync(absolutePath, 'utf8')
    : '';
  if (!pattern.test(source)) failures.push(`${name}: ${file}`);
}

for (const [name, file, pattern] of forbiddenChecks) {
  const absolutePath = path.join(root, file);
  const source = fs.existsSync(absolutePath)
    ? fs.readFileSync(absolutePath, 'utf8')
    : '';
  if (pattern.test(source)) failures.push(`${name}: ${file}`);
}

const pkg = require(path.join(root, 'package.json'));
for (const dependency of [
  '@applemusic-like-lyrics/core',
  '@applemusic-like-lyrics/vue',
]) {
  if (!pkg.dependencies[dependency]) {
    failures.push(`missing dependency: ${dependency}`);
  }
}

if (failures.length > 0) {
  console.error('Required customizations are missing:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Verified ${checks.length} required customizations.`);
