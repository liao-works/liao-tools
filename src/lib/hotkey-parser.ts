/**
 * 快捷键解析器
 */

export interface ParsedHotkey {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean; // Command (Mac) or Win (Windows)
}

/**
 * 解析快捷键字符串
 * @param hotkey - 快捷键字符串，如 "Ctrl+Alt+1" 或 "Command+S"
 */
export function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey.toLowerCase().split('+').map(p => p.trim());

  const result: ParsedHotkey = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        result.ctrl = true;
        break;
      case 'alt':
        result.alt = true;
        break;
      case 'shift':
        result.shift = true;
        break;
      case 'command':
      case 'cmd':
      case 'win':
      case 'super':
      case 'meta':
        result.meta = true;
        break;
      default:
        // 最后一个部分是按键
        result.key = part.toUpperCase();
    }
  }

  return result;
}

/**
 * 从键盘事件获取按下的快捷键字符串
 * @param event - 键盘事件
 */
export function getPressedKey(event: KeyboardEvent): string {
  const parts: string[] = [];

  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Command');

  // 处理特殊键
  const key = event.key.toUpperCase();

  // 避免重复添加修饰键
  if (
    key !== 'CONTROL' &&
    key !== 'ALT' &&
    key !== 'SHIFT' &&
    key !== 'META'
  ) {
    parts.push(key);
  }

  return parts.join('+');
}

/**
 * 格式化快捷键用于显示
 * @param hotkey - 快捷键字符串
 */
export function formatHotkeyForDisplay(hotkey: string): string {
  return hotkey
    .replace(/command/gi, '⌘')
    .replace(/ctrl/gi, 'Ctrl')
    .replace(/alt/gi, 'Alt')
    .replace(/shift/gi, '⇧')
    .replace(/win/gi, '⊞')
    .replace(/\+/g, ' + ');
}

/**
 * 将快捷键转换为 Tauri 全局快捷键格式
 * @param hotkey - 快捷键字符串
 */
export function formatHotkeyForTauri(hotkey: string): string {
  const parsed = parseHotkey(hotkey);

  const modifiers: string[] = [];
  if (parsed.ctrl) modifiers.push('Ctrl');
  if (parsed.alt) modifiers.push('Alt');
  if (parsed.shift) modifiers.push('Shift');
  if (parsed.meta) {
    // 在 macOS 上是 Command，在 Windows/Linux 上是 Super
    modifiers.push(isMac() ? 'Command' : 'Super');
  }

  return [...modifiers, parsed.key].join('+');
}

/**
 * 检测当前平台是否为 macOS
 */
export function isMac(): boolean {
  return typeof window !== 'undefined' &&
    window.navigator.userAgent.includes('Mac');
}

/**
 * 验证快捷键是否有效
 * @param hotkey - 快捷键字符串
 */
export function isValidHotkey(hotkey: string): boolean {
  try {
    const parsed = parseHotkey(hotkey);
    return parsed.key.length > 0;
  } catch {
    return false;
  }
}

/**
 * 比较两个快捷键是否相同
 */
export function isSameHotkey(hotkey1: string, hotkey2: string): boolean {
  const p1 = parseHotkey(hotkey1);
  const p2 = parseHotkey(hotkey2);

  return (
    p1.ctrl === p2.ctrl &&
    p1.alt === p2.alt &&
    p1.shift === p2.shift &&
    p1.meta === p2.meta &&
    p1.key === p2.key
  );
}
