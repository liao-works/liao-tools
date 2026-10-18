import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listen } from '@tauri-apps/api/event';
import { themes, applyTheme, getThemeById, migrateTheme, APP_APPEARANCE_EVENT, type Theme } from '@/lib/themes';

interface ThemeStore {
  currentTheme: Theme;
  themes: Theme[];
  changeTheme: (themeId: string) => void;
}

const DEFAULT_THEME_ID = 'warm-coral';

/** 把外观变更应用到本窗口的 <html>（供跨窗口广播使用） */
const applyAppearanceToDocument = (appearance: { accent?: string; dark?: boolean }) => {
  const root = document.documentElement;
  if (appearance.accent) {
    root.dataset.accent = appearance.accent;
  }
  if (typeof appearance.dark === 'boolean') {
    root.classList.toggle('dark', appearance.dark);
  }
};

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
          // 广播给其他窗口（桌面小组件等），实现外观联动
          import('@tauri-apps/api/event').then(({ emit }) =>
            emit(APP_APPEARANCE_EVENT, { accent: theme.accent })
          ).catch(() => undefined);
        }
      },
    }),
    {
      name: 'liao-tools-theme-storage',
      version: 2,
      // 只持久化 currentTheme:themes 是代码内常量,整包存储会让
      // themes.ts 的任何更新都被用户本地的旧数组静默遮蔽
      partialize: (state) => ({ currentTheme: state.currentTheme }),
      migrate: (persisted) => {
        const persistedState = persisted as { currentTheme?: unknown };
        // v0(colors 结构 + themes 数组)与 v1(整包状态)一律规约为仅
        // currentTheme,彻底丢弃残留的 themes;id 未知时回退默认主题
        return {
          currentTheme: migrateTheme(persistedState?.currentTheme),
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

// 每个窗口（主窗口、桌面小组件）都会加载本模块：监听任意窗口发出的
// 外观变更事件并立即应用，实现主题与深浅色的实时联动。
if (typeof window !== 'undefined') {
  listen<{ accent?: string; dark?: boolean }>(APP_APPEARANCE_EVENT, (event) => {
    applyAppearanceToDocument(event.payload ?? {});
  }).catch(() => undefined);
}
