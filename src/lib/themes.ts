export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
    secondary: string;
    secondaryForeground: string;
  };
}

export const themes: Theme[] = [
  {
    id: 'default-dark',
    name: '默认暗色',
    description: '经典的蓝色主题',
    colors: {
      primary: '217 91% 60%',
      primaryForeground: '0 0% 98%',
      accent: '0 0% 18%',
      accentForeground: '0 0% 98%',
      secondary: '142 76% 36%',
      secondaryForeground: '0 0% 98%',
    },
  },
  {
    id: 'blue-ocean',
    name: '蓝色海洋',
    description: '清新的海洋蓝',
    colors: {
      primary: '199 89% 48%',
      primaryForeground: '0 0% 100%',
      accent: '0 0% 18%',
      accentForeground: '0 0% 98%',
      secondary: '187 71% 45%',
      secondaryForeground: '0 0% 100%',
    },
  },
  {
    id: 'purple-night',
    name: '紫色夜晚',
    description: '神秘的紫罗兰',
    colors: {
      primary: '271 81% 56%',
      primaryForeground: '0 0% 100%',
      accent: '0 0% 18%',
      accentForeground: '0 0% 98%',
      secondary: '280 89% 60%',
      secondaryForeground: '0 0% 100%',
    },
  },
  {
    id: 'green-forest',
    name: '绿色森林',
    description: '自然的翠绿色',
    colors: {
      primary: '142 76% 36%',
      primaryForeground: '0 0% 100%',
      accent: '0 0% 18%',
      accentForeground: '0 0% 98%',
      secondary: '151 55% 42%',
      secondaryForeground: '0 0% 100%',
    },
  },
  {
    id: 'rose-gold',
    name: '玫瑰金',
    description: '优雅的玫瑰金',
    colors: {
      primary: '340 82% 52%',
      primaryForeground: '0 0% 100%',
      accent: '0 0% 18%',
      accentForeground: '0 0% 98%',
      secondary: '25 95% 53%',
      secondaryForeground: '0 0% 100%',
    },
  },
  {
    id: 'slate',
    name: '石板灰',
    description: '专业的灰色调',
    colors: {
      primary: '215 16% 47%',
      primaryForeground: '0 0% 100%',
      accent: '0 0% 18%',
      accentForeground: '0 0% 98%',
      secondary: '217 19% 35%',
      secondaryForeground: '0 0% 100%',
    },
  },
];

export const getThemeById = (id: string): Theme | undefined => {
  return themes.find(theme => theme.id === id);
};

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  
  Object.entries(theme.colors).forEach(([key, value]) => {
    const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--${cssVar}`, value);
  });
};
