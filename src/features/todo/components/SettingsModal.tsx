import { useEffect, useMemo, useState } from 'react';
import { X, Keyboard, Monitor, Palette, Pencil } from 'lucide-react';
import { useTodoStore } from '../store/todoStore';
import type { TodoConfig } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { isMac } from '@/lib/platform';

interface SettingsModalProps {
  onClose: () => void;
}

const MODIFIER_TOKENS = new Set([
  'commandorcontrol',
  'cmdorctrl',
  'control',
  'ctrl',
  'command',
  'cmd',
  'super',
  'meta',
  'alt',
  'option',
  'shift',
]);

const HOTKEY_LABELS = {
  toggle: '切换显示',
  togglePin: '置顶/取消置顶',
  quickAdd: '快速添加任务',
} as const;

type HotkeyField = keyof typeof HOTKEY_LABELS;

const MODIFIER_ORDER = ['CommandOrControl', 'Alt', 'Shift'] as const;

const normalizeEventKey = (key: string): string | null => {
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();
  if (/^F([1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  if (key === ' ') return 'Space';
  return null;
};

const formatShortcutForDisplay = (shortcut: string): string =>
  shortcut
    .split('+')
    .map((segment) => {
      const normalized = segment.trim().toLowerCase();
      switch (normalized) {
        case 'commandorcontrol':
        case 'cmdorctrl':
          return isMac() ? 'Cmd' : 'Ctrl';
        case 'control':
        case 'ctrl':
          return 'Ctrl';
        case 'command':
        case 'cmd':
        case 'super':
        case 'meta':
          return 'Cmd';
        case 'alt':
        case 'option':
          return 'Alt';
        case 'shift':
          return 'Shift';
        case 'space':
          return 'Space';
        default:
          return segment.toUpperCase();
      }
    })
    .join(' + ');

const buildShortcutFromKeyboardEvent = (
  event: React.KeyboardEvent<HTMLButtonElement>
): string | null => {
  const modifiers: string[] = [];

  if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;

  const mainKey = normalizeEventKey(event.key);
  if (!mainKey || modifiers.length === 0) return '';

  const orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier));
  return [...orderedModifiers, mainKey].join('+');
};

const normalizeShortcut = (shortcut: string): string =>
  shortcut
    .trim()
    .split('+')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean)
    .map((segment) => {
      switch (segment) {
        case 'cmd':
        case 'command':
        case 'super':
        case 'meta':
          return 'super';
        case 'ctrl':
        case 'control':
          return 'control';
        case 'commandorcontrol':
        case 'cmdorctrl':
          return 'commandorcontrol';
        case 'option':
          return 'alt';
        default:
          return segment;
      }
    })
    .sort()
    .join('+');

const validateShortcut = (shortcut: string): string | null => {
  const tokens = shortcut
    .trim()
    .split('+')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (tokens.length < 2) return '至少需要一个修饰键和一个主按键';

  const modifiers = tokens.filter((token) => MODIFIER_TOKENS.has(token.toLowerCase()));
  const keys = tokens.filter((token) => !MODIFIER_TOKENS.has(token.toLowerCase()));

  if (modifiers.length === 0) return '至少需要一个修饰键，例如 Ctrl、Alt、Shift';
  if (keys.length !== 1) return '必须且只能有一个主按键';

  const mainKey = keys[0];
  if (!/^[a-z0-9]+$/i.test(mainKey) && !/^f([1-9]|1[0-2])$/i.test(mainKey)) {
    return '主按键仅支持字母、数字或 F1-F12';
  }

  return null;
};

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { config, error, updateConfig, updateWidgetOpacity } = useTodoStore();
  const widgetConfig = config.widget || DEFAULT_CONFIG.widget;
  const hotkeysConfig = config.hotkeys || DEFAULT_CONFIG.hotkeys;
  const modifierLabel = isMac() ? 'Cmd' : 'Ctrl';
  const [draftHotkeys, setDraftHotkeys] = useState(hotkeysConfig);
  const [editingHotkey, setEditingHotkey] = useState<HotkeyField | null>(null);
  // Store already exposes the persistence error; avoid unhandled rejections from UI events.
  const saveWidgetConfig = (updates: Partial<TodoConfig>) => {
    void updateConfig(updates).catch(() => undefined);
  };
  const saveWidgetOpacity = (opacity: number) => {
    void updateWidgetOpacity(opacity).catch(() => undefined);
  };

  useEffect(() => {
    setDraftHotkeys(hotkeysConfig);
  }, [hotkeysConfig]);

  const hotkeyErrors = useMemo(
    () =>
      (Object.keys(HOTKEY_LABELS) as HotkeyField[]).reduce<Record<string, string>>((acc, key) => {
        const message = validateShortcut(draftHotkeys[key]);
        if (message) acc[key] = message;
        return acc;
      }, {}),
    [draftHotkeys]
  );

  const hotkeyConflicts = useMemo(() => {
    const normalizedHotkeys = (Object.keys(HOTKEY_LABELS) as HotkeyField[]).reduce<Record<string, string>>(
      (acc, key) => {
        acc[key] = normalizeShortcut(draftHotkeys[key]);
        return acc;
      },
      {}
    );

    const conflicts: string[] = [];
    const seenShortcuts = new Map<string, string>();

    (Object.keys(HOTKEY_LABELS) as HotkeyField[]).forEach((key) => {
      if (hotkeyErrors[key] || !normalizedHotkeys[key]) return;
      const conflictLabel = seenShortcuts.get(normalizedHotkeys[key]);
      if (conflictLabel) {
        conflicts.push(`${HOTKEY_LABELS[key]} 与 ${conflictLabel} 使用了相同快捷键`);
        return;
      }
      seenShortcuts.set(normalizedHotkeys[key], HOTKEY_LABELS[key]);
    });

    return conflicts;
  }, [draftHotkeys, hotkeyErrors]);

  const handleHotkeyChange = (key: HotkeyField, value: string) => {
    setDraftHotkeys((current) => ({ ...current, [key]: value }));
  };

  const handleHotkeyRecording = (key: HotkeyField, event: React.KeyboardEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (event.key === 'Escape') {
      setEditingHotkey(null);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      handleHotkeyChange(key, '');
      setEditingHotkey(null);
      return;
    }

    const shortcut = buildShortcutFromKeyboardEvent(event);
    if (!shortcut) return;

    handleHotkeyChange(key, shortcut);
    setEditingHotkey(null);
  };

  const handleSaveHotkeys = async () => {
    if (Object.keys(hotkeyErrors).length > 0 || hotkeyConflicts.length > 0) return;

    await updateConfig({
      hotkeys: {
        toggle: draftHotkeys.toggle.trim() || DEFAULT_CONFIG.hotkeys.toggle,
        togglePin: draftHotkeys.togglePin.trim() || DEFAULT_CONFIG.hotkeys.togglePin,
        quickAdd: draftHotkeys.quickAdd.trim() || DEFAULT_CONFIG.hotkeys.quickAdd,
      },
    });
  };

  const handleResetHotkeys = async () => {
    setDraftHotkeys(DEFAULT_CONFIG.hotkeys);
    await updateConfig({ hotkeys: DEFAULT_CONFIG.hotkeys });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
        {error && <p role="alert" className="m-3 rounded-lg border border-danger bg-danger-subtle p-3 text-sm text-danger-fg">{error}</p>}
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">Todo 设置</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <div>
            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <Palette className="h-4 w-4 text-muted-foreground" />
              外观
            </label>
            <p className="rounded-lg bg-muted p-3 text-sm leading-6 text-muted-foreground">
              桌面小部件跟随应用主题与深浅色模式，在「偏好设置」中调整后实时联动。
            </p>
          </div>

          <div>
            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              桌面小部件
            </label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">透明度</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.05"
                    value={widgetConfig.opacity}
                    onChange={(event) => saveWidgetOpacity(parseFloat(event.target.value))}
                    className="w-24 accent-primary"
                  />
                  <span className="w-10 text-xs text-muted-foreground">{Math.round(widgetConfig.opacity * 100)}%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">窗口宽度</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="200"
                    max="600"
                    step="10"
                    value={widgetConfig.width}
                    onChange={(event) =>
                      saveWidgetConfig({
                        widget: { ...widgetConfig, width: parseInt(event.target.value, 10) || 320 },
                      })
                    }
                    className="w-20 rounded border border-border bg-background px-2 py-1 text-center text-sm text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">px</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">窗口高度</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="200"
                    max="800"
                    step="10"
                    value={widgetConfig.height}
                    onChange={(event) =>
                      saveWidgetConfig({
                        widget: { ...widgetConfig, height: parseInt(event.target.value, 10) || 400 },
                      })
                    }
                    className="w-20 rounded border border-border bg-background px-2 py-1 text-center text-sm text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">px</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <Keyboard className="h-4 w-4 text-muted-foreground" />
              快捷键
            </label>
            <div className="space-y-3">
              {(Object.keys(HOTKEY_LABELS) as HotkeyField[]).map((key) => (
                <div key={key} className="grid gap-2">
                  <span className="text-sm text-foreground">{HOTKEY_LABELS[key]}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingHotkey(key)}
                      onKeyDown={(event) => handleHotkeyRecording(key, event)}
                      onBlur={() => {
                        if (editingHotkey === key) setEditingHotkey(null);
                      }}
                      autoFocus={editingHotkey === key}
                      className={`flex-1 rounded border bg-muted px-3 py-2 text-left font-mono text-sm text-foreground transition-colors ${
                        editingHotkey === key ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                      }`}
                    >
                      {editingHotkey === key
                        ? '按下快捷键...'
                        : formatShortcutForDisplay(
                            draftHotkeys[key] ||
                              `${modifierLabel}+Alt+${key === 'toggle' ? 'T' : key === 'togglePin' ? 'P' : 'N'}`
                          )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHotkey(key)}
                      className="rounded border border-border bg-muted p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="编辑快捷键"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  {hotkeyErrors[key] && <p className="text-xs text-destructive">{hotkeyErrors[key]}</p>}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              点击编辑图标后直接按下组合键。支持字母、数字、F1-F12，`Backspace/Delete` 可清空，`Esc` 取消录制。
            </p>
            {hotkeyConflicts.length > 0 && (
              <div className="mt-2 space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                {hotkeyConflicts.map((conflict) => (
                  <p key={conflict} className="text-xs text-destructive">{conflict}</p>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => void handleResetHotkeys().catch(() => undefined)}
                className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/80"
              >
                恢复默认
              </button>
              <button
                onClick={() => void handleSaveHotkeys().catch(() => undefined)}
                disabled={Object.keys(hotkeyErrors).length > 0 || hotkeyConflicts.length > 0}
                className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                保存快捷键
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
