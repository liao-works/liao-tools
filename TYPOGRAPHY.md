# 字体排版系统

## 字体栈

### 中文优先
- PingFang SC (macOS/iOS)
- Hiragino Sans GB (macOS)
- Microsoft YaHei (Windows)

### 英文字体
- Inter (Web Font)
- System Fonts (-apple-system, Segoe UI, etc.)

### 代码字体
- Fira Code
- JetBrains Mono
- Cascadia Code
- SF Mono
- Consolas

## 字体大小系统

| 级别 | 大小 | 用途 | Tailwind类 |
|------|------|------|-----------|
| xs   | 12px | 辅助文字、标签 | `text-xs` |
| sm   | 14px | 小号文字、按钮 | `text-sm` |
| base | 16px | 正文 | `text-base` |
| lg   | 18px | 大号文字、卡片标题 | `text-lg` |
| xl   | 20px | 小标题 | `text-xl` |
| 2xl  | 24px | 二级标题 | `text-2xl` |
| 3xl  | 30px | 一级标题、页面标题 | `text-3xl` |
| 4xl  | 36px | 大标题 | `text-4xl` |

## 字重系统

| 字重 | 值 | 用途 | Tailwind类 |
|------|---|------|-----------|
| Normal | 400 | 正文 | `font-normal` |
| Medium | 500 | 强调文字、标签 | `font-medium` |
| Semibold | 600 | 小标题、卡片标题 | `font-semibold` |
| Bold | 700 | 标题、重要信息 | `font-bold` |

## 行高系统

| 级别 | 值 | 用途 | Tailwind类 |
|------|---|------|-----------|
| Tight | 1.25 | 大标题 | `leading-tight` |
| Snug | 1.375 | 标题、标签 | `leading-snug` |
| Normal | 1.5 | 正文 | `leading-normal` |
| Relaxed | 1.625 | 长文本、段落 | `leading-relaxed` |
| Loose | 2 | 特殊场景 | `leading-loose` |

## 使用建议

### 页面标题
```tsx
<h2 className="text-3xl font-bold tracking-tight">页面标题</h2>
<p className="text-muted-foreground">描述文字</p>
```

### 卡片
```tsx
<CardHeader>
  <CardTitle>卡片标题</CardTitle>  {/* text-lg font-semibold */}
  <CardDescription>卡片描述</CardDescription>  {/* text-sm text-muted-foreground */}
</CardHeader>
```

### 按钮
```tsx
<Button>按钮文字</Button>  {/* text-sm font-medium */}
```

### 表格
```tsx
<Table>  {/* text-sm */}
  <TableHead>表头</TableHead>  {/* font-medium */}
  <TableCell>内容</TableCell>
</Table>
```

### 导航
```tsx
<nav>
  <a>菜单项</a>  {/* text-sm font-medium */}
</nav>
```

## 最佳实践

1. **保持层级清晰**: 标题使用3-4级，正文使用base大小
2. **适当的字重**: 标题用semibold/bold，正文用normal
3. **合理的行高**: 标题用tight/snug，正文用normal/relaxed
4. **一致性**: 同类元素使用相同的字体样式
5. **可读性**: 确保文字与背景有足够对比度

## 字体优化

- **抗锯齿**: `-webkit-font-smoothing: antialiased`
- **渲染优化**: `text-rendering: optimizeLegibility`
- **OpenType特性**: `font-feature-settings: "cv02", "cv03", "cv04", "cv11"`
- **等宽数字**: 使用 `.tabular-nums` 类

## 响应式建议

对于不同屏幕尺寸，可以使用响应式类：

```tsx
<h1 className="text-2xl md:text-3xl lg:text-4xl">
  响应式标题
</h1>
```

## 颜色搭配

- **主要文字**: `text-foreground`
- **次要文字**: `text-muted-foreground`
- **标题**: `text-foreground font-bold`
- **描述**: `text-muted-foreground text-sm`
- **链接**: `text-primary hover:underline`
