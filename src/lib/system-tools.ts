import { invoke } from '@tauri-apps/api/core';
import type { LaunchToolResult, SystemTool } from '@/types';
import {
  Activity,
  Calculator,
  FileText,
  Folder,
  Paintbrush,
  Settings,
  Terminal,
} from 'lucide-react';

// 图标映射
const iconMap: Record<string, any> = {
  calculator: Calculator,
  notepad: FileText,
  paintbrush: Paintbrush,
  settings: Settings,
  terminal: Terminal,
  activity: Activity,
  folder: Folder,
};

/**
 * 获取图标组件
 */
export function getIconComponent(iconName: string) {
  return iconMap[iconName] || Settings;
}

/**
 * 获取当前平台
 */
function getCurrentPlatform(): 'windows' | 'macos' | 'linux' {
  const platform = window.navigator.userAgent.toLowerCase();
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('linux')) return 'linux';
  return 'windows';
}

/**
 * 获取可用工具列表（客户端缓存版本）
 */
export function getAvailableTools(): SystemTool[] {
  const platform = getCurrentPlatform();

  // Windows 工具列表
  const windowsTools: SystemTool[] = [
    {
      id: 'calculator',
      name: '计算器',
      description: '执行基本和科学计算',
      icon: 'calculator',
      category: 'utility',
      platform: ['windows'],
      enabled: true,
      command: 'calc.exe',
      hotkey: 'Ctrl+Alt+C',
    },
    {
      id: 'notepad',
      name: '记事本',
      description: '文本编辑器',
      icon: 'notepad',
      category: 'utility',
      platform: ['windows'],
      enabled: true,
      command: 'notepad.exe',
      hotkey: 'Ctrl+Alt+N',
    },
    {
      id: 'paint',
      name: '画图',
      description: '图像编辑和绘制',
      icon: 'paintbrush',
      category: 'media',
      platform: ['windows'],
      enabled: true,
      command: 'mspaint.exe',
    },
    {
      id: 'taskmgr',
      name: '任务管理器',
      description: '监控和管理系统进程',
      icon: 'activity',
      category: 'system',
      platform: ['windows'],
      enabled: true,
      command: 'taskmgr.exe',
      hotkey: 'Ctrl+Shift+Esc',
    },
    {
      id: 'settings',
      name: '系统设置',
      description: 'Windows 设置',
      icon: 'settings',
      category: 'system',
      platform: ['windows'],
      enabled: true,
      command: 'cmd',
      args: ['/c', 'start', 'ms-settings:'],
      hotkey: 'Win+I',
    },
    {
      id: 'explorer',
      name: '文件资源管理器',
      description: '浏览文件和文件夹',
      icon: 'folder',
      category: 'system',
      platform: ['windows'],
      enabled: true,
      command: 'explorer.exe',
      hotkey: 'Win+E',
    },
  ];

  // macOS 工具列表
  const macosTools: SystemTool[] = [
    {
      id: 'calculator',
      name: '计算器',
      description: '执行基本和科学计算',
      icon: 'calculator',
      category: 'utility',
      platform: ['macos'],
      enabled: true,
      command: 'open',
      args: ['-a', 'Calculator'],
      hotkey: 'Command+Space',
    },
    {
      id: 'notes',
      name: '备忘录',
      description: '笔记和文本编辑',
      icon: 'notepad',
      category: 'utility',
      platform: ['macos'],
      enabled: true,
      command: 'open',
      args: ['-a', 'Notes'],
      hotkey: 'Command+Space',
    },
    {
      id: 'activity-monitor',
      name: '活动监视器',
      description: '监控和管理系统进程',
      icon: 'activity',
      category: 'system',
      platform: ['macos'],
      enabled: true,
      command: 'open',
      args: ['-a', 'Activity Monitor'],
    },
    {
      id: 'system-preferences',
      name: '系统偏好设置',
      description: 'macOS 系统设置',
      icon: 'settings',
      category: 'system',
      platform: ['macos'],
      enabled: true,
      command: 'open',
      args: ['-a', 'System Preferences'],
      hotkey: 'Command+,',
    },
    {
      id: 'finder',
      name: '访达',
      description: '浏览文件和文件夹',
      icon: 'folder',
      category: 'system',
      platform: ['macos'],
      enabled: true,
      command: 'open',
      args: ['-a', 'Finder'],
      hotkey: 'Command+N',
    },
    {
      id: 'safari',
      name: 'Safari 浏览器',
      description: '网页浏览',
      icon: 'settings',
      category: 'utility',
      platform: ['macos'],
      enabled: true,
      command: 'open',
      args: ['-a', 'Safari'],
    },
  ];

  // Linux 工具列表
  const linuxTools: SystemTool[] = [
    {
      id: 'calculator',
      name: '计算器',
      description: '执行基本和科学计算',
      icon: 'calculator',
      category: 'utility',
      platform: ['linux'],
      enabled: true,
      command: 'gnome-calculator',
      hotkey: 'Ctrl+Alt+C',
    },
    {
      id: 'settings',
      name: '系统设置',
      description: '系统设置',
      icon: 'settings',
      category: 'system',
      platform: ['linux'],
      enabled: true,
      command: 'gnome-control-center',
    },
    {
      id: 'file-manager',
      name: '文件管理器',
      description: '浏览文件和文件夹',
      icon: 'folder',
      category: 'system',
      platform: ['linux'],
      enabled: true,
      command: 'nautilus',
      hotkey: 'Super+E',
    },
    {
      id: 'text-editor',
      name: '文本编辑器',
      description: '文本编辑器',
      icon: 'notepad',
      category: 'utility',
      platform: ['linux'],
      enabled: true,
      command: 'gedit',
    },
    {
      id: 'activity-monitor',
      name: '系统监视器',
      description: '监控和管理系统进程',
      icon: 'activity',
      category: 'system',
      platform: ['linux'],
      enabled: true,
      command: 'gnome-system-monitor',
    },
  ];

  // 根据平台返回相应的工具列表
  switch (platform) {
    case 'macos':
      return macosTools;
    case 'linux':
      return linuxTools;
    default:
      return windowsTools;
  }
}

/**
 * 启动系统工具
 */
export async function launchTool(toolId: string): Promise<LaunchToolResult> {
  try {
    const result = await invoke<LaunchToolResult>('launch_system_tool', { toolId });
    return result;
  } catch (error) {
    console.error('启动工具失败:', error);
    return {
      success: false,
      tool_id: toolId,
      message: '启动失败',
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 检查工具是否可用
 */
export async function checkToolAvailable(toolId: string): Promise<boolean> {
  try {
    return await invoke<boolean>('check_tool_available', { toolId });
  } catch (error) {
    console.error('检查工具可用性失败:', error);
    return false;
  }
}
