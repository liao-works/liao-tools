import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  CheckCircle2,
  Circle,
  GripVertical,
  Minus,
  Monitor,
  MonitorOff,
  Pencil,
  Pin,
  PinOff,
  Plus,
  X,
} from 'lucide-react';
import type { TodoConfig, TodoPriority, TodoStatus, TodoTask, TodoStoreData } from './types';
import { DEFAULT_CONFIG, PRIORITY_LABELS } from './types';
import { groupTasksByCreatedDate } from './utils/taskGroups';

/** 优先级圆点：使用应用语义色 token，自动跟随深浅色主题 */
const PRIORITY_DOT_CLASSES: Record<TodoPriority, string> = {
  low: 'text-success-fg',
  medium: 'text-warning-fg',
  high: 'text-danger-fg',
};

const PRIORITY_BADGE_CLASSES: Record<TodoPriority, string> = {
  low: 'bg-success-subtle text-success-fg',
  medium: 'bg-warning-subtle text-warning-fg',
  high: 'bg-danger-subtle text-danger-fg',
};

const iconButtonClass = (active: boolean) =>
  `rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    active ? 'bg-primary-subtle text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

export function TodoWidget() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [config, setConfig] = useState<TodoConfig | null>(null);
  const [revision, setRevision] = useState(0);
  const savingRef = useRef(false);
  const needsSyncRef = useRef(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newTaskPriority, setNewTaskPriority] = useState<TodoPriority>('medium');
  const [isPinned, setIsPinned] = useState(false);
  const [isDesktopMode, setIsDesktopMode] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const skipEditBlurSaveRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const taskRefs = useRef(new Map<string, HTMLDivElement>());

  const focusInput = () => {
    [0, 40, 120, 240].forEach((delay) => {
      window.setTimeout(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.select();
      }, delay);
    });
  };

  const opacity = config?.widget?.opacity ?? DEFAULT_CONFIG.widget.opacity;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.classList.add('todo-widget-window');
    body.classList.add('todo-widget-window');
    root?.classList.add('todo-widget-window');

    return () => {
      html.classList.remove('todo-widget-window');
      body.classList.remove('todo-widget-window');
      root?.classList.remove('todo-widget-window');
    };
  }, []);

  const syncFromRust = async () => {
    try {
      const data = await invoke<TodoStoreData>('load_sticky_notes');
      if (!data) return;
      if (savingRef.current) {
        needsSyncRef.current = true;
        return;
      }
      setTasks(data.tasks || []);
      setRevision(data.revision ?? 0);
      if (data.config?.widget) {
        setConfig(data.config);
        setIsPinned(data.config.widget.isPinned);
        setIsDesktopMode(data.config.widget.isDesktopMode);
      }
    } catch (err) {
      setSaveError('同步任务失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  useEffect(() => {
    void syncFromRust();
  }, []);

  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;
    let unlistenData: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    let alive = true;
    const register = async (promise: Promise<() => void>, save: (dispose: () => void) => void) => {
      try {
        const dispose = await promise;
        if (alive) save(dispose);
        else dispose();
      } catch (error) {
        console.error('待办小组件事件监听失败:', error);
      }
    };

    const appWindow = getCurrentWindow();
    void register(listen('todo-widget-focus-input', () => {
      setFilter('pending');
      focusInput();
    }), (dispose) => { unlistenFocus = dispose; });
    void register(listen('sticky-notes-data-updated', () => {
      void syncFromRust();
    }), (dispose) => { unlistenData = dispose; });
    void register(appWindow.onMoved(() => {
      scheduleSaveWidgetLayout();
    }), (dispose) => { unlistenMoved = dispose; });
    void register(appWindow.onResized(() => {
      scheduleSaveWidgetLayout();
    }), (dispose) => { unlistenResized = dispose; });

    return () => {
      alive = false;
      unlistenFocus?.();
      unlistenData?.();
      unlistenMoved?.();
      unlistenResized?.();
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  const saveData = async (updatedTasks: TodoTask[], updatedConfig?: TodoConfig | null) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    try {
      const nextRevision = await invoke<number>('save_sticky_notes', {
        data: {
          tasks: updatedTasks,
          config: updatedConfig || config || DEFAULT_CONFIG,
          version: 1,
          revision,
        } satisfies TodoStoreData,
      });
      setRevision(nextRevision);
      setSaveError(null);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError('保存失败：' + message);
      if (message.includes('待办数据已在其他窗口更新')) {
        needsSyncRef.current = true;
      }
      return false;
    } finally {
      savingRef.current = false;
      if (needsSyncRef.current) {
        needsSyncRef.current = false;
        void syncFromRust();
      }
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || savingRef.current) return;

    const now = Date.now();
    const newTask: TodoTask = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 11)}`,
      title: newTaskTitle.trim(),
      status: 'pending',
      priority: newTaskPriority,
      createdAt: now,
    };

    const updatedTasks = [newTask, ...tasks];
    if (await saveData(updatedTasks)) {
      setTasks(updatedTasks);
      setNewTaskTitle('');
      setNewTaskPriority('medium');
    }
  };

  const toggleTask = async (id: string) => {
    if (savingRef.current) return;
    const updatedTasks = tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            status: (task.status === 'pending' ? 'completed' : 'pending') as TodoStatus,
            completedAt: task.status === 'pending' ? Date.now() : undefined,
          }
        : task
    );
    if (await saveData(updatedTasks)) setTasks(updatedTasks);
  };

  const deleteTask = async (id: string) => {
    if (savingRef.current) return;
    const updatedTasks = tasks.filter((task) => task.id !== id);
    if (await saveData(updatedTasks)) setTasks(updatedTasks);
  };

  const startEditingTask = (task: TodoTask) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setActiveTaskId(task.id);
  };

  const cancelEditingTask = () => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
  };

  const saveEditingTask = async () => {
    if (!editingTaskId || savingRef.current) return;

    const nextTitle = editingTaskTitle.trim();
    if (!nextTitle) {
      cancelEditingTask();
      return;
    }

    const targetTask = tasks.find((task) => task.id === editingTaskId);
    if (!targetTask) {
      cancelEditingTask();
      return;
    }

    if (targetTask.title === nextTitle) {
      cancelEditingTask();
      return;
    }

    const updatedTasks = tasks.map((task) =>
      task.id === editingTaskId
        ? {
            ...task,
            title: nextTitle,
          }
        : task
    );

    if (await saveData(updatedTasks)) {
      setTasks(updatedTasks);
      cancelEditingTask();
    }
  };

  const readCurrentWidgetLayout = async () => {
    try {
      const appWindow = getCurrentWindow();
      const position = await appWindow.innerPosition();
      const size = await appWindow.innerSize();

      return {
        position: { x: position.x, y: position.y },
        width: size.width,
        height: size.height,
      };
    } catch {
      return {
        position: config?.widget.position ?? DEFAULT_CONFIG.widget.position,
        width: config?.widget.width ?? DEFAULT_CONFIG.widget.width,
        height: config?.widget.height ?? DEFAULT_CONFIG.widget.height,
      };
    }
  };

  const buildWindowState = (overrides?: Partial<TodoConfig['widget']>) => {
    const widgetConfig = {
      ...(config?.widget ?? DEFAULT_CONFIG.widget),
      ...(overrides ?? {}),
    };

    return {
      x: widgetConfig.position.x,
      y: widgetConfig.position.y,
      width: widgetConfig.width,
      height: widgetConfig.height,
      isDetached: true,
      isPinned: widgetConfig.isPinned,
      isDesktopMode: widgetConfig.isDesktopMode,
      opacity: widgetConfig.opacity,
    };
  };

  const togglePin = async () => {
    if (savingRef.current) return;
    const newPinned = !isPinned;
    const nextDesktopMode = newPinned ? false : isDesktopMode;
    const liveLayout = await readCurrentWidgetLayout();
    const nextConfig: TodoConfig = {
      ...(config ?? DEFAULT_CONFIG),
      widget: {
        ...(config?.widget ?? DEFAULT_CONFIG.widget),
        ...liveLayout,
        isPinned: newPinned,
        isDesktopMode: nextDesktopMode,
      },
    };

    setIsPinned(newPinned);
    setIsDesktopMode(nextDesktopMode);
    setConfig(nextConfig);

    try {
      const appWindow = getCurrentWindow();
      if (newPinned && isDesktopMode) {
        await invoke('set_desktop_mode', {
          noteId: 'todo-widget',
          desktopMode: false,
        });
      }
      await appWindow.setAlwaysOnTop(newPinned);
      await invoke('update_note_window_state', {
        noteId: 'todo-widget',
        state: buildWindowState({
          isPinned: newPinned,
          isDesktopMode: nextDesktopMode,
        }),
      });
      if (!(await saveData(tasks, nextConfig))) {
        throw new Error('置顶设置未持久化');
      }
    } catch (err) {
      setIsPinned(!newPinned);
      setIsDesktopMode(isDesktopMode);
      setConfig(config);
      console.error('切换置顶失败:', err);
    }
  };

  const saveWidgetLayout = async (layout: {
    position?: { x: number; y: number };
    width?: number;
    height?: number;
  }) => {
    try {
      await invoke('save_todo_widget_layout', {
        position: layout.position,
        width: layout.width,
        height: layout.height,
      });
    } catch (err) {
      console.error('保存小组件布局失败:', err);
    }
  };

  const scheduleSaveWidgetLayout = () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      void (async () => {
        const liveLayout = await readCurrentWidgetLayout();
        await saveWidgetLayout(liveLayout);
      })();
    }, 180);
  };

  const toggleDesktopMode = async () => {
    if (savingRef.current) return;
    const newDesktopMode = !isDesktopMode;
    const nextPinned = newDesktopMode ? false : isPinned;
    const liveLayout = await readCurrentWidgetLayout();
    const nextConfig: TodoConfig = {
      ...(config ?? DEFAULT_CONFIG),
      widget: {
        ...(config?.widget ?? DEFAULT_CONFIG.widget),
        ...liveLayout,
        isDesktopMode: newDesktopMode,
        isPinned: nextPinned,
      },
    };

    setIsDesktopMode(newDesktopMode);
    setIsPinned(nextPinned);
    setConfig(nextConfig);

    try {
      if (newDesktopMode && isPinned) {
        await getCurrentWindow().setAlwaysOnTop(false);
      }
      await invoke('set_desktop_mode', {
        noteId: 'todo-widget',
        desktopMode: newDesktopMode,
      });
      await invoke('update_note_window_state', {
        noteId: 'todo-widget',
        state: buildWindowState({
          isDesktopMode: newDesktopMode,
          isPinned: nextPinned,
        }),
      });
      if (!(await saveData(tasks, nextConfig))) {
        throw new Error('桌面模式设置未持久化');
      }
    } catch (err) {
      setIsDesktopMode(!newDesktopMode);
      setIsPinned(isPinned);
      setConfig(config);
      console.error('切换桌面模式失败:', err);
    }
  };

  const closeWindow = async () => {
    if (savingRef.current) return;
    try {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }

      const liveLayout = await readCurrentWidgetLayout();
      const nextConfig: TodoConfig = {
        ...(config ?? DEFAULT_CONFIG),
        widget: {
          ...(config?.widget ?? DEFAULT_CONFIG.widget),
          ...liveLayout,
        },
      };

      setConfig(nextConfig);
      if (!(await saveData(tasks, nextConfig))) return;
      await saveWidgetLayout(liveLayout);
      await invoke('attach_note_window', {
        noteId: 'todo-widget',
        skipLayoutPersist: true,
      });
    } catch (err) {
      console.error('关闭窗口失败:', err);
    }
  };

  const minimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error('最小化失败:', err);
    }
  };

  const handleDragStart = async (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button, input, select')) return;

    try {
      await invoke('start_window_dragging', { noteId: 'todo-widget' });
    } catch (err) {
      console.error('启动拖动失败:', err);
    }
  };

  const pendingTasks = tasks.filter((task) => task.status === 'pending');
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const displayTasks = filter === 'pending' ? pendingTasks : filter === 'completed' ? completedTasks : tasks;
  const groupedTasks = groupTasksByCreatedDate(displayTasks);

  const moveActiveTask = (direction: -1 | 1) => {
    if (displayTasks.length === 0) return;

    const currentIndex = displayTasks.findIndex((task) => task.id === activeTaskId);
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.min(Math.max(currentIndex + direction, 0), displayTasks.length - 1);

    setActiveTaskId(displayTasks[nextIndex].id);
  };

  // 活动任务仅由方向键导航或进入编辑时设置，绝不自动选中，
  // 鼠标悬停也不再改变：避免焦点在输入框外按 Enter 意外勾选任务。
  useEffect(() => {
    if (displayTasks.length === 0) {
      setActiveTaskId(null);
      return;
    }

    if (activeTaskId && !displayTasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(null);
    }
  }, [activeTaskId, displayTasks]);

  useEffect(() => {
    if (!activeTaskId) return;
    taskRefs.current.get(activeTaskId)?.scrollIntoView({ block: 'nearest' });
  }, [activeTaskId]);

  useEffect(() => {
    if (!editingTaskId) return;
    editingInputRef.current?.focus();
    editingInputRef.current?.select();
  }, [editingTaskId]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (target?.closest('button, a, select, [role="dialog"]') || event.ctrlKey || event.metaKey || event.altKey) return;

      if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (isTextInput && target === inputRef.current && newTaskTitle.trim()) return;
        if (isTextInput && target !== inputRef.current) return;

        // Let focused controls and standard keyboard navigation own left/right.
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (isTextInput && target === inputRef.current && newTaskTitle.trim()) return;
        if (isTextInput && target !== inputRef.current) return;

        event.preventDefault();
        moveActiveTask(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      if (event.key !== 'Enter') return;

      if (isTextInput) {
        if (target !== inputRef.current || !newTaskTitle.trim()) return;
        event.preventDefault();
        void handleAddTask();
        return;
      }

      if (!activeTaskId) return;

      event.preventDefault();
      void toggleTask(activeTaskId);
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [activeTaskId, displayTasks, newTaskTitle]);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden rounded-xl border border-border text-foreground select-none shadow-lg"
      style={{
        // 桌面嵌入模式下按配置的透明度混合卡片色，浮动模式不透明
        backgroundColor: `color-mix(in srgb, var(--card) ${Math.round((isDesktopMode ? opacity : 1) * 100)}%, transparent)`,
        backdropFilter: isDesktopMode ? 'blur(14px)' : undefined,
      }}
    >
      <div
        className="flex cursor-move items-center justify-between border-b border-border px-3 py-2"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium">Todo 清单</span>
          <span className="text-xs text-muted-foreground">({pendingTasks.length})</span>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => void toggleDesktopMode()}
            className={iconButtonClass(isDesktopMode)}
            title={isDesktopMode ? '退出桌面嵌入' : '嵌入桌面'}
          >
            {isDesktopMode ? <Monitor className="h-3.5 w-3.5" /> : <MonitorOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => void togglePin()}
            className={iconButtonClass(isPinned)}
            title={isPinned ? '取消置顶' : '置顶'}
          >
            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => void minimize()} className={iconButtonClass(false)} title="最小化">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => void closeWindow()} className={iconButtonClass(false)} title="关闭">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {saveError && (
        <div role="alert" className="flex items-start justify-between gap-2 border-b border-border bg-danger-subtle px-3 py-2 text-xs text-danger-fg">
          <span className="min-w-0 flex-1 break-words">{saveError}</span>
          <button type="button" onClick={() => void syncFromRust()} className="shrink-0 rounded px-2 py-1 underline transition-colors hover:text-foreground">同步最新数据</button>
          <button type="button" aria-label="关闭保存错误" onClick={() => setSaveError(null)} className="shrink-0 rounded p-1 transition-colors hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <div className="border-b border-border p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="添加新任务..."
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary"
            autoFocus
          />
          <select
            value={newTaskPriority}
            onChange={(event) => setNewTaskPriority(event.target.value as TodoPriority)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
          <button
            onClick={() => void handleAddTask()}
            disabled={!newTaskTitle.trim()}
            className="rounded-lg bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
            title="添加任务"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-border px-3 py-2">
        {[
          ['pending', `待办 (${pendingTasks.length})`],
          ['completed', `已完成 (${completedTasks.length})`],
          ['all', `全部 (${tasks.length})`],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value as 'all' | 'pending' | 'completed')}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              filter === value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Circle className="mb-2 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">暂无任务</p>
          </div>
        ) : (
          groupedTasks.map((group) => (
            <section key={group.label} className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {group.tasks.map((task) => (
                <div
                  key={task.id}
                  ref={(element) => {
                    if (element) taskRefs.current.set(task.id, element);
                    else taskRefs.current.delete(task.id);
                  }}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    activeTaskId === task.id ? 'bg-primary-subtle' : 'hover:bg-muted'
                  }`}
                  style={
                    activeTaskId === task.id
                      ? { boxShadow: 'inset 2px 0 0 var(--primary)' }
                      : undefined
                  }
                >
                  <button
                    onClick={() => void toggleTask(task.id)}
                    className="flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                    disabled={editingTaskId === task.id}
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-success-fg" />
                    ) : (
                      <Circle
                        className={`h-4 w-4 transition-opacity hover:opacity-80 ${PRIORITY_DOT_CLASSES[task.priority]}`}
                      />
                    )}
                  </button>

                  {editingTaskId === task.id ? (
                    <input
                      ref={editingInputRef}
                      value={editingTaskTitle}
                      onChange={(event) => setEditingTaskTitle(event.target.value)}
                      onBlur={() => {
                        if (skipEditBlurSaveRef.current) {
                          skipEditBlurSaveRef.current = false;
                          return;
                        }
                        void saveEditingTask();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void saveEditingTask();
                          return;
                        }

                        if (event.key === 'Escape') {
                          event.preventDefault();
                          skipEditBlurSaveRef.current = true;
                          cancelEditingTask();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startEditingTask(task)}
                      className={`min-w-0 flex-1 truncate text-sm ${
                        task.status === 'completed' ? 'text-muted-foreground line-through' : ''
                      }`}
                      title="双击编辑"
                    >
                      {task.title}
                    </span>
                  )}

                  <span
                    className={`shrink-0 rounded px-1 py-0.5 text-xs opacity-0 transition-opacity group-hover:opacity-100 ${PRIORITY_BADGE_CLASSES[task.priority]}`}
                  >
                    {PRIORITY_LABELS[task.priority]}
                  </span>

                  {editingTaskId !== task.id && (
                    <>
                      <button
                        onClick={() => startEditingTask(task)}
                        className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        title="编辑任务"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => void deleteTask(task.id)}
                        className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-danger-fg focus-visible:opacity-100 group-hover:opacity-100"
                        title="删除任务"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
