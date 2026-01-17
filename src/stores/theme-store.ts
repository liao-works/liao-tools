import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { themes, applyTheme, getThemeById, type Theme } from '@/lib/themes';

interface ThemeStore {
  currentTheme: Theme;
  themes: Theme[];
  changeTheme: (themeId: string) => void;
}

const DEFAULT_THEME_ID = 'default-dark';

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      currentTheme: themes[0],
      themes,
      changeTheme: (themeId: string) => {
        const theme = getThemeById(themeId);
        if (theme) {
          applyTheme(theme);
          set({ currentTheme: theme });
        }
      },
    }),
    {
      name: 'liao-tools-theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 从 localStorage 加载后应用主题
          applyTheme(state.currentTheme);
        } else {
          // 首次加载，使用默认主题
          const defaultTheme = getThemeById(DEFAULT_THEME_ID) || themes[0];
          applyTheme(defaultTheme);
        }
      },
    }
  )
);
