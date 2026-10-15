import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Grid3x3, List, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { SystemToolCard } from './components/SystemToolCard';
import { ToolCategoryFilter } from './components/ToolCategoryFilter';
import { ToolEditDialog } from './components/ToolEditDialog';
import { ToolManager } from './components/ToolManager';
import type {
  DisplayTool, LaunchToolResult, RecentProgram, ToolCategory,
  CreateUserToolRequest, UpdateUserToolRequest,
} from '@/types';
import { launchTool as launchSystemTool } from '@/lib/system-tools';
import { getPressedKey } from '@/lib/hotkey-parser';

interface BackendTool {
  tool_type?: 'system' | 'custom';
  type?: 'system' | 'custom';
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: ToolCategory;
  platform?: string[];
  enabled?: boolean;
  command?: string;
  executable_path?: string;
  args?: string[];
  arguments?: string;
  hotkey?: string;
  order?: number;
  global_hotkey?: boolean;
  working_directory?: string;
}

function toDisplayTool(tool: BackendTool): DisplayTool {
  return {
    type: tool.tool_type || tool.type || 'system',
    id: tool.id,
    name: tool.name,
    description: tool.description || '',
    icon: tool.icon || 'settings',
    category: tool.category || 'custom',
    platform: tool.platform || [],
    enabled: tool.enabled !== false,
    command: tool.command,
    executablePath: tool.executable_path,
    args: tool.args,
    arguments: tool.arguments,
    hotkey: tool.hotkey,
    order: tool.order,
    globalHotkey: tool.global_hotkey,
    workingDirectory: tool.working_directory,
  };
}

function toCustomId(tool: DisplayTool): number {
  return Number(tool.id.replace(/^custom_/, ''));
}

export function SystemToolsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'manage'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [tools, setTools] = useState<DisplayTool[]>([]);
  const [recentPrograms, setRecentPrograms] = useState<RecentProgram[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<DisplayTool | null>(null);
  const { toast } = useToast();

  const loadTools = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let all: BackendTool[];
      try {
        all = await invoke<BackendTool[]>('get_all_tools');
      } catch {
        const system = await invoke<BackendTool[]>('get_system_tools');
        all = system.map((tool) => ({ ...tool, tool_type: 'system' }));
      }
      setTools(all.map(toDisplayTool));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentPrograms = useCallback(async () => {
    try {
      setRecentPrograms(await invoke<RecentProgram[]>('get_recent_programs', { limit: 5 }));
    } catch {
      // Recent activity is optional; tool launching does not depend on it.
      setRecentPrograms([]);
    }
  }, []);

  useEffect(() => {
    void loadTools();
    void loadRecentPrograms();
  }, [loadTools, loadRecentPrograms]);

  async function launch(tool: DisplayTool) {
    if (launchingId || !tool.enabled) return;
    setLaunchingId(tool.id);
    try {
      const result: LaunchToolResult = tool.type === 'system'
        ? await launchSystemTool(tool.id)
        : await invoke<LaunchToolResult>('launch_custom_tool', { id: toCustomId(tool) });

      if (!result.success) {
        toast({ title: '启动失败', description: result.error || result.message || '命令未能启动', variant: 'destructive' });
        return;
      }
      toast({ title: '启动命令已执行', description: tool.name });
      void loadRecentPrograms();
    } catch (error) {
      toast({
        title: '启动失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLaunchingId(null);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        editDialogOpen || event.repeat || target?.closest('[role="dialog"]') ||
        target?.closest('input, textarea, select, button, a, [contenteditable="true"]')
      ) return;
      const pressed = getPressedKey(event);
      const tool = tools.find((item) => item.hotkey === pressed && item.enabled && !item.globalHotkey);
      if (!tool || launchingId) return;
      event.preventDefault();
      void launch(tool);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tools, launchingId, editDialogOpen]);

  async function saveTool(data: CreateUserToolRequest | UpdateUserToolRequest) {
    try {
      if ('id' in data) {
        await invoke('update_user_tool', { req: data });
      } else {
        await invoke('add_user_tool', { req: data });
      }
      toast({ title: '工具已保存' });
      await loadTools();
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
      throw error;
    }
  }

  async function deleteTool(tool: DisplayTool) {
    if (tool.type !== 'custom' || !window.confirm('删除自定义工具“' + tool.name + '”？')) return;
    try {
      await invoke('delete_user_tool', { id: toCustomId(tool) });
      toast({ title: '工具已删除' });
      await loadTools();
    } catch (error) {
      toast({ title: '删除失败', description: String(error), variant: 'destructive' });
    }
  }

  async function toggleTool(tool: DisplayTool) {
    if (tool.type !== 'custom') return;
    const req: UpdateUserToolRequest = {
      id: toCustomId(tool),
      name: tool.name,
      description: tool.description,
      icon: tool.icon,
      executablePath: tool.executablePath || '',
      arguments: tool.arguments,
      workingDirectory: tool.workingDirectory,
      category: tool.category,
      hotkey: tool.hotkey,
      enabled: !tool.enabled,
    };
    try {
      await invoke('update_user_tool', { req });
      await loadTools();
    } catch (error) {
      toast({ title: '更新工具失败', description: String(error), variant: 'destructive' });
    }
  }

  const filteredTools = tools.filter((tool) => {
    const term = searchQuery.trim().toLowerCase();
    const matchesQuery = !term || [tool.name, tool.description, tool.id].some((text) => text.toLowerCase().includes(term));
    return matchesQuery && (selectedCategory === 'all' || tool.category === selectedCategory);
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground-emphasis md:text-3xl">系统工具</h1>
          <p className="mt-2 text-sm text-muted-foreground">启动系统程序、管理自己的工具和快捷键。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('grid')}><Grid3x3 className="h-4 w-4" />工具列表</Button>
          <Button variant={viewMode === 'manage' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('manage')}><List className="h-4 w-4" />管理工具</Button>
          <Button variant="outline" size="sm" onClick={() => { setSelectedTool(null); setEditDialogOpen(true); }}><Plus className="h-4 w-4" />添加工具</Button>
        </div>
      </div>

      {viewMode === 'grid' && (
        <>
          {recentPrograms.length > 0 && (
            <Card className="shadow-none">
              <CardContent className="space-y-3 pt-5">
                <p className="text-sm font-semibold">最近使用</p>
                <div className="flex flex-wrap gap-2">
                  {recentPrograms.map((program) => (
                    <Badge key={program.path} variant="secondary" className="max-w-full truncate" title={program.path}>{program.name}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">此处仅展示真实使用历史，不将记录历史的命令伪装成程序启动。</p>
              </CardContent>
            </Card>
          )}
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索名称或描述" aria-label="搜索工具" className="pl-9" />
            </div>
            <ToolCategoryFilter selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} />
          </div>
        </>
      )}

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger bg-danger-subtle p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-danger-fg" />
          <span className="min-w-0 flex-1 break-words text-sm text-danger-fg">加载工具失败：{loadError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadTools()}><RefreshCw className="h-4 w-4" />重试加载</Button>
        </div>
      )}

      {loading && tools.length === 0 ? (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在加载系统工具…</p>
      ) : (
        <>
          {viewMode === 'grid' && (
            filteredTools.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredTools.map((tool) => (
                  <SystemToolCard key={tool.id} tool={tool} onLaunch={(item) => void launch(item)} disabled={!!launchingId} />
                ))}
              </div>
            ) : !loadError && (
              <Card className="shadow-none"><CardContent className="py-10 text-center text-sm text-muted-foreground">
                {tools.length ? '没有符合搜索条件的工具' : '目前没有可用工具'}
              </CardContent></Card>
            )
          )}
          {viewMode === 'manage' && (
            <ToolManager
              tools={tools}
              onUpdate={() => void loadTools()}
              onEdit={(tool) => { if (tool.type === 'custom') { setSelectedTool(tool); setEditDialogOpen(true); } }}
              onDelete={(tool) => void deleteTool(tool)}
              onToggle={(tool) => void toggleTool(tool)}
            />
          )}
        </>
      )}

      <ToolEditDialog
        tool={selectedTool}
        open={editDialogOpen}
        onSave={saveTool}
        onCancel={() => { setEditDialogOpen(false); setSelectedTool(null); }}
      />
    </div>
  );
}
