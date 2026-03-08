export type TodoStatus = 'pending' | 'completed';

export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoTask {
  id: string;
  title: string;
  status: TodoStatus;
  priority: TodoPriority;
  createdAt: number;
  completedAt?: number;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export type WidgetTheme = 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'custom';

export interface ThemeColors {
  background: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
}

export interface TodoWidgetConfig {
  position: WidgetPosition;
  width: number;
  height: number;
  opacity: number;
  isDesktopMode: boolean;
  isPinned: boolean;
  theme: WidgetTheme;
  customColors?: ThemeColors;
}

export interface TodoConfig {
  widget: TodoWidgetConfig;
  hotkeys: {
    toggle: string;
    togglePin: string;
    quickAdd: string;
  };
}

export interface TodoStoreData {
  tasks: TodoTask[];
  config: TodoConfig;
  version: number;
}

export const WIDGET_THEMES: Record<Exclude<WidgetTheme, 'custom'>, ThemeColors> = {
  dark: {
    background: '#1e1e1e',
    text: '#ffffff',
    textSecondary: '#a0a0a0',
    border: 'rgba(255, 255, 255, 0.1)',
    accent: '#3b82f6',
  },
  light: {
    background: '#ffffff',
    text: '#1f2937',
    textSecondary: '#6b7280',
    border: 'rgba(0, 0, 0, 0.1)',
    accent: '#3b82f6',
  },
  blue: {
    background: '#1e3a5f',
    text: '#ffffff',
    textSecondary: '#a5b4c4',
    border: 'rgba(255, 255, 255, 0.15)',
    accent: '#60a5fa',
  },
  purple: {
    background: '#2d1f3d',
    text: '#ffffff',
    textSecondary: '#b8a5c4',
    border: 'rgba(255, 255, 255, 0.15)',
    accent: '#a78bfa',
  },
  green: {
    background: '#1a2e1a',
    text: '#ffffff',
    textSecondary: '#a5c4a5',
    border: 'rgba(255, 255, 255, 0.15)',
    accent: '#4ade80',
  },
  orange: {
    background: '#3d2a1f',
    text: '#ffffff',
    textSecondary: '#c4b4a5',
    border: 'rgba(255, 255, 255, 0.15)',
    accent: '#fb923c',
  },
};

export const THEME_LABELS: Record<WidgetTheme, string> = {
  dark: '深色',
  light: '浅色',
  blue: '蓝色',
  purple: '紫色',
  green: '绿色',
  orange: '橙色',
  custom: '自定义',
};

export const DEFAULT_CONFIG: TodoConfig = {
  widget: {
    position: { x: 100, y: 100 },
    width: 360,
    height: 460,
    opacity: 0.9,
    isDesktopMode: true,
    isPinned: false,
    theme: 'dark',
  },
  hotkeys: {
    toggle: 'CommandOrControl+Alt+T',
    togglePin: 'CommandOrControl+Alt+P',
    quickAdd: 'CommandOrControl+Alt+N',
  },
};

export const PRIORITY_COLORS: Record<TodoPriority, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#ef4444',
};

export const PRIORITY_LABELS: Record<TodoPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
};
