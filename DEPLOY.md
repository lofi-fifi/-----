# 部署到 Vercel（零基础版）

目标：把 `C:\Users\lofi\Desktop\kaoyan` 这个项目传到网上，拿到一个 **https** 开头的公网地址。
之后手机不管连哪个 Wi-Fi、甚至用流量，都能直接打开，还能「添加到主屏幕」当 App 用。

全程免费，大约 15 分钟。

---

## 开始之前

| 需要的东西 | 说明 |
|---|---|
| 一个 GitHub 账号 | 存代码的地方，免费注册 |
| 一个 Vercel 账号 | 部署的地方，免费，**用 GitHub 账号一键登录即可** |
| GitHub Desktop | 免费的可视化 Git 工具，**自带 Git，不用装别的东西** |

> 为什么必须传到网上？因为 PWA（添加到主屏幕、离线可用）**只在 https 下生效**。
> 手机连局域网用 `http://192.168.31.168:5173` 是 http，浏览器不认。
> Vercel 会自动给你一个 https 地址，问题就解决了。

---

## 第一步：把代码传到 GitHub

### 1.1 装 GitHub Desktop

打开 https://desktop.github.com/ → 下载 → 安装 → 启动。

启动后点 **Sign in to GitHub.com**，登录（没账号就点 Create your free account 注册）。
登录完它会问你名字和邮箱，随便填，只影响提交记录署名。

### 1.2 把项目加进来

1. 顶部菜单 **File → Add local repository…**
2. Folder 选 `C:\Users\lofi\Desktop\kaoyan`
3. 它会提示 *"This directory does not appear to be a Git repository. Would you like to create a repository here instead?"* → 点 **create a repository**
4. 弹窗里：
   - **Name**：`kaoyan`
   - **Local path**：保持默认（就是项目目录的上一级）
   - Git ignore：**不用选**，项目里已经有 `.gitignore` 了
   - 点 **Create repository**

### 1.3 提交

左下角：

- **Summary** 填 `初始提交`
- 点 **Commit to main**

> 左边会列出几百个文件，这是正常的（源码文件）。
> 如果看到 `node_modules` 也在列表里，说明 `.gitignore` 没生效 —— 正常情况下**不应该**看到它。

### 1.4 发布到 GitHub

点顶部中间的 **Publish repository**：

- **Name**：`kaoyan`
- **Keep this code private**：勾不勾都行。
  - 私有也可以部署，Vercel 用同一个 GitHub 账号登录就能读到。
  - 只是自己用的话建议**勾上**。
- 点 **Publish repository**

等几秒，代码就上去了。

---

## 第二步：用 Vercel 部署

### 2.1 注册 / 登录

打开 https://vercel.com/signup

点 **Continue with GitHub** → 弹出授权页面 → 点 **Authorize Vercel**。

### 2.2 导入项目

1. 进入控制台后点 **Add New… → Project**
2. 在列表里找到刚传的 **kaoyan** → 点 **Import**

> 如果列表里没有，点 *Adjust GitHub App Permissions*，把 `kaoyan` 仓库授权给 Vercel。

### 2.3 关键一步：什么都别改

Vercel 会自动识别这是 Vite 项目，配置应该长这样：

| 选项 | 自动填的值 |
|---|---|
| Framework Preset | `Vite` |
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| Install Command | `pnpm install` |
| Node.js Version | `22.x` |

**保持默认，直接点最下面的 Deploy 按钮。**

> 为什么它能自动认出来？
> - 看到 `vite.config.ts` → 知道是 Vite
> - 看到 `pnpm-lock.yaml` → 用 pnpm 装依赖
> - 看到 `package.json` 里的 `"engines": { "node": ">=22.12.0" }` → 用 Node 22

### 2.4 等它跑完

大约 1 分钟，会看到撒花的 **Congratulations!** 页面。

如果中途红了，点开 **Build Logs** 看最后几行报错 —— 多半是某个依赖没装好，点 **Redeploy** 重试一次通常就好。

---

## 第三步：拿到你的公网地址

部署成功后你会得到一个地址，形状是：

```
https://kaoyan-abc123.vercel.app
```

这就是你的专属网址。**用手机浏览器直接打开它。**

想换个好记的名字：
**Project → Settings → Domains** → 在 `xxx.vercel.app` 里改前面的 `xxx` → 点 Edit。
（如果名字被占用会提示，换一个即可。）

---

## 第四步：手机「添加到主屏幕」

必须用 **https 那个 Vercel 地址**，不要用局域网 IP。

### Android（Chrome）

1. 打开你的 `https://kaoyan-xxx.vercel.app`
2. 右上角 **⋮** 菜单
3. 点 **安装应用**（有的版本叫「添加到主屏幕」）
4. 确认

### iPhone（必须用 Safari）

1. 打开你的 `https://kaoyan-xxx.vercel.app`
2. 底部中间的 **分享** 按钮（方框加向上箭头）
3. 往下滑，点 **添加到主屏幕**
4. 右上角 **添加**

> ⚠️ iOS 上必须用 **Safari**。用 Chrome 或微信打开都没有这个选项。

添加完，桌面会出现一个**黑色方块 + 白色「考」字**的图标。
点开是全屏无地址栏的，跟原生 App 一样，断网也能用（数据存在手机本地）。

---

## 以后怎么更新代码

改完代码后：

1. 打开 **GitHub Desktop**
2. 左下角 **Summary** 写一句这次改了什么（比如 `调整签到样式`）
3. 点 **Commit to main**
4. 点右上角 **Push origin**

**Vercel 会自动侦测到推送并重新部署**，1 分钟后线上就是新版了。
不需要再进 Vercel 点任何按钮。

> 手机上的 App 图标可能需要**下拉刷新一次**才会更新到新版本（Service Worker 的缓存机制）。
> 如果一直不更新，把主屏幕那个图标删掉重新添加一次。

---

## 常见问题

**Q：Vercel 上打开是白屏 / 404？**
检查 **Settings → Build & Deployment → Output Directory** 是不是 `dist`。

**Q：部署日志里报 `ERR_PNPM_...`？**
点 **Redeploy**，并勾上 *Use existing Build Cache* 的**反选**（即不用缓存）重跑一次。Vercel 首次装依赖偶尔会抽风。

**Q：手机上打开还是旧版本？**
Service Worker 缓存。下拉刷新，或在浏览器设置里清一次该站点的数据。

**Q：桌面图标还是旧的？**
删掉主屏幕图标，重新「添加到主屏幕」。

**Q：我改了域名，手机上的图标打不开了？**
旧图标指向旧地址。删掉重新添加。

**Q：数据会丢吗？**
不会。数据存在**手机浏览器的 localStorage** 里，跟服务器无关。
但要注意：**换手机、换浏览器、清除浏览器数据都会丢**。
想保险就用设置面板里的 **导出 JSON** 定期备份。

**Q：我还能在电脑上本地开发吗？**
能，跟以前一样：

```powershell
cd C:\Users\lofi\Desktop\kaoyan
$env:PATH = "C:\Users\lofi\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
$pnpm = "C:\Users\lofi\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
node $pnpm dev
```

本地访问 `http://localhost:5173/`（localhost 属于安全上下文，PWA 也能正常测）。

---

## 项目里已经为部署准备好的东西

| 文件 | 作用 |
|---|---|
| `package.json` → `engines.node` | 告诉 Vercel 用 Node 22 |
| `pnpm-lock.yaml` | 让 Vercel 用 pnpm 安装，版本完全一致 |
| `vite.config.ts` → `base: '/'` | 部署在域名根目录，资源路径正确 |
| `vite.config.ts` → `VitePWA` | 生成 `manifest.webmanifest` 和 `sw.js` |
| `public/pwa-*.png` | 主屏幕图标 |
| `public/apple-touch-icon.png` | iOS 专用图标（iOS 不认 SVG） |
| `public/icon.svg` | SVG 版图标 |
| `.gitignore` | 保证 `node_modules` / `dist` 不会被传上去 |
