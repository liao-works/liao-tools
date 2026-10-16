# Liao Tools 品牌图标

选定风格：浅蓝渐变地球、英国与爱尔兰轮廓、粉色环轨与星芒。单一可缩放母版为 [`public/app-icon.svg`](../public/app-icon.svg)。

桌面应用、安装包、Windows 开始菜单、macOS Dock、网页 favicon、侧边栏均使用这一套视觉标识。

## 生成图标

需要 Python 3、Pillow 与 CairoSVG：

```bash
python -m pip install Pillow CairoSVG
npm run brand:icons
```

生成器 `scripts/generate_brand_assets.py` 会覆盖以下受版本管理的资源：

- `src-tauri/icons/icon.ico`：包含 16、24、32、48、64、128、256 像素的 Windows 多分辨率图标
- `src-tauri/icons/icon.icns`：macOS 多分辨率图标，最高 1024 像素
- `src-tauri/icons/icon.png`、`icon-1024.png`、`icon.iconset/*` 和 Windows Store/Start 菜单 Tile 图
- `public/logo.png` 和 `src/assets/logo*.png`：网页与兼容旧代码的图标

修改图标时，只编辑 SVG 母版并重新生成；**不要从低分辨率 PNG 放大制作 ICO**。Tauri 打包引用的是 `src-tauri/tauri.conf.json` 里指定的 PNG、ICO 与 ICNS。网页直接引用 SVG favicon，新构建安装包使用提交在仓库中的更新资源。

图标生效需要重新构建并安装新版桌面应用；旧安装包及操作系统图标缓存不会被 Git 提交立即修改。
