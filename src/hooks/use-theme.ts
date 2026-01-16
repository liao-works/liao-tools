import { useEffect, useState } from 'react';
import { themes, applyTheme, getThemeById, type Theme } from '@/lib/themes';

const THEME_STORAGE_KEY = 'liao-tools-theme';
const DEFAULT_THEME_ID = 'default-dark';

export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const savedThemeId = localStorage.getItem(THEME_STORAGE_KEY);
    return getThemeById(savedThemeId || DEFAULT_THEME_ID) || themes[0];
  });

  useEffect(() => {
    applyTheme(currentTheme);
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme.id);
  }, [currentTheme]);

  const changeTheme = (themeId: string) => {
    const theme = getThemeById(themeId);
    if (theme) {
      setCurrentTheme(theme);
    }
  };

  return {
    currentTheme,
    themes,
    changeTheme,
  };
}
