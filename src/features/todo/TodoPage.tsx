import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Filter,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { useTodoStore } from './store/todoStore';
import { SettingsModal } from './components/SettingsModal';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TodoPriority } from './types';
import { PRIORITY_COLORS, PRIORITY_LABELS } from './types';
import { groupTasksByCreatedDate } from './utils/taskGroups';

export function TodoPage() {
  const {
    isLoading,
    error,
    initialized,
    loadTasks,
    setError,
    filter,
    setFilter,
    addTask,
    showWidget,
    getFilteredTasks,
    getPendingCount,
    getCompletedCount,
  } = useTodoStore();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TodoPriority>('medium');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    if (!initialized) {
      void loadTasks();
    }
  }, [initialized, loadTasks]);

  useEffect(() => {
    const handleFocusInput = () => {
      focusInput();
    };

    window.addEventListener('todo:focus-main-input', handleFocusInput);
    return () => {
      window.removeEventListener('todo:focus-main-input', handleFocusInput);
    };
  }, []);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await addTask(newTaskTitle.trim(), newTaskPriority);
    setNewTaskTitle('');
    setNewTaskPriority('medium');
  };

  const cycleFilter = (direction: 1 | -1) => {
    const filterOrder: Array<typeof filter> = ['pending', 'completed', 'all'];
    const currentIndex = filterOrder.indexOf(filter);
    const nextIndex = (currentIndex + direction + filterOrder.length) % filterOrder.length;
    setFilter(filterOrder[nextIndex]);
  };

  const filteredTasks = getFilteredTasks();
  const groupedTasks = groupTasksByCreatedDate(filteredTasks);
  const visibleTasks = useMemo(() => groupedTasks.flatMap((group) => group.tasks), [groupedTasks]);
  const pendingCount = getPendingCount();
  const completedCount = getCompletedCount();

  const moveActiveTask = (direction: -1 | 1) => {
    if (visibleTasks.length === 0) return;

    const currentIndex = visibleTasks.findIndex((task) => task.id === activeTaskId);
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.min(Math.max(currentIndex + direction, 0), visibleTasks.length - 1);

    setActiveTaskId(visibleTasks[nextIndex].id);
  };

  const handleNavigationKeyDown = (event: {
    key: string;
    shiftKey: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    target: EventTarget | null;
    preventDefault: () => void;
  }) => {
    const target = event.target as HTMLElement | null;
    const isTextInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;

    if (showSettings) return;

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
      if (target === inputRef.current && newTaskTitle.trim()) {
        event.preventDefault();
        void handleAddTask();
      }
      return;
    }

    if (!activeTaskId) return;

    event.preventDefault();
    void useTodoStore.getState().toggleTask(activeTaskId);
  };

  useEffect(() => {
    if (visibleTasks.length === 0) {
      setActiveTaskId(null);
      return;
    }

    if (!activeTaskId || !visibleTasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(visibleTasks[0].id);
    }
  }, [activeTaskId, visibleTasks]);

  useEffect(() => {
    if (!activeTaskId) return;
    taskRefs.current.get(activeTaskId)?.scrollIntoView({ block: 'nearest' });
  }, [activeTaskId]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      handleNavigationKeyDown(event);
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [activeTaskId, filter, newTaskTitle, showSettings, visibleTasks]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Todo List</h1>
              <p className="text-sm text-muted-foreground">
                {pendingCount} 待办 · {completedCount} 已完成
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => void showWidget()} variant="outline" className="gap-2 text-foreground">
              <ExternalLink className="h-4 w-4" />
              桌面小部件
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              title="设置"
              className="text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="添加新任务..."
            className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <select
            value={newTaskPriority}
            onChange={(event) => setNewTaskPriority(event.target.value as TodoPriority)}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
          <Button onClick={() => void handleAddTask()} disabled={!newTaskTitle.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {[
            ['pending', '待办'],
            ['completed', '已完成'],
            ['all', '全部'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as 'all' | 'pending' | 'completed')}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                filter === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-destructive hover:text-destructive/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {isLoading && !initialized ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-muted-foreground">加载中...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16">
            <Circle className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">暂无任务</p>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {groupedTasks.map((group) => (
              <section key={group.label} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {group.tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    isActive={activeTaskId === task.id}
                    setTaskRef={(element) => {
                      if (element) taskRefs.current.set(task.id, element);
                      else taskRefs.current.delete(task.id);
                    }}
                    onActivate={() => setActiveTaskId(task.id)}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </ScrollArea>

      {completedCount > 0 && (
        <div className="border-t border-border p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void useTodoStore.getState().clearCompleted()}
            className="text-muted-foreground"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清除已完成 ({completedCount})
          </Button>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

interface TaskItemProps {
  task: {
    id: string;
    title: string;
    status: 'pending' | 'completed';
    priority: TodoPriority;
    createdAt: number;
  };
  isActive: boolean;
  setTaskRef: (element: HTMLDivElement | null) => void;
  onActivate: () => void;
}

function TaskItem({ task, isActive, setTaskRef, onActivate }: TaskItemProps) {
  const { toggleTask, deleteTask, updateTask } = useTodoStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurSaveRef = useRef(false);

  useEffect(() => {
    if (!isEditing) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) return;
    setEditTitle(task.title);
  }, [isEditing, task.title]);

  const startEditing = () => {
    setEditTitle(task.title);
    setIsEditing(true);
    onActivate();
  };

  const cancelEditing = () => {
    setEditTitle(task.title);
    setIsEditing(false);
  };

  const saveEditing = async () => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      cancelEditing();
      return;
    }

    if (nextTitle !== task.title) {
      await updateTask(task.id, { title: nextTitle });
    }

    setIsEditing(false);
  };

  return (
    <div
      ref={setTaskRef}
      onMouseEnter={onActivate}
      onMouseDown={onActivate}
      className={`group flex items-center gap-3 rounded-lg border p-3 transition-all duration-150 ${
        task.status === 'completed' ? 'opacity-60' : ''
      }`}
      style={{
        backgroundColor: isActive ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--card))',
        borderColor: isActive ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--border))',
        boxShadow: isActive
          ? '0 0 0 3px hsl(var(--primary) / 0.22), 0 14px 32px -18px hsl(var(--foreground) / 0.5)'
          : 'none',
      }}
    >
      <div
        className="w-1.5 self-stretch rounded-full"
        style={{ backgroundColor: isActive ? 'hsl(var(--primary))' : 'transparent' }}
      />
      <button onClick={() => void toggleTask(task.id)} className="flex-shrink-0" disabled={isEditing}>
        {task.status === 'completed' ? (
          <CheckCircle2 className="h-5 w-5" style={{ color: isActive ? 'hsl(var(--primary))' : '#22c55e' }} />
        ) : (
          <Circle
            className="h-5 w-5 text-muted-foreground transition-colors hover:text-primary"
            style={{
              color: isActive ? 'hsl(var(--primary))' : PRIORITY_COLORS[task.priority],
            }}
          />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            ref={editInputRef}
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            onBlur={() => {
              if (skipBlurSaveRef.current) {
                skipBlurSaveRef.current = false;
                return;
              }
              void saveEditing();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void saveEditing();
                return;
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                skipBlurSaveRef.current = true;
                cancelEditing();
              }
            }}
            className="w-full rounded-md border border-primary/40 bg-muted px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        ) : (
          <p
            onDoubleClick={startEditing}
            className={`cursor-text text-sm ${
              task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
            style={{ fontWeight: isActive ? 700 : 500 }}
            title="双击编辑"
          >
            {task.title}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          {isActive && (
            <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground">
              ACTIVE
            </span>
          )}
          <span
            className="rounded px-1.5 py-0.5 text-xs"
            style={{
              backgroundColor: `${PRIORITY_COLORS[task.priority]}20`,
              color: PRIORITY_COLORS[task.priority],
            }}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
        </div>
      </div>

      {!isEditing && (
        <>
          <button
            onClick={startEditing}
            className="rounded p-1 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted hover:text-foreground"
            title="编辑任务"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => void deleteTask(task.id)}
            className="rounded p-1 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
            title="删除任务"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
