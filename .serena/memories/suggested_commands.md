# Liao Tools 建议命令

## 开发相关

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```
应用将在开发模式下运行，前端服务运行在 `http://localhost:1420`

### 预览生产构建
```bash
npm run preview
```

## 构建相关

### 构建 Tauri 应用
```bash
npm run tauri build
```
将生成可执行文件到 `src-tauri/target/release/bundle`

### 开发模式构建（仅前端）
```bash
npm run build
```
运行 TypeScript 编译和 Vite 构建

## Tauri 相关

### Tauri CLI（通过 npm script）
```bash
npm run tauri [command]
```

常用命令：
- `npm run tauri dev` - 开发模式
- `npm run tauri build` - 构建生产版本
- `npm run tauri info` - 显示环境信息

## 类型检查

### TypeScript 类型检查
```bash
npx tsc --noEmit
```

检查类型错误但不生成文件，建议在开发时定期运行。

## UI 组件管理

### 添加新的 shadcn/ui 组件
```bash
npx shadcn-ui@latest add [component-name]
```

示例：
```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
```

## Git 相关

### 查看状态
```bash
git status
```

### 添加更改
```bash
git add .
```

### 提交更改
```bash
git commit -m "commit message"
```

### 推送到远程
```bash
git push
```

### 查看日志
```bash
git log
```

## 文件系统相关（Darwin/macOS）

### 列出文件
```bash
ls
ls -la  # 显示隐藏文件
```

### 切换目录
```bash
cd directory-name
```

### 查看当前目录
```bash
pwd
```

### 搜索文件
```bash
find . -name "filename"
```

### 搜索文件内容
```bash
grep "pattern" filename
grep -r "pattern" .  # 递归搜索
```

## 系统工具

### 查看进程
```bash
ps aux
```

### 查看端口占用
```bash
lsof -i :1420
```

### 杀死进程
```bash
kill [PID]
kill -9 [PID]  # 强制杀死
```

## 调试相关

### 查看网络请求
开发模式下按 `F12` 打开 Chrome DevTools，使用 Network 面板查看。

### 查看 Rust 日志
```bash
cd src-tauri
RUST_LOG=debug cargo tauri dev
```

### 检查 Tauri 配置
```bash
cat src-tauri/tauri.conf.json
```

## 常用开发流程

### 添加新功能流程
1. 创建模块目录: `mkdir -p src/features/newmodule/components`
2. 创建主页面组件
3. 在 `src/App.tsx` 中添加路由
4. 在侧边栏 `src/components/layout/Sidebar.tsx` 中添加导航项

### 类型检查流程
1. 修改代码后运行 `npx tsc --noEmit`
2. 修复类型错误
3. 运行 `npm run dev` 测试

### 构建前检查清单
- [ ] 运行 `npx tsc --noEmit` 确保无类型错误
- [ ] 测试功能是否正常
- [ ] 检查是否有未使用的代码
- [ ] 运行 `npm run tauri build`
