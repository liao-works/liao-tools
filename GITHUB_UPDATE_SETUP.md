# GitHub 自动更新配置说明

## 概述

Liao Tools 现在支持通过 GitHub Release 进行自动更新检查。系统会从您的 GitHub 仓库获取最新的 Release 信息并提示用户更新。

## 配置步骤

### 1. 设置 GitHub 仓库

更新功能已经配置为使用仓库：`liao-works/liao-tools`

### 2. 创建 GitHub Release

在 GitHub 上创建至少一个 Release：

1. 访问您的仓库：https://github.com/liao-works/liao-tools
2. 点击 "Releases"
3. 点击 "Draft a new release"
4. 填写标签版本（例如：`v0.1.0`）
5. 添加 Release 标题和说明
6. 点击 "Publish release"

### 3. 私有仓库配置（必需）

由于您的仓库是私有的，需要提供 GitHub Token 进行认证。

#### 方式一：开发环境设置 Token

在开发或运行应用时，设置环境变量：

**Windows (PowerShell):**
```powershell
$env:GITHUB_TOKEN="your_github_token_here"
npm run tauri dev
```

**Windows (CMD):**
```cmd
set GITHUB_TOKEN=your_github_token_here
npm run tauri dev
```

**Linux/Mac:**
```bash
export GITHUB_TOKEN="your_github_token_here"
npm run tauri dev
```

#### 方式二：生成 GitHub Token

1. 访问 GitHub Settings：https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 设置 Token 名称（例如：`liao-tools-updater`）
4. 选择权限：
   - ✅ `repo:status` (读取仓库状态)
   - ✅ `public_repo` (访问公开仓库信息)
   - 或直接选择 ✅ `repo` (完全控制私有仓库)
5. 点击 "Generate token"
6. 复制生成的 Token（只显示一次）

#### 方式三：打包发布时设置 Token

在打包应用时，可以通过以下方式设置：

**Windows 打包脚本:**
```powershell
$env:GITHUB_TOKEN="your_token"; pnpm tauri build
```

**在 .env 文件中（仅开发环境）:**
```env
GITHUB_TOKEN=your_github_token_here
```

⚠️ **注意：** 不要将 GitHub Token 提交到 Git 仓库中！

## 功能说明

### 自动检查更新

- 应用启动时会自动检查更新（默认每24小时）
- 可在设置页面关闭自动检查
- 可在设置页面的"关于"部分手动检查更新

### 版本比较

系统会自动比较：
- **当前版本**：从 `Cargo.toml` 读取（当前为 `0.1.0`）
- **最新版本**：从 GitHub Release 的 `tag_name` 读取

如果最新版本大于当前版本，会提示用户更新。

### Release 信息

检查更新时会显示：
- ✅ 当前版本号
- ✅ 最新版本号
- ✅ 发布时间
- ✅ Release 说明（如果在 GitHub Release 中填写）
- ✅ 下载链接（跳转到 GitHub Release 页面）

## 更新流程

1. **开发新版本**：
   - 更新 `Cargo.toml` 中的版本号
   - 更新 `src-tauri/tauri.conf.json` 中的版本号

2. **发布新版本**：
   - 在 GitHub 创建新 Release
   - Tag 名称格式：`v0.2.0`（带 `v` 前缀）
   - 填写更新说明

3. **用户收到更新**：
   - 应用启动时自动检查
   - 或用户手动点击"检查更新"
   - 显示更新对话框，提供下载链接

## 测试

### 测试自动更新功能

1. 在 GitHub 创建一个测试 Release（版本号高于当前版本）
2. 运行应用并点击"检查更新"按钮
3. 应该能看到新版本提示

### 测试版本比较

当前版本：`0.1.0`
- ✅ Release `v0.2.0` → 显示更新
- ✅ Release `v0.1.1` → 显示更新
- ❌ Release `v0.1.0` → 不显示更新
- ❌ Release `v0.0.9` → 不显示更新

## 故障排除

### 问题：检查更新失败，提示"AUTH_ERROR"

**原因**：私有仓库需要认证

**解决**：设置 `GITHUB_TOKEN` 环境变量（见上文）

### 问题：检查更新失败，提示"NOT_FOUND"

**原因**：仓库没有 Release

**解决**：在 GitHub 创建至少一个 Release

### 问题：检查更新失败，提示"API_ERROR"

**原因**：网络问题或 GitHub API 限制

**解决**：
1. 检查网络连接
2. 确认 GitHub Token 权限正确
3. 等待一段时间后重试（GitHub API 有速率限制）

### 开发环境调试

查看控制台输出，可以看到详细的检查过程：
```
正在从 GitHub 检查新版本...
仓库: liao-works/liao-tools
API 地址: https://api.github.com/repos/liao-works/liao-tools/releases/latest
使用 GitHub Token 进行认证
发现新版本: 0.2.0 (当前版本: 0.1.0)
```

## 安全建议

1. ⚠️ **永远不要**将 GitHub Token 提交到代码仓库
2. ✅ 使用最小权限原则（只授予必要的权限）
3. ✅ 定期轮换 Token
4. ✅ 为不同的应用使用不同的 Token
5. ✅ 在 `.gitignore` 中添加：
   ```
   .env
   .env.local
   ```

## 参考资料

- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [GitHub API - Releases](https://docs.github.com/en/rest/releases/releases)
