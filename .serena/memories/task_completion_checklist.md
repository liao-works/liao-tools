# Liao Tools 任务完成检查清单

## 每个任务完成后必须执行的检查

### 1. TypeScript 类型检查

**命令**:
```bash
npx tsc --noEmit
```

**说明**:
- 检查是否有类型错误
- 确保没有 `as any`、`@ts-ignore` 或 `@ts-expect-error`
- 修复所有类型错误

### 2. 开发服务器验证

**命令**:
```bash
npm run dev
```

**说明**:
- 启动开发服务器
- 访问 `http://localhost:1420`
- 测试修改的功能
- 确保没有运行时错误

### 3. 代码审查要点

#### 类型安全
- [ ] 无类型错误
- [ ] 没有使用 `as any`
- [ ] 没有使用 `@ts-ignore`
- [ ] 没有使用 `@ts-expect-error`

#### 代码风格
- [ ] 遵循命名约定（PascalCase for 组件，camelCase for 函数）
- [ ] 使用正确的导入路径（使用 `@` 别名）
- [ ] 组件使用命名导出而非默认导出
- [ ] Props 正确定义 TypeScript 类型

#### 功能完整性
- [ ] 实现了所有要求的功能
- [ ] 边界情况已处理
- [ ] 错误处理完善
- [ ] 用户体验良好

#### 性能考虑
- [ ] 避免不必要的重渲染
- [ ] 使用 `useMemo`、`useCallback` 优化（如适用）
- [ ] 列表渲染有 key 属性

## 特定任务类型的额外检查

### UI/样式修改

由于项目没有 ESLint/Prettier 配置，需要手动检查：

- [ ] Tailwind 类名语法正确
- [ ] 使用 `cn()` 合并类名
- [ ] 遵循主题系统（使用 `bg-background`、`text-primary` 等）
- [ ] 响应式设计正确
- [ ] 亮色和暗色主题都正常显示

**注意**: 如果是视觉/UI/UX 相关的修改，应该委托给 `frontend-ui-ux-engineer` agent。

### 添加新功能模块

- [ ] 创建了模块目录结构
- [ ] 主页面组件在 `src/features/[module]/[Module]Page.tsx`
- [ ] 私有组件在 `src/features/[module]/components/`
- [ ] 在 `src/App.tsx` 添加了路由
- [ ] 在 `src/components/layout/Sidebar.tsx` 添加了导航项
- [ ] 类型定义在 `src/types/index.ts`（如果需要）
- [ ] Mock 数据在 `src/mocks/`（如果需要）

### 添加新状态管理（Zustand）

- [ ] Store 文件在 `src/stores/` 目录
- [ ] 使用 `persist` 中间件（如需持久化）
- [ ] 类型定义完整
- [ ] 状态和操作逻辑清晰

### 修改类型定义

- [ ] 修改 `src/types/index.ts`
- [ ] 更新所有使用该类型的地方
- [ ] 运行类型检查确保无错误

### Mock 数据修改

- [ ] Mock 函数在 `src/mocks/` 目录
- [ ] 返回的数据结构与真实 API 一致
- [ ] 使用 `delay()` 模拟网络延迟

## 构建和部署前检查

### 完整构建测试

**命令**:
```bash
npm run build
```

**说明**:
- 运行 TypeScript 编译
- 运行 Vite 构建
- 确保构建成功无错误

### Tauri 应用构建（如果需要）

**命令**:
```bash
npm run tauri build
```

**说明**:
- 构建 Tauri 应用
- 测试生成的可执行文件

## Git 提交前检查（仅在用户请求提交时）

**注意**: 只有用户明确要求时才执行 git 提交，不要自动提交。

检查项目：
- [ ] 代码已完成并测试
- [ ] 类型检查通过
- [ ] 开发服务器运行正常
- [ ] 没有调试代码（console.log 等）
- [ ] 没有临时文件或注释掉的代码
- [ ] 提交消息清晰描述更改

**提交命令**:
```bash
git add .
git commit -m "描述更改"
git push
```

## 任务完成标准

一个任务被认为完成需要满足：

1. ✅ 所有类型检查通过（`npx tsc --noEmit`）
2. ✅ 功能在开发服务器中正常工作
3. ✅ 没有类型错误或运行时错误
4. ✅ 代码遵循项目约定和风格
5. ✅ 相关文档已更新（如适用）
6. ✅ 如果是 UI 修改，委托给 `frontend-ui-ux-engineer` 完成

## 常见问题排查

### TypeScript 错误
- 检查导入路径是否正确
- 检查类型定义是否完整
- 检查是否有未处理的 null/undefined
- 使用 `lsp_diagnostics` 工具检查具体错误

### 运行时错误
- 检查浏览器控制台
- 检查 Tauri 控制台（如果相关）
- 检查网络请求
- 验证数据流和状态管理

### 构建失败
- 检查所有依赖是否已安装
- 检查 TypeScript 配置
- 检查 Vite 配置
- 检查是否有路径别名问题
