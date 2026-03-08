import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  TodoTask,
  TodoConfig,
  TodoWidgetConfig,
  TodoStatus,
  TodoPriority,
  TodoStoreData,
  WidgetPosition,
} from '../types';
import { DEFAULT_CONFIG } from '../types';

const toWindowState = (widget: TodoWidgetConfig) => ({
  x: widget.position.x,
  y: widget.position.y,
  width: widget.width,
  height: widget.height,
  isDetached: true,
  isPinned: widget.isPinned,
  isDesktopMode: widget.isDesktopMode,
  opacity: widget.opacity,
});

interface TodoState {
  tasks: TodoTask[];
  config: TodoConfig;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  filter: 'all' | 'pending' | 'completed';
  loadTasks: () => Promise<void>;
  reloadTasks: () => Promise<void>;
  saveTasks: () => Promise<void>;
  addTask: (title: string, priority?: TodoPriority) => Promise<TodoTask>;
  updateTask: (id: string, updates: Partial<TodoTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  updateWidgetPosition: (position: WidgetPosition) => Promise<void>;
  updateWidgetSize: (width: number, height: number) => Promise<void>;
  updateWidgetOpacity: (opacity: number) => Promise<void>;
  setDesktopMode: (enabled: boolean) => Promise<void>;
  setPinned: (pinned: boolean) => Promise<void>;
  togglePin: () => Promise<void>;
  showWidget: () => Promise<void>;
  hideWidget: () => Promise<void>;
  updateConfig: (updates: Partial<TodoConfig>) => Promise<void>;
  setFilter: (filter: 'all' | 'pending' | 'completed') => void;
  setError: (error: string | null) => void;
  getFilteredTasks: () => TodoTask[];
  getPendingCount: () => number;
  getCompletedCount: () => number;
}

export const useTodoStore = create<TodoState>((set, get) => ({
  tasks: [],
  config: DEFAULT_CONFIG,
  isLoading: false,
  error: null,
  initialized: false,
  filter: 'all',

  loadTasks: async () => {
    const { isLoading, initialized } = get();
    if (isLoading || initialized) return;

    set({ isLoading: true, error: null });

    try {
      const data = await invoke<TodoStoreData>('load_sticky_notes');
      if (data) {
        set({
          tasks: data.tasks || [],
          config: data.config || DEFAULT_CONFIG,
          initialized: true,
        });
      } else {
        set({
          tasks: [],
          config: DEFAULT_CONFIG,
          initialized: true,
        });
      }
    } catch (err) {
      set({
        tasks: [],
        config: DEFAULT_CONFIG,
        initialized: true,
      });
      console.warn('加载任务数据失败，使用默认配置:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  reloadTasks: async () => {
    const { isLoading } = get();
    if (isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const data = await invoke<TodoStoreData>('load_sticky_notes');
      set({
        tasks: data?.tasks || [],
        config: data?.config || DEFAULT_CONFIG,
        initialized: true,
      });
    } catch (err) {
      console.warn('重新加载任务数据失败:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  saveTasks: async () => {
    const { tasks, config } = get();
    try {
      await invoke('save_sticky_notes', {
        data: {
          tasks,
          config,
          version: 1,
        } as TodoStoreData,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      set({ error: `保存失败: ${errorMessage}` });
      throw err;
    }
  },

  addTask: async (title, priority = 'medium') => {
    const { tasks, saveTasks } = get();
    const now = Date.now();
    const newTask: TodoTask = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 11)}`,
      title,
      status: 'pending',
      priority,
      createdAt: now,
    };

    set({ tasks: [newTask, ...tasks] });
    await saveTasks();
    return newTask;
  },

  updateTask: async (id, updates) => {
    const { tasks, saveTasks } = get();
    set({
      tasks: tasks.map((task) => (task.id === id ? { ...task, ...updates } : task)),
    });
    await saveTasks();
  },

  deleteTask: async (id) => {
    const { tasks, saveTasks } = get();
    set({ tasks: tasks.filter((task) => task.id !== id) });
    await saveTasks();
  },

  toggleTask: async (id) => {
    const { tasks, updateTask } = get();
    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    const newStatus: TodoStatus = task.status === 'pending' ? 'completed' : 'pending';
    await updateTask(id, {
      status: newStatus,
      completedAt: newStatus === 'completed' ? Date.now() : undefined,
    });
  },

  clearCompleted: async () => {
    const { tasks, saveTasks } = get();
    set({ tasks: tasks.filter((task) => task.status !== 'completed') });
    await saveTasks();
  },

  updateWidgetPosition: async (position) => {
    const { config, updateConfig } = get();
    const nextWidget = { ...config.widget, position };
    await updateConfig({ widget: nextWidget });
    await invoke('update_note_window_state', {
      noteId: 'todo-widget',
      state: toWindowState(nextWidget),
    });
  },

  updateWidgetSize: async (width, height) => {
    const { config, updateConfig } = get();
    await updateConfig({ widget: { ...config.widget, width, height } });
  },

  updateWidgetOpacity: async (opacity) => {
    const { config, updateConfig } = get();
    await updateConfig({ widget: { ...config.widget, opacity } });
  },

  setDesktopMode: async (enabled) => {
    const { config, updateConfig } = get();
    const nextWidget = {
      ...config.widget,
      isDesktopMode: enabled,
      isPinned: enabled ? false : config.widget.isPinned,
    };
    await updateConfig({ widget: nextWidget });
    await invoke('set_desktop_mode', {
      noteId: 'todo-widget',
      desktopMode: enabled,
    });
    await invoke('update_note_window_state', {
      noteId: 'todo-widget',
      state: toWindowState(nextWidget),
    });
  },

  setPinned: async (pinned) => {
    const { config, updateConfig } = get();
    const nextWidget = {
      ...config.widget,
      isPinned: pinned,
      isDesktopMode: pinned ? false : config.widget.isDesktopMode,
    };
    await updateConfig({ widget: nextWidget });
    if (pinned && config.widget.isDesktopMode) {
      await invoke('set_desktop_mode', {
        noteId: 'todo-widget',
        desktopMode: false,
      });
    }
    await invoke('update_note_window_state', {
      noteId: 'todo-widget',
      state: toWindowState(nextWidget),
    });
  },

  togglePin: async () => {
    const { config, setPinned } = get();
    await setPinned(!config.widget.isPinned);
  },

  showWidget: async () => {
    try {
      const data = await invoke<TodoStoreData>('load_sticky_notes');
      const latestConfig = data?.config ?? get().config;
      if (data) {
        set({
          tasks: data.tasks || [],
          config: latestConfig,
          initialized: true,
        });
      }

      await invoke('detach_note_window', {
        noteId: 'todo-widget',
        windowState: toWindowState(latestConfig.widget),
      });
    } catch (err) {
      console.error('显示小部件失败:', err);
    }
  },

  hideWidget: async () => {
    try {
      await invoke('show_hide_all_notes', { visible: false });
    } catch (err) {
      console.error('隐藏小部件失败:', err);
    }
  },

  updateConfig: async (updates) => {
    const { config, saveTasks } = get();
    const updatedConfig: TodoConfig = {
      ...config,
      ...updates,
      widget: updates.widget ? { ...config.widget, ...updates.widget } : config.widget,
      hotkeys: updates.hotkeys ? { ...config.hotkeys, ...updates.hotkeys } : config.hotkeys,
    };
    set({ config: updatedConfig });
    await saveTasks();
  },

  setFilter: (filter) => {
    set({ filter });
  },

  setError: (error) => {
    set({ error });
  },

  getFilteredTasks: () => {
    const { tasks, filter } = get();
    return filter === 'all' ? tasks : tasks.filter((task) => task.status === filter);
  },

  getPendingCount: () => {
    const { tasks } = get();
    return tasks.filter((task) => task.status === 'pending').length;
  },

  getCompletedCount: () => {
    const { tasks } = get();
    return tasks.filter((task) => task.status === 'completed').length;
  },
}));

if (typeof window !== 'undefined') {
  void listen('sticky-notes-data-updated', () => {
    void useTodoStore.getState().reloadTasks();
  });

  void listen<TodoWidgetConfig>('sticky-notes-widget-layout-updated', (event) => {
    const widget = event.payload;
    if (!widget) return;

    useTodoStore.setState((state) => ({
      config: {
        ...state.config,
        widget: {
          ...state.config.widget,
          ...widget,
        },
      },
    }));
  });
}
