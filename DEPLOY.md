# 部署上线（零基础版）

目标：拿到一个 **https 开头的公网地址**，让手机不连电脑 Wi-Fi 也能打开，还能「添加到主屏幕」当 App 用。

免费，全程约 20 分钟。

---

## 先选一条路

| | **GitHub Pages**（推荐） | Vercel |
|---|---|---|
| 国内可达性 | 通常能开 | ❌ **经常被 DNS 污染，打不开** |
| 搭建难度 | 配置一次，之后 push 就自动部署 | 更简单，但国内可能白搭 |
| 代价 | 仓库必须是 **Public** | 无需改动仓库 |

> **如果你在中国大陆，直接走 GitHub Pages。** Vercel 的 `*.vercel.app` 域名在国内普遍被污染
> （解析出来是 Twitter 的 IP 段，TCP 根本连不上），跟你的代码和部署质量无关。

---

# 方式一：GitHub Pages

## 前提

你已经把代码推到了 GitHub（GitHub Desktop → Commit → Publish repository）。

## 第 1 步：把仓库改成 Public

免费账号的 GitHub Pages **只支持公开仓库**。

1. 浏览器打开你的仓库 → 顶部 **Settings**
2. 左侧拉到最底 → **Danger Zone**
3. 点 **Change repository visibility** → **Change to public**
4. 按提示输入仓库名确认

> 放心，公开的只是**代码**。你的任务、签到、学习时长都存在**手机浏览器的 localStorage** 里，
> 不在仓库里，不会泄露。

## 第 2 步：打开 Pages 并选择数据源

1. 仓库 → **Settings** → 左侧 **Pages**
2. **Build and deployment** → **Source** 下拉框
3. 选 **GitHub Actions**（不要选 "Deploy from a branch"）

> ⚠️ **这一步必须先做**。跳过的话工作流会报错
> `Get Pages site failed` / `Not Found`。

## 第 3 步：把工作流文件推上去

项目里已经准备好了两个新文件，GitHub Desktop 会自动看到：

```
.github/workflows/deploy.yml   ← 自动构建 + 部署
public/.nojekyll               ← 告诉 Pages 别用 Jekyll 处理
vite.config.ts                 ← 改成可配置 base（已改好）
```

操作：

1. 打开 **GitHub Desktop**
2. 左边会列出这几个文件
3. 左下角 **Summary** 填 `添加 GitHub Pages 自动部署`
4. 点 **Commit to main**
5. 点右上角 **Push origin**

## 第 4 步：看它自动跑

1. 回到仓库页面 → 顶部 **Actions** 标签
2. 会看到一条 **Deploy to GitHub Pages** 正在跑（黄色小圆点）
3. 等 1～2 分钟，变成 **绿色 ✅**

点进去能看到两步：`build`（构建）和 `deploy`（部署）。

## 第 5 步：拿到地址

仓库 → **Settings** → **Pages**，顶部会显示：

> ✅ Your site is live at **https://lofi-fifi.github.io/你的仓库名/**

这就是你的公网地址。**注意结尾的 `/` 不能省**。

格式说明：

```
https://<你的用户名>.github.io/<仓库名>/
```

## 第 6 步：手机添加到主屏幕

**安卓 Chrome**：打开网址 → 右上角 `⋮` → **安装应用**

**iPhone**：**必须用 Safari** → 底部**分享**按钮 → **添加到主屏幕**

装完桌面图标是**黑底白「考」**。

## 以后怎么更新

改完代码 → GitHub Desktop → 写 Summary → **Commit to main** → **Push origin**
→ Actions 自动重跑 → 1 分钟后线上就是新版 → 手机**下拉刷新**。

---

# 方式二：Vercel（如果你在境外 / 有代理）

## 第 1 步：传代码到 GitHub

装 [GitHub Desktop](https://desktop.github.com/)（自带 Git）→ 登录 → `File → Add local repository`
→ 选 `C:\Users\lofi\Desktop\kaoyan` → 提示不是仓库时点 `create a repository`
→ 左下角写 `初始提交` → **Commit to main** → **Publish repository**。

## 第 2 步：部署

1. [vercel.com/signup](https://vercel.com/signup) → **Continue with GitHub**
2. **Add New… → Project** → 选中仓库 → **Import**
3. 配置页**什么都别改**，直接点 **Deploy**

Vercel 会自动识别：看到 `vite.config.ts` 知道是 Vite，看到 `pnpm-lock.yaml` 用 pnpm，
看到 `package.json` 里的 `engines.node` 用 Node 22。

> ⚠️ 注册时务必选 **Hobby（I'm working on personal projects）**。
> 选 Pro 会开始 14 天试用，之后自动扣 **$20/月**。个人自用 Hobby 完全够。

## 第 3 步：拿地址

部署完成后 **Domains** 那一行的 `xxx.vercel.app` 就是固定地址。

**不要**用上面 `Deployment` 里那串带随机字符的地址 —— 那是**这一次构建**的专属地址，每次部署都会变。

---

# 常见问题

**Q：Actions 报 `Get Pages site failed` / `Not Found`？**
第 2 步没做。去 Settings → Pages → Source 选 **GitHub Actions**，然后回 Actions 点 **Re-run all jobs**。

**Q：Actions 报 `failed with exit code 1`？**
点进失败的那一步看日志。如果是 `pnpm install` 失败，点 **Re-run all jobs** 重试一次（首次装依赖偶尔抽风）。

**Q：网站打开是白屏，控制台一堆 404？**
`base` 路径不对。检查 `.github/workflows/deploy.yml` 里有没有这一行：
```yaml
VITE_BASE: /${{ github.event.repository.name }}/
```

**Q：手机上打开还是旧版本？**
Service Worker 缓存。下拉刷新，或在浏览器里清一次该站点的数据。

**Q：桌面图标还是旧的？**
删掉主屏幕图标，重新「添加到主屏幕」。**换了域名也必须重新添加**（旧图标指向旧地址）。

**Q：数据会丢吗？**
数据存在**手机浏览器的 localStorage**，跟服务器无关。但注意：
- 换手机、换浏览器、清浏览器数据 → **会丢**
- **换域名 = 换存储空间**，旧域名的数据不会跟过去

所以换域名/换托管后，用设置面板里的 **导出 JSON / 导入 JSON** 搬一次数据。

**Q：还能本地开发吗？**
能，跟以前一样：

```powershell
cd C:\Users\lofi\Desktop\kaoyan
$env:PATH = "C:\Users\lofi\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
$pnpm = "C:\Users\lofi\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
node $pnpm dev
```

访问 `http://localhost:5173/`（localhost 属于安全上下文，PWA 也能正常测）。

---

# 项目里已经为部署准备好的东西

| 文件 | 作用 |
|---|---|
| `.github/workflows/deploy.yml` | GitHub Pages 自动构建 + 部署 |
| `public/.nojekyll` | 禁止 Pages 用 Jekyll 处理产物 |
| `vite.config.ts` → `loadEnv` + `VITE_BASE` | 根目录 / 子路径两种部署都能用 |
| `vite.config.ts` → `start_url` / `scope` | 跟着 `base` 走，否则装到手机上会打开错误路径 |
| `package.json` → `engines.node` | 告诉 CI 用 Node 22 |
| `pnpm-lock.yaml` | 让 CI 用 pnpm 装依赖，版本完全一致 |
| `public/pwa-*.png` | 主屏幕图标 |
| `public/apple-touch-icon.png` | iOS 专用图标（iOS 不认 SVG） |
| `.gitignore` | 保证 `node_modules` / `dist` 不会被传上去 |
