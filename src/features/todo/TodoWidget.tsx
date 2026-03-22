import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { ThemeColors, TodoConfig, TodoPriority, TodoStatus, TodoTask } from './types';
import { DEFAULT_CONFIG, PRIORITY_COLORS, PRIORITY_LABELS, WIDGET_THEMES } from './types';
import { groupTasksByCreatedDate } from './utils/taskGroups';

export function TodoWidget() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [config, setConfig] = useState<TodoConfig | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
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

  const cycleFilter = (direction: 1 | -1) => {
    const filterOrder: Array<typeof filter> = ['pending', 'completed', 'all'];
    const currentIndex = filterOrder.indexOf(filter);
    const nextIndex = (currentIndex + direction + filterOrder.length) % filterOrder.length;
    setFilter(filterOrder[nextIndex]);
  };

  const themeColors = useMemo((): ThemeColors => {
    if (!config?.widget) return WIDGET_THEMES.dark;
    if (config.widget.theme === 'custom' && config.widget.customColors) {
      return config.widget.customColors;
    }
    const themeKey = config.widget.theme === 'custom' ? 'dark' : config.widget.theme;
    return WIDGET_THEMES[themeKey] || WIDGET_THEMES.dark;
  }, [config?.widget]);

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

  const parseColor = (color: string): { r: number; g: number; b: number } => {
    const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1], 10),
        g: parseInt(rgbaMatch[2], 10),
        b: parseInt(rgbaMatch[3], 10),
      };
    }

    const hexMatch = color.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (hexMatch) {
      return {
        r: parseInt(hexMatch[1], 16),
        g: parseInt(hexMatch[2], 16),
        b: parseInt(hexMatch[3], 16),
      };
    }

    return { r: 30, g: 30, b: 30 };
  };

  const getBackgroundColor = () => {
    const { r, g, b } = parseColor(themeColors.background);
    return isDesktopMode ? `rgba(${r}, ${g}, ${b}, ${opacity})` : `rgb(${r}, ${g}, ${b})`;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await invoke<{ tasks: TodoTask[]; config: TodoConfig }>('load_sticky_notes');
        if (!data) return;
        setTasks(data.tasks || []);
        if (data.config?.widget) {
          setConfig(data.config);
          setIsPinned(data.config.widget.isPinned);
          setIsDesktopMode(data.config.widget.isDesktopMode);
        }
      } catch (err) {
        console.error('加载数据失败:', err);
      }
    };

    void loadData();
  }, []);

  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;
    let unlistenData: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    const loadData = async () => {
      try {
        const data = await invoke<{ tasks: TodoTask[]; config: TodoConfig }>('load_sticky_notes');
        if (!data) return;
        setTasks(data.tasks || []);
        if (data.config?.widget) {
          setConfig(data.config);
          setIsPinned(data.config.widget.isPinned);
          setIsDesktopMode(data.config.widget.isDesktopMode);
        }
      } catch (err) {
        console.error('同步数据失败:', err);
      }
    };

    const registerListeners = async () => {
      const appWindow = getCurrentWindow();

      unlistenFocus = await listen('todo-widget-focus-input', () => {
        setFilter('pending');
        focusInput();
      });

      unlistenData = await listen('sticky-notes-data-updated', () => {
        void loadData();
      });

      unlistenMoved = await appWindow.onMoved(() => {
        scheduleSaveWidgetLayout();
      });

      unlistenResized = await appWindow.onResized(() => {
        scheduleSaveWidgetLayout();
      });
    };

    void registerListeners();

    return () => {
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
    try {
      await invoke('save_sticky_notes', {
        data: {
          tasks: updatedTasks,
          config: updatedConfig || config,
          version: 1,
        },
      });
    } catch (err) {
      console.error('保存失败:', err);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;

    const now = Date.now();
    const newTask: TodoTask = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 11)}`,
      title: newTaskTitle.trim(),
      status: 'pending',
      priority: newTaskPriority,
      createdAt: now,
    };

    const updatedTasks = [newTask, ...tasks];
    setTasks(updatedTasks);
    await saveData(updatedTasks);
    setNewTaskTitle('');
    setNewTaskPriority('medium');
  };

  const toggleTask = async (id: string) => {
    const updatedTasks = tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            status: (task.status === 'pending' ? 'completed' : 'pending') as TodoStatus,
            completedAt: task.status === 'pending' ? Date.now() : undefined,
          }
        : task
    );
    setTasks(updatedTasks);
    await saveData(updatedTasks);
  };

  const deleteTask = async (id: string) => {
    const updatedTasks = tasks.filter((task) => task.id !== id);
    setTasks(updatedTasks);
    await saveData(updatedTasks);
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
    if (!editingTaskId) return;

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

    setTasks(updatedTasks);
    await saveData(updatedTasks);
    cancelEditingTask();
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
      await saveData(tasks, nextConfig);
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
      await saveData(tasks, nextConfig);
    } catch (err) {
      setIsDesktopMode(!newDesktopMode);
      setIsPinned(isPinned);
      setConfig(config);
      console.error('切换桌面模式失败:', err);
    }
  };

  const closeWindow = async () => {
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
      await saveData(tasks, nextConfig);
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

  useEffect(() => {
    if (displayTasks.length === 0) {
      setActiveTaskId(null);
      return;
    }

    if (!activeTaskId || !displayTasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(displayTasks[0].id);
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

      if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        cycleFilter(event.shiftKey ? -1 : 1);
        return;
      }

      if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (isTextInput && target === inputRef.current && newTaskTitle.trim()) return;
        if (isTextInput && target !== inputRef.current) return;

        event.preventDefault();
        cycleFilter(event.key === 'ArrowRight' ? 1 : -1);
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
        if (target === inputRef.current) {
          if (newTaskTitle.trim()) {
            event.preventDefault();
            void handleAddTask();
          }
          return;
        }
        if (target !== inputRef.current) return;
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
      className="flex h-screen flex-col overflow-hidden select-none"
      style={{
        backgroundColor: getBackgroundColor(),
        backdropFilter: isDesktopMode ? 'blur(12px)' : 'none',
        color: themeColors.text,
      }}
    >
      <div
        className="flex cursor-move items-center justify-between border-b px-3 py-2"
        style={{ borderColor: themeColors.border }}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4" style={{ color: themeColors.textSecondary }} />
          <CheckCircle2 className="h-4 w-4" style={{ color: themeColors.accent }} />
          <span className="text-sm font-medium">Todo List</span>
          <span className="text-xs" style={{ color: themeColors.textSecondary }}>
            ({pendingTasks.length})
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => void toggleDesktopMode()}
            className="rounded p-1.5 transition-colors"
            style={{ backgroundColor: isDesktopMode ? `${themeColors.accent}30` : 'transparent' }}
            title={isDesktopMode ? '退出桌面嵌入' : '嵌入桌面'}
          >
            {isDesktopMode ? <Monitor className="h-3.5 w-3.5" /> : <MonitorOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => void togglePin()}
            className="rounded p-1.5 transition-colors"
            style={{ backgroundColor: isPinned ? `${themeColors.accent}30` : 'transparent' }}
            title={isPinned ? '取消置顶' : '置顶'}
          >
            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => void minimize()}
            className="rounded p-1.5 transition-colors hover:opacity-80"
            title="最小化"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => void closeWindow()}
            className="rounded p-1.5 transition-colors hover:opacity-80"
            title="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="border-b p-3" style={{ borderColor: themeColors.border }}>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="添加新任务..."
            className="flex-1 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
            style={{
              backgroundColor: `${themeColors.text}10`,
              color: themeColors.text,
              borderColor: 'transparent',
            }}
            autoFocus
          />
          <select
            value={newTaskPriority}
            onChange={(event) => setNewTaskPriority(event.target.value as TodoPriority)}
            className="rounded px-2 py-1.5 text-sm focus:outline-none"
            style={{
              backgroundColor: `${themeColors.text}10`,
              color: themeColors.text,
            }}
          >
            <option value="low" style={{ backgroundColor: themeColors.background }}>低</option>
            <option value="medium" style={{ backgroundColor: themeColors.background }}>中</option>
            <option value="high" style={{ backgroundColor: themeColors.background }}>高</option>
          </select>
          <button
            onClick={() => void handleAddTask()}
            disabled={!newTaskTitle.trim()}
            className="rounded p-1.5 transition-colors disabled:opacity-50"
            style={{ backgroundColor: themeColors.accent, color: '#ffffff' }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b px-3 py-2" style={{ borderColor: themeColors.border }}>
        {[
          ['pending', `待办 (${pendingTasks.length})`],
          ['completed', `已完成 (${completedTasks.length})`],
          ['all', `全部 (${tasks.length})`],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value as 'all' | 'pending' | 'completed')}
            className="rounded px-2 py-1 text-xs transition-colors"
            style={{
              backgroundColor: filter === value ? themeColors.accent : 'transparent',
              color: filter === value ? '#ffffff' : themeColors.textSecondary,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Circle className="mb-2 h-8 w-8" style={{ color: themeColors.textSecondary, opacity: 0.3 }} />
            <p className="text-xs" style={{ color: themeColors.textSecondary }}>暂无任务</p>
          </div>
        ) : (
          groupedTasks.map((group) => (
            <section key={group.label} className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="text-[11px] font-medium" style={{ color: themeColors.textSecondary }}>
                  {group.label}
                </span>
                <div className="h-px flex-1" style={{ backgroundColor: themeColors.border }} />
              </div>
              {group.tasks.map((task) => (
                <div
                  key={task.id}
                  ref={(element) => {
                    if (element) taskRefs.current.set(task.id, element);
                    else taskRefs.current.delete(task.id);
                  }}
                  onMouseEnter={() => setActiveTaskId(task.id)}
                  className="group flex items-center gap-2 rounded px-2 py-2 transition-colors"
                  style={{
                    backgroundColor: activeTaskId === task.id ? `${themeColors.accent}36` : 'transparent',
                    outline: activeTaskId === task.id ? `1px solid ${themeColors.accent}aa` : 'none',
                    boxShadow:
                      activeTaskId === task.id
                        ? `0 0 0 1px ${themeColors.accent}33, inset 3px 0 0 ${themeColors.accent}`
                        : 'none',
                    opacity: task.status === 'completed' ? 0.5 : 1,
                  }}
                >
                  <button
                    onClick={() => void toggleTask(task.id)}
                    className="flex-shrink-0"
                    disabled={editingTaskId === task.id}
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4" style={{ color: '#22c55e' }} />
                    ) : (
                      <Circle
                        className="h-4 w-4 transition-opacity hover:opacity-80"
                        style={{ color: PRIORITY_COLORS[task.priority] }}
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
                      className="flex-1 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1"
                      style={{
                        backgroundColor: `${themeColors.text}12`,
                        color: themeColors.text,
                        outlineColor: themeColors.accent,
                      }}
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startEditingTask(task)}
                      className={`flex-1 truncate text-sm ${task.status === 'completed' ? 'line-through' : ''}`}
                      style={{
                        color: task.status === 'completed' ? themeColors.textSecondary : themeColors.text,
                      }}
                      title="双击编辑"
                    >
                      {task.title}
                    </span>
                  )}

                  <span
                    className="rounded px-1 py-0.5 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      backgroundColor: `${PRIORITY_COLORS[task.priority]}30`,
                      color: PRIORITY_COLORS[task.priority],
                    }}
                  >
                    {PRIORITY_LABELS[task.priority]}
                  </span>

                  {editingTaskId !== task.id && (
                    <>
                      <button
                        onClick={() => startEditingTask(task)}
                        className="rounded p-1 opacity-0 transition-all group-hover:opacity-100"
                        style={{ color: themeColors.textSecondary }}
                        title="编辑任务"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => void deleteTask(task.id)}
                        className="rounded p-1 opacity-0 transition-all group-hover:opacity-100"
                        style={{ color: themeColors.textSecondary }}
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
