import { clearDB } from '@/utils/db';

const PRESERVED_LOCAL_STORAGE_KEYS = [
  'settings',
  'data',
  'appVersion',
  'lastfm',
  'player',
];

export async function clearAppCaches() {
  await clearDB();
  const removed = [];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (PRESERVED_LOCAL_STORAGE_KEYS.includes(key)) continue;
    localStorage.removeItem(key);
    removed.push(key);
  }
  return { ok: true, removedKeys: removed };
}
