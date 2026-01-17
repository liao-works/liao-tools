import { useThemeStore } from '@/stores/theme-store';

export function useTheme() {
  const currentTheme = useThemeStore((state) => state.currentTheme);
  const themes = useThemeStore((state) => state.themes);
  const changeTheme = useThemeStore((state) => state.changeTheme);

  return {
    currentTheme,
    themes,
    changeTheme,
  };
}
