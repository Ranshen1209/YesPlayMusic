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
    /<BackgroundRender[\s\S]*:album="bgImageUrl"/,
  ],
  ['lyrics close transition', 'src/App.vue', /finishLyricsClosing/],
  [
    'vibrancy lyrics integration',
    'src/assets/css/global.scss',
    /body\[data-vibrancy='on'\][\s\S]*\.lyrics-page \.amll-background/,
  ],
  [
    'macOS native vibrancy',
    'src/background.js',
    /options\.vibrancy = 'under-window'/,
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
