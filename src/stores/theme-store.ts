import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { themes, applyTheme, getThemeById, migrateTheme, type Theme } from '@/lib/themes';

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
      version: 1,
      migrate: (persisted) => {
        const persistedState = persisted as { currentTheme?: unknown; themes?: unknown };
        return {
          ...persistedState,
          currentTheme: migrateTheme(persistedState?.currentTheme),
          // 旧持久化里的 themes 是旧结构(含 colors 字段),一并重置为新数组,
          // 避免合并后选择器读到残留字段
          themes,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state?.currentTheme) {
          // 从 localStorage 加载后应用主题
          applyTheme(state.currentTheme);
        } else {
          // 首次加载，使用默认主题
          const defaultTheme = getThemeById(DEFAULT_THEME_ID) ?? themes[0];
          applyTheme(defaultTheme);
        }
      },
    }
  )
);
