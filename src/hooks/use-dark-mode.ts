import { useEffect, useState } from 'react';
import { APP_APPEARANCE_EVENT } from '@/lib/themes';

export type DarkModeType = 'system' | 'light' | 'dark';

const DARK_MODE_KEY = 'liao-tools-dark-mode';

const getSystemTheme = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return true; // 默认暗色
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const getEffectiveDarkMode = (mode: DarkModeType): boolean => {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode === 'dark';
};

export function useDarkMode() {
  const [mode, setMode] = useState<DarkModeType>(() => {
    const saved = localStorage.getItem(DARK_MODE_KEY) as DarkModeType | null;
    return saved || 'system'; // 默认跟随系统
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    return getEffectiveDarkMode(mode);
  });

  useEffect(() => {
    const root = window.document.documentElement;

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    localStorage.setItem(DARK_MODE_KEY, mode);

    // 广播给其他窗口（桌面小组件等），实现深浅色实时联动。
    // 非 Tauri 环境（纯浏览器开发）下 emit 会失败，静默忽略。
    void import('@tauri-apps/api/event')
      .then(({ emit }) => emit(APP_APPEARANCE_EVENT, { dark: isDark }))
      .catch(() => undefined);
  }, [isDark, mode]);

  // 监听系统主题变化
  useEffect(() => {
    if (mode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
    };

    // 现代浏览器使用 addEventListener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      // 旧浏览器兼容
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [mode]);

  const setDarkMode = (newMode: DarkModeType) => {
    setMode(newMode);
    setIsDark(getEffectiveDarkMode(newMode));
  };

  const toggleDarkMode = () => {
    const newMode: DarkModeType = isDark ? 'light' : 'dark';
    setDarkMode(newMode);
  };

  return {
    mode,
    isDark,
    setDarkMode,
    toggleDarkMode,
  };
}
