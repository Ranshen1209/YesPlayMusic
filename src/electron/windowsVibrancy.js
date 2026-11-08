import os from 'os';
import { nativeTheme, systemPreferences } from 'electron';
import { isWindows } from '@/utils/platform';

// Electron 的系统背景材质只支持 Windows 11 22H2（build 22621）及以上。
// 不使用 transparent 窗口或未公开的 AccentPolicy，保留系统缩放、拖动和贴靠。
export function supportsWindowsVibrancy(win) {
  if (!isWindows || typeof win.setBackgroundMaterial !== 'function') {
    return false;
  }
  const [major, , build] = os.release().split('.').map(Number);
  return major > 10 || (major === 10 && build >= 22621);
}

function opaqueBackground() {
  if (nativeTheme.shouldUseHighContrastColors) {
    return systemPreferences.getColor('window');
  }
  return nativeTheme.shouldUseDarkColors ? '#222222' : '#ffffff';
}

export function updateWindowsVibrancy(win, settings) {
  if (!isWindows || win.isDestroyed()) return;

  let enabled =
    win.ypmVibrancySupported === true &&
    settings.enableVibrancy === true &&
    !nativeTheme.shouldUseHighContrastColors &&
    !nativeTheme.inForcedColorsMode &&
    !nativeTheme.prefersReducedTransparency;

  if (win.ypmVibrancySupported && enabled !== win.ypmVibrancyEnabled) {
    try {
      win.setBackgroundMaterial(enabled ? 'acrylic' : 'none');
    } catch (error) {
      // 材质初始化失败时保持窗口可读；渲染进程只接收实际启用状态。
      console.warn('[windowsVibrancy] Cannot apply system material:', error);
      enabled = false;
      try {
        win.setBackgroundMaterial('none');
      } catch (_) {
        // 即使系统拒绝材质切换，不透明底色仍能遮住失效的材质。
      }
    }
  }

  const background = enabled ? '#00000000' : opaqueBackground();
  if (background !== win.ypmBackgroundColor) {
    win.setBackgroundColor(background);
    win.ypmBackgroundColor = background;
  }

  const changed = enabled !== win.ypmVibrancyEnabled;
  win.ypmVibrancyEnabled = enabled;
  if (changed && !win.webContents.isDestroyed()) {
    win.webContents.send('vibrancy-changed', enabled);
  }
}

export function initWindowsVibrancy(win, store) {
  if (!isWindows) return;
  win.ypmVibrancySupported = supportsWindowsVibrancy(win);
  const update = () => updateWindowsVibrancy(win, store.get('settings') || {});
  update();
  nativeTheme.on('updated', update);
  win.once('closed', () => nativeTheme.removeListener('updated', update));
}
