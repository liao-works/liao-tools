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
  revision: number;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  filter: 'all' | 'pending' | 'completed';
  loadTasks: () => Promise<void>;
  reloadTasks: () => Promise<void>;
  saveTasks: () => Promise<void>;
  addTask: (title: string, priority?: TodoPriority, dueDate?: number) => Promise<TodoTask>;
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

// Serialize writes from the main window so successive task edits cannot persist stale snapshots.
let pendingSave: Promise<void> = Promise.resolve();
const enqueueSave = (action: () => Promise<void>): Promise<void> => {
  const next = pendingSave.then(action);
  pendingSave = next.catch(() => undefined);
  return next;
};

export const useTodoStore = create<TodoState>((set, get) => {
  const commit = (transform: (current: TodoState) => Pick<TodoState, 'tasks' | 'config'>) =>
    enqueueSave(async () => {
      const next = transform(get());
      const expectedRevision = get().revision;
      try {
        const revision = await invoke<number>('save_sticky_notes', {
          data: { tasks: next.tasks, config: next.config, version: 1, revision: expectedRevision } as TodoStoreData,
        });
        set({ ...next, revision, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('待办数据已在其他窗口更新')) {
          try {
            const latest = await invoke<TodoStoreData>('load_sticky_notes');
            if (latest) set({
              tasks: latest.tasks || [],
              config: latest.config || DEFAULT_CONFIG,
              revision: latest.revision ?? 0,
              initialized: true,
            });
          } catch {
            // Preserve the conflict error; the manual refresh remains available.
          }
        }
        set({ error: '保存失败：' + message });
        throw error;
      }
    });

  return ({
  tasks: [],
  config: DEFAULT_CONFIG,
  revision: 0,
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
          revision: data.revision ?? 0,
          initialized: true,
        });
      } else {
        set({
          tasks: [],
          config: DEFAULT_CONFIG,
          revision: 0,
          initialized: true,
        });
      }
    } catch (err) {
      // Do not silently present a storage failure as an empty task list.
      set({
        initialized: true,
        error: '读取任务失败：' + (err instanceof Error ? err.message : String(err)),
      });
      console.warn('加载任务数据失败:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  reloadTasks: async () => {
    await pendingSave;
    const { isLoading } = get();
    if (isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const data = await invoke<TodoStoreData>('load_sticky_notes');
      set({
        tasks: data?.tasks || [],
        config: data?.config || DEFAULT_CONFIG,
        revision: data?.revision ?? 0,
        initialized: true,
      });
    } catch (err) {
      set({ error: '重新读取任务失败：' + (err instanceof Error ? err.message : String(err)) });
      console.warn('重新加载任务数据失败:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  saveTasks: async () => {
    await commit((current) => ({ tasks: current.tasks, config: current.config }));
  },

  addTask: async (title, priority = 'medium', dueDate?: number) => {
    const now = Date.now();
    const newTask: TodoTask = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 11)}`,
      title,
      status: 'pending',
      priority,
      createdAt: now,
      dueDate,
    };
    await commit((current) => ({
      tasks: [newTask, ...current.tasks],
      config: current.config,
    }));
    return newTask;
  },

  updateTask: async (id, updates) => {
    await commit((current) => ({
      tasks: current.tasks.map((task) => (task.id === id ? { ...task, ...updates } : task)),
      config: current.config,
    }));
  },

  deleteTask: async (id) => {
    await commit((current) => ({
      tasks: current.tasks.filter((task) => task.id !== id),
      config: current.config,
    }));
  },

  toggleTask: async (id) => {
    await commit((current) => ({
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;
        const status: TodoStatus = task.status === 'pending' ? 'completed' : 'pending';
        return { ...task, status, completedAt: status === 'completed' ? Date.now() : undefined };
      }),
      config: current.config,
    }));
  },

  clearCompleted: async () => {
    await commit((current) => ({
      tasks: current.tasks.filter((task) => task.status !== 'completed'),
      config: current.config,
    }));
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
          revision: data.revision ?? 0,
          initialized: true,
        });
      }

      await invoke('detach_note_window', {
        noteId: 'todo-widget',
        windowState: toWindowState(latestConfig.widget),
      });
    } catch (err) {
      set({ error: '打开桌面小部件失败：' + (err instanceof Error ? err.message : String(err)) });
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
    await commit((current) => {
      const config = current.config;
      const updatedConfig: TodoConfig = {
        ...config,
        ...updates,
        widget: updates.widget ? { ...config.widget, ...updates.widget } : config.widget,
        hotkeys: updates.hotkeys ? { ...config.hotkeys, ...updates.hotkeys } : config.hotkeys,
      };
      return { tasks: current.tasks, config: updatedConfig };
    });
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
  });
});

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
