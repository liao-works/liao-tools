import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isSameDay, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ArrowRight, CalendarClock, CalendarPlus, Check, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MonthGrid, dayKey, type MonthMarker } from './MonthGrid';
import { useTodoStore } from '../store/todoStore';
import { PRIORITY_COLORS, type TodoTask } from '../types';
import { cn } from '@/lib/utils';

/** 首页右栏：待办日历（月历标记 + 选中日列表 + 无日期折叠条） */
export function HomeTodoCalendar() {
  const tasks = useTodoStore((s) => s.tasks);
  const initialized = useTodoStore((s) => s.initialized);
  const loadTasks = useTodoStore((s) => s.loadTasks);
  const addTask = useTodoStore((s) => s.addTask);
  const updateTask = useTodoStore((s) => s.updateTask);

  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [draft, setDraft] = useState('');
  const [undatedOpen, setUndatedOpen] = useState(false);

  useEffect(() => {
    if (!initialized) void loadTasks();
  }, [initialized, loadTasks]);

  const dated = useMemo(() => tasks.filter((t) => t.dueDate), [tasks]);
  const markers = useMemo(() => {
    const map: Record<string, MonthMarker> = {};
    for (const task of dated) {
      const key = dayKey(new Date(task.dueDate!));
      const entry = map[key] ?? { count: 0, dots: [] };
      entry.count += 1;
      if (task.status === 'pending') entry.dots.push(PRIORITY_COLORS[task.priority]);
      map[key] = entry;
    }
    return map;
  }, [dated]);

  const selectedDay = startOfDay(selected);
  const selectedTasks = useMemo(
    () => dated.filter((t) => isSameDay(new Date(t.dueDate!), selectedDay)),
    [dated, selectedDay],
  );
  const undatedTasks = useMemo(() => tasks.filter((t) => !t.dueDate), [tasks]);

  const submitDraft = async () => {
    const title = draft.trim();
    if (!title) return;
    await addTask(title, 'medium', selectedDay.getTime());
    setDraft('');
  };

  const hoverList = (day: Date) => {
    const items = dated.filter((t) => isSameDay(new Date(t.dueDate!), day));
    return (
      <div>
        <p className="mb-1.5 text-xs font-medium">
          {format(day, 'M月d日 EEEE', { locale: zhCN })} · {items.length} 条
        </p>
        {items.slice(0, 5).map((task) => (
          <p key={task.id} className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
            />
            <span className={cn('truncate', task.status === 'completed' && 'line-through opacity-60')}>
              {task.title}
            </span>
          </p>
        ))}
        {items.length > 5 && (
          <p className="mt-1 text-xs text-muted-foreground/70">还有 {items.length - 5} 条…点击日期查看全部</p>
        )}
      </div>
    );
  };

  return (
    <section className="lt-home-panel">
      <div className="lt-panel-heading">
        <div><CalendarClock size={18} /><h2>待办日历</h2></div>
        <Link to="/todo" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          管理待办 <ArrowRight size={14} />
        </Link>
      </div>

      <MonthGrid
        month={month}
        selected={selected}
        markers={markers}
        onMonthChange={setMonth}
        onSelect={setSelected}
        renderHover={hoverList}
      />

      {/* 选中日的待办列表（可操作） */}
      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium">{format(selectedDay, 'M月d日 EEEE', { locale: zhCN })}</span>
          <span className="text-muted-foreground">{selectedTasks.length} 条</span>
        </div>
        <div className="space-y-0.5">
          {selectedTasks.length === 0 && (
            <p className="py-1.5 text-xs text-muted-foreground/70">这一天还没有安排</p>
          )}
          {selectedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              extraAction={
                <Button
                  type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"
                  aria-label="改为无日期" title="取消到期日"
                  onClick={() => void updateTask(task.id, { dueDate: undefined })}
                >
                  <CalendarPlus size={13} className="rotate-45" />
                </Button>
              }
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitDraft(); }}
            placeholder={`新增到 ${format(selectedDay, 'M月d日')}，回车确认`}
            className="h-7 flex-1 text-xs"
          />
          <Button
            type="button" size="sm" variant="outline"
            className="h-7 shrink-0 px-2 text-xs" disabled={!draft.trim()} onClick={() => void submitDraft()}
          >
            添加
          </Button>
        </div>
      </div>

      {/* 无日期待办折叠条 */}
      {undatedTasks.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setUndatedOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown size={13} className={cn('transition-transform', undatedOpen && 'rotate-180')} />
            无日期待办 {undatedTasks.length} 条
          </button>
          {undatedOpen && (
            <div className="mt-1 space-y-0.5">
              {undatedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  extraAction={
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-6 w-6 text-muted-foreground" aria-label="排期到选中日"
                      title={`排期到 ${format(selectedDay, 'M月d日')}`}
                      onClick={() => void updateTask(task.id, { dueDate: selectedDay.getTime() })}
                    >
                      <CalendarPlus size={13} />
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, extraAction }: { task: TodoTask; extraAction?: React.ReactNode }) {
  const toggleTask = useTodoStore((s) => s.toggleTask);
  const deleteTask = useTodoStore((s) => s.deleteTask);
  const done = task.status === 'completed';
  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/50">
      <button
        type="button"
        aria-label={done ? '标记为未完成' : '标记为完成'}
        onClick={() => void toggleTask(task.id)}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          done ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary',
        )}
      >
        {done && <Check size={11} />}
      </button>
      <span className={cn('flex-1 truncate text-xs', done && 'text-muted-foreground line-through')}>
        {task.title}
      </span>
      {extraAction}
      <Button
        type="button" variant="ghost" size="icon"
        className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        aria-label="删除待办"
        onClick={() => void deleteTask(task.id)}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}
