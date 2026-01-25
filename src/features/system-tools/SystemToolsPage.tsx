import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, Grid3x3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { SystemToolCard } from './components/SystemToolCard';
import { ToolCategoryFilter } from './components/ToolCategoryFilter';
import { ToolEditDialog } from './components/ToolEditDialog';
import { ToolManager } from './components/ToolManager';
import {
  DisplayTool,
  LaunchToolResult,
  RecentProgram,
  ToolCategory,
  UserTool,
  CreateUserToolRequest,
  UpdateUserToolRequest,
} from '@/types';
import { launchTool as launchSystemTool } from '@/lib/system-tools';
import { getPressedKey } from '@/lib/hotkey-parser';

export function SystemToolsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'manage'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [tools, setTools] = useState<DisplayTool[]>([]);
  const [recentPrograms, setRecentPrograms] = useState<RecentProgram[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<DisplayTool | null>(null);
  const { toast } = useToast();

  // 加载所有工具
  useEffect(() => {
    loadTools();
    loadRecentPrograms();
  }, []);

  // 应用内快捷键监听
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 忽略在输入框中的按键
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // 获取按下的快捷键
      const pressedKey = getPressedKey(event);

      // 查找匹配的工具（只处理应用内快捷键，不处理全局快捷键）
      const tool = tools.find(
        t => t.hotkey === pressedKey && t.enabled && !t.globalHotkey
      );

      if (tool) {
        event.preventDefault();
        handleLaunchTool(tool);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tools]);

  const loadTools = async () => {
    try {
      console.log('开始加载工具...');
      // 尝试调用 get_all_tools，如果失败则回退到 get_system_tools
      let allTools: any[];
      try {
        allTools = await invoke<any[]>('get_all_tools');
        console.log('使用 get_all_tools 加载');
        console.log('后端返回的工具数量:', allTools.length);
        console.log('后端返回的工具数据:', allTools);
      } catch (e) {
        console.warn('get_all_tools 失败，回退到 get_system_tools:', e);
        // 回退到旧的系统工具加载方式
        const systemTools = await invoke<any[]>('get_system_tools');
        allTools = systemTools.map((tool: any) => ({
          ...tool,
          tool_type: 'system',
        }));
        console.log('使用 get_system_tools 加载');
      }

      // 将后端返回的 DisplayTool 转换为前端格式
      const displayTools: DisplayTool[] = allTools.map((tool) => {
        console.log('处理工具:', tool);
        return {
          type: tool.tool_type as 'system' | 'custom',
          id: tool.id,
          name: tool.name,
          description: tool.description,
          icon: tool.icon,
          category: tool.category as ToolCategory,
          platform: tool.platform,
          enabled: tool.enabled,
          command: tool.command,
          executablePath: tool.executable_path,
          args: tool.args,
          arguments: tool.arguments,
          hotkey: tool.hotkey,
          order: tool.order,
        };
      });

      console.log('转换后的工具列表:', displayTools);
      console.log('设置工具状态...');
      setTools(displayTools);
      console.log('工具状态已设置');
    } catch (error) {
      console.error('加载工具失败:', error);
      console.error('错误详情:', JSON.stringify(error, null, 2));
      toast({
        title: '加载失败',
        description: error instanceof Error ? error.message : JSON.stringify(error),
        variant: 'destructive',
      });
    }
  };

  const loadRecentPrograms = async () => {
    try {
      const recent = await invoke<RecentProgram[]>('get_recent_programs', { limit: 5 });
      setRecentPrograms(recent);
    } catch (error) {
      console.error('加载最近使用失败:', error);
    }
  };

  // 过滤工具
  const filteredTools = tools.filter(tool => {
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // 处理工具启动
  const handleLaunchTool = async (tool: DisplayTool) => {
    setIsLoading(true);
    try {
      let result: LaunchToolResult;

      if (tool.type === 'system') {
        result = await launchSystemTool(tool.id);
      } else {
        result = await invoke<LaunchToolResult>('launch_custom_tool', {
          id: parseInt(tool.id.replace('custom_', '')),
        });
      }

      if (result.success) {
        toast({
          title: '启动成功',
          description: `${tool.name} 已成功启动`,
        });
        // 重新加载最近使用
        loadRecentPrograms();
      } else {
        toast({
          title: '启动失败',
          description: result.error || '未知错误',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '启动失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 处理添加工具
  const handleAddTool = async (data: CreateUserToolRequest | UpdateUserToolRequest) => {
    try {
      console.log('开始保存工具:', data);

      if ('id' in data) {
        await invoke('update_user_tool', { req: data });
        console.log('更新工具成功');
      } else {
        await invoke('add_user_tool', { req: data });
        console.log('添加工具成功');
      }

      toast({
        title: '保存成功',
        description: '工具已保存',
      });

      console.log('开始重新加载工具列表...');
      await loadTools();
      console.log('工具列表重新加载完成');
    } catch (error) {
      console.error('保存失败:', error);
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // 处理删除工具
  const handleDeleteTool = async (tool: DisplayTool) => {
    if (!confirm(`确定要删除工具"${tool.name}"吗？`)) {
      return;
    }

    try {
      await invoke('delete_user_tool', {
        id: parseInt(tool.id.replace('custom_', '')),
      });
      toast({
        title: '删除成功',
        description: '工具已删除',
      });
      loadTools();
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  // 处理切换工具启用状态
  const handleToggleTool = async (tool: DisplayTool) => {
    if (tool.type === 'system') {
      toast({
        title: '系统工具',
        description: '系统工具无法禁用',
        variant: 'destructive',
      });
      return;
    }

    try {
      const updateData: UpdateUserToolRequest = {
        id: parseInt(tool.id.replace('custom_', '')),
        name: tool.name,
        description: tool.description,
        icon: tool.icon,
        executablePath: tool.executablePath!,
        arguments: tool.arguments,
        workingDirectory: (tool as any).workingDirectory || '',
        category: tool.category,
        hotkey: tool.hotkey,
        enabled: !tool.enabled,
      };
      await invoke('update_user_tool', { req: updateData });
      loadTools();
    } catch (error) {
      toast({
        title: '操作失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  // 处理启动最近使用的程序
  const handleLaunchRecent = async (path: string, name: string) => {
    try {
      await invoke('record_program_launch', { path, name });
      toast({
        title: '启动成功',
        description: `${name} 已启动`,
      });
      loadRecentPrograms();
    } catch (error) {
      toast({
        title: '启动失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">系统工具</h2>
          <p className="text-muted-foreground">快速启动系统工具和自定义程序</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            onClick={() => setViewMode('grid')}
            title="网格视图"
          >
            <Grid3x3 className="h-4 w-4 mr-2" />
            网格
          </Button>
          {/* 暂时隐藏管理模式和添加工具按钮
          <Button
            variant={viewMode === 'manage' ? 'default' : 'outline'}
            onClick={() => setViewMode('manage')}
            title="管理模式"
          >
            <List className="h-4 w-4 mr-2" />
            管理
          </Button>
          <Button onClick={() => { setSelectedTool(null); setEditDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            添加工具
          </Button>
          */}
        </div>
      </div>

      {/* 最近使用 */}
      {recentPrograms.length > 0 && viewMode === 'grid' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">最近使用</h3>
            </div>
            <div className="flex gap-2 flex-wrap">
              {recentPrograms.map(program => (
                <Badge
                  key={program.path}
                  variant="secondary"
                  className="cursor-pointer hover:bg-secondary/80"
                  onClick={() => handleLaunchRecent(program.path, program.name)}
                >
                  {program.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 搜索栏 */}
      {viewMode === 'grid' && (
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索工具..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <ToolCategoryFilter
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </div>
      )}

      {/* 工具网格 */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTools.map(tool => (
            <SystemToolCard
              key={tool.id}
              tool={tool}
              onLaunch={handleLaunchTool}
              disabled={isLoading}
            />
          ))}
        </div>
      )}

      {/* 工具管理 */}
      {viewMode === 'manage' && (
        <ToolManager
          tools={tools}
          onUpdate={loadTools}
          onEdit={(tool) => { setSelectedTool(tool); setEditDialogOpen(true); }}
          onDelete={handleDeleteTool}
          onToggle={handleToggleTool}
        />
      )}

      {/* 空状态 */}
      {filteredTools.length === 0 && viewMode === 'grid' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">未找到匹配的工具</p>
          </CardContent>
        </Card>
      )}

      {/* 编辑对话框 */}
      <ToolEditDialog
        tool={selectedTool as UserTool | null}
        open={editDialogOpen}
        onSave={handleAddTool}
        onCancel={() => { setEditDialogOpen(false); setSelectedTool(null); }}
      />
    </div>
  );
}
