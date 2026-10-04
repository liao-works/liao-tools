export type AccentId = 'blue' | 'sky' | 'purple' | 'green' | 'rose' | 'slate';

export interface Theme {
  id: string;          // 沿用旧 id,保证持久化兼容
  name: string;
  description: string;
  accent: AccentId;
}

export const themes: Theme[] = [
  { id: 'default-dark', name: '默认蓝', description: '经典的蓝色主题', accent: 'blue' },
  { id: 'blue-ocean', name: '蓝色海洋', description: '清新的海洋蓝', accent: 'sky' },
  { id: 'purple-night', name: '紫色夜晚', description: '神秘的紫罗兰', accent: 'purple' },
  { id: 'green-forest', name: '绿色森林', description: '自然的翠绿色', accent: 'green' },
  { id: 'rose-gold', name: '玫瑰金', description: '优雅的玫瑰金', accent: 'rose' },
  { id: 'slate', name: '石板灰', description: '专业的灰色调', accent: 'slate' },
];

export const getThemeById = (id: string): Theme | undefined =>
  themes.find(theme => theme.id === id);

/** 应用主题:切换 <html> 的 data-accent 属性(颜色由 CSS token 机制接管) */
export const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.accent = theme.accent;
};

/**
 * 持久化迁移:旧版 Theme 含 colors 字段(HSL 三元组),按 id 映射为新结构。
 * 未知 id 回退 'default-dark'。
 */
export const migrateTheme = (stored: unknown): Theme => {
  if (stored && typeof stored === 'object' && 'id' in stored) {
    return getThemeById((stored as { id: string }).id) ?? themes[0];
  }
  return themes[0];
};

/** 主题选择器预览色(静态常量,不随全局 accent 变化,用于区分六个选项) */
export const ACCENT_PREVIEW: Record<AccentId, string> = {
  blue: '#2E7CF6',
  sky: '#1799C4',
  purple: '#8B5CF6',
  green: '#22A052',
  rose: '#D9407E',
  slate: '#5A6B84',
};
