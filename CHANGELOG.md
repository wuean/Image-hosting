# 更新日志 (CHANGELOG)

本项目所有功能性变更的汇总记录，用于版本管理与快速回溯。
格式参考 [Keep a Changelog](https://keepachangelog.com/)，条目按时间倒序排列。
状态标记：`已发布` = 已推送到远程 `main` 分支。

---

## 已发布 · 2026-10-04（commit `643bd30`、`318fd33`）

> 涉及文件：`server/src/routes/settings.ts`、`web/src/watermark.ts`(新)、
> `web/src/views/Buckets.vue`、`web/src/views/Images.vue`、`web/src/views/Dashboard.vue`

### 新增

- **图片水印（全局配置 + 上传开关）**
  - 后端 `settings` 新增全局键 `watermark`，默认 `{text:'', pos:'br', tile:false, opacity:35, size:3, color:'#FAA07A', rotate:-30}`；
    加入 `PUBLIC_KEYS`（上传页需读取），写接口仍受 `authGuard + requireAdmin` 保护。
  - 新增 `sanitizeWatermark()` 归一化校验：文字 ≤40 字、位置走白名单、不透明度 5–100、字号 1–12、
    颜色须匹配 `^#[0-9a-fA-F]{6}$`、旋转 −90~90，非法值一律回退默认，避免脏配置写库。
  - 新增 `web/src/watermark.ts`：类型 / 默认值 / `drawWatermark` 绘制 / `paintPreview` 预览 /
    `loadWatermarkConfig` / `saveWatermarkConfig`。**设置页预览与上传页成品调用同一个绘制函数**，保证所见即所得。
  - `Buckets.vue`（图床设置）改为「桶设置 / 水印设置」两个标签页；水印页为左右两栏（参数表单 + 实时预览），
    预览支持内置示例图或选择本地图片。
  - `Images.vue`（上传页）新增水印开关，**默认关闭**；水印文字留空时自动使用上传者显示名（昵称优先）。

### 优化

- **上传处理开关重构：由 1 组拆为 4 组互相独立**（`Images.vue`）
  - 原单一 `settings.enabled` 同时管辖压缩、转 WebP、限制边长、重命名，耦合导致功能互相干扰。现为四行独立开关：

    | 开关 | 默认 | 参数 |
    |------|------|------|
    | 图片压缩 | 开 | 质量 10–100%、最长边（0 为不限） |
    | 自动转格式 | 开 | WebP（默认）/ JPEG / PNG |
    | 重命名 | 开 | 时间戳名（默认）/ 随机名 / 自定义前缀 |
    | 水印 | 关 | 使用全局水印配置，附「水印设置」跳转链接 |

  - 重命名下拉去掉「原文件名」选项。
  - 前三组参数持久化到 `localStorage`（键 `imgbed:upload-opts`），刷新或重开浏览器后保持上次选择；水印开关不记忆。
  - 抽出 `encodeWanted` / `qualityApplies` / `planSummary`，让面板提示文案与实际执行的判定共用同一套逻辑。
  - 面板实时汇总当前处理计划（如 `质量 80% · 最长边 1920px · 转 WEBP · 时间戳名`）。

### 修复

- **「自动转格式」下拉失效 / 开关互相打架** —— 开关耦合所致，随上述重构一并解决。
- **关闭压缩仍被降质**：`compress.enabled=false` 时不再向 `canvas.toBlob` 传 quality 参数。
- **SVG / GIF 被错误改名为 `.webp`**（既有 bug）：不再无条件把目标扩展名写成 `webp`。
  未发生编码时保留原扩展名，编码后按 `blob.type` 反查真实后缀。
- **转 JPEG 后透明区域变黑**：转 JPEG 前先以白色 `fillRect` 铺底。
- **仪表盘「最近上传」被不规则 / 竖版图片撑开容器**（`Dashboard.vue`）
  - 现象：竖图或非规则比例的图会把缩略图容器撑高，影响下方内容排版。
  - 根因：`n-image` 的 `width` / `height` 属性**不接受百分比值**，会被浏览器忽略；图片遂按原始比例渲染，竖图高度溢出。
  - 修复：`.recent-thumb` 固定高度 110px + `overflow:hidden`，`.n-image` 绝对定位铺满，图片 `object-fit:cover`；
    并删除失效的 `width="100%" height="100%"`。修复后不同比例图片统一居中裁切，卡片高度一致。

### 文档

- README 新增「上传前处理与水印」章节，并补齐 API / 数据模型 / 安全说明 / FAQ 中与水印相关的条目。
- DEPLOY 新增「GitHub 连不上：改用 SSH over 443」排障小节，升级流程补充 `curl /api/health` 验证与强刷提示。

---

## 已发布 · 2026-08-20（commit `9ed152e`）

> 涉及文件：`web/src/api.ts`、`web/src/views/Login.vue`

### 修复

- **登录失败时页面没有任何提示**（看起来像"点了没反应"）
  - 根因：`api.ts` 把所有 401 一律当作"会话过期"——清除 token 并整页跳转 `/login`。
    但登录 / 注册 / 激活接口**自身**就会返回 401（密码错误、账号未激活等），
    于是整页刷新把刚渲染出来的错误提示一起冲掉了。
  - 修复：仅当「已携带 token **且** 不是 `/api/auth/*` 鉴权接口」时才判定为会话过期并跳转；
    登录页错误提示改为内联展示，不再被刷新吞掉。

---

## 已发布 · 2026-07-31（commit `6430c09`）

### 修复

- **上传重命名功能失效（前端 bug）** — `web/src/views/Images.vue`
  - 现象：默认「随机名」上传正常；但选任意重命名模式时，下拉框始终显示「自定义前缀」，且文件都不按所选模式重命名（保持原名）。
  - 根因：`renameOptions` 用了 `key` 字段，但 Naive UI `n-select` 读取 `value` 字段。所有选项 `value` 均为 `undefined`，内部 Map 以 `undefined` 为 key 反复覆盖，最后胜出「自定义前缀」→ model 永远 `undefined`，`genBaseName` 走 default 分支返回原文件名。
  - 修复：四个选项 `key` 改为 `value`；仅前端改动，后端无需改。

- **时间戳重命名生成 36 进制串（不可读）** — `web/src/views/Images.vue`
  - 现象：选「时间戳名」能重命名，但生成 `lqx4k9z...` 之类的串，不像时间。
  - 根因：`genBaseName` 的 timestamp 分支用 `Date.now().toString(36)`（毫秒时间戳 36 进制），视觉上与随机串无区别。
  - 修复：改为可读格式 `YYYYMMDDHHmmss` + 3 位随机后缀防同秒冲突，例 `20260731115347a3f`。

### 安全

- **上传 Content-Type 归一化 + 大小/数量限制 + CORS 收敛 + 安全响应头**（commit `84c457e`）
  - 上传 Content-Type 由**按扩展名白名单归一化**取代客户端声明，杜绝伪造 `text/html` / SVG 触发存储型 XSS。
  - Busboy `limits`：单文件 20MB、最多 10 文件、20 parts、10 fields；超限不入库。
  - CORS 由 `*` 收敛为 `CORS_ORIGIN` / `PUBLIC_BASE_URL`，显式 `allowHeaders / allowMethods / maxAge`。
  - 全站安全响应头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、`Permissions-Policy`；API 额外 `CSP: default-src 'none'; frame-ancestors 'none'`。

> 注：生产环境仍**必须**在 `server/.env` 设置 `JWT_SECRET` / `MASTER_KEY`（各 ≥32 位随机）/ `ADMIN_PASSWORD`（强密码）/ `ALLOW_REGISTER=false`，否则令牌可伪造、桶密钥可被解密。

---

## 已发布 · 2026-07-29 ~ 07-30（commit `d649fad`）

> 涉及文件：`server/src/db.ts`、`server/src/routes/auth.ts`、`web/src/user.ts`(新)、
> `web/src/views/Profile.vue`(新)、`web/src/App.vue`、`web/src/router.ts`、
> `web/src/views/AdminUsers.vue`、`web/src/views/Dashboard.vue`、
> `web/src/views/Login.vue`、`web/src/views/SystemSettings.vue`

### 新增

- **个人资料页 `/profile`**（前端页面 + 后端接口）
  - 后端 `users` 表增量加 `nickname` 字段（老库自动补列，可空、可重复、≤32 字）。
  - 新增 `GET /api/auth/me`：返回当前用户完整资料（供资料页预填）。
  - 新增 `PUT /api/auth/profile`：当前用户自助修改**昵称 + 邮箱**（邮箱校验格式与唯一性，不改激活状态）。
  - `login` 返回扩展：带上 `email / nickname / created_at / is_active`。
  - `admin/users` 查询补 `nickname` 字段。
  - 新增 `web/src/user.ts` 共享登录态：`currentUser` / `displayName()`（**昵称优先，空则回退用户名**） / `isAdmin()`。
  - 新增 `Profile.vue`：只读展示用户名/角色/注册时间/状态；可编辑昵称+邮箱；内嵌「修改密码」区块（逻辑从 App.vue 迁入）。
  - `App.vue` 右上角下拉改为「个人资料 / 退出登录」，**移除原内联「修改密码」弹窗**；头部显示名统一走 `displayName()`。
  - `Dashboard.vue` 欢迎语改为 `displayName()`。
  - `AdminUsers.vue` 用户列表新增「昵称」列（只读）。
  - `router.ts` 注册 `/profile` 路由。

- **用户名修改权限收紧**
  - 确认并维持规则：**仅管理员可改用户名**。用户名只能在受 `requireAdmin` 保护的
    `PUT /api/auth/admin/users/:id` 修改，普通用户无入口；个人资料页不含改用户名功能。
  - 邮箱不做此限制，普通用户可在个人资料页自改邮箱。

### 优化

- **登录页精简**：移除「Photo by 哲风壁纸」署名文字及相关 `isDefaultBg` 计算属性、`.login-credit` 样式；**保留 GitHub 图标与链接**。
- **个人资料页表单间距**：昵称/邮箱编辑区原先因 `:show-feedback="false"` 收起错误提示占位区导致比「修改密码」区更挤，现已补上一致间距。
- **系统设置页布局重做**（两版迭代）：
  - 表单（站点名称 / LOGO 文字 / LOGO 图片 / 登录背景图）置于左卡，「效果预览」独立成右卡，消除原左卡底部大段留白。
  - 上排「系统设置」与「预览」两卡 `align-items: stretch` **等高对齐**。
  - 「邮件服务 (SMTP)」原为裸卡片且右侧留空，现统一为卡片样式并拆两列：左卡 SMTP 配置，右卡「发送测试」承载测试邮箱输入+发送按钮+说明，消除右侧空白。
  - 窗口 ≤860px 时自动单列堆叠（响应式）。

### 修复

- **个人资料页账号状态一律显示「未激活」**
  - 根因：运行中的后端进程（PID 21428）加载的是本轮「个人资料页」功能**之前**的旧代码——`login` 不返回 `is_active`、`/api/auth/me` 路由不存在（请求被前端静态兜底返回首页 HTML）。资料页用登录态里无 `is_active` 的用户对象 → 一律显示「未激活」，**与账号是否真激活无关**。
  - 处理：用当前源码重启后端（端口 3000），`login` 与 `/me` 现均正确返回 `is_active`；库内账号 `is_active=1` 时资料页显示「已激活」。前端已部署最新构建，浏览器 **Ctrl+F5** 强刷即可。
  - 教训：tsx 非 watch 模式后端改源码后**必须重启进程**；排查资料页状态异常先 `curl -i /api/auth/me` 看返回是否变成 `text/html`（即后端还是旧代码、无该路由）。

---

## 已发布 · 2026-07-28 ~ 07-30

### 修复

- **七牛云 / 又拍云上传返回 400**
  - 根因：`import type { Readable }` 在 tsx(esbuild) 运行期被擦除，`body instanceof Readable` 抛 `ReferenceError` → 400（S3 适配器用 `typeof body === 'string'` 不受影响）。
  - 修复：改为值导入 `import { Readable }`，并在适配器内把路径字符串 `readFileSync` 成 Buffer 再交给 SDK。
  - commit `7a52e39`。

### 新增

- **默认图床**：`users` 表加 `default_bucket_id`；新增 `GET/PUT /api/buckets/default`；上传/图片管理默认选中该桶，越权访问返回 404。
- **桶配置导入 / 导出**：`Buckets.vue` 增加「导出桶设置 / 导入桶设置」（普通用户对自己的桶）；后端 `GET /api/buckets/export`（明文）、`POST /api/buckets/import`（重加密、`******` 过滤）。

### 优化

- **仪表盘「最近上传」**：数量 8 → **12 条**（刚好两行）；最近上传卡片增加「复制 HTML」按钮（`<img src alt>`）。
- **图片管理**：卡片按 `lastModified` 倒序；显示「大小 · 时间」与上传记录风格统一；**新增多选批量删除**（卡片浮层复选框 + 全选/批量删按钮，复用 `/api/images/delete` 的 `keys[]`）。
- commit 含 `2925189`、`e1dea27` 等。

---

## 版本管理约定

- **首选：从 GitHub 拉取**
  `git pull` → `cd web && npm run build` → `cd server && npm install`（仅依赖有变化时）→ `pm2 restart imgbed` → 浏览器 Ctrl+F5。
  - 后端跑的是源码（`tsx src/index.ts`），改了 `server/src` **必须重启 pm2**；前端 `web/dist` 由后端静态托管，重新构建即可，无需动 Nginx。
  - 国内网络下 `github.com:443` 常被连接重置，本地与服务器均可改用 **SSH over 443**：
    `git remote set-url origin ssh://git@ssh.github.com:443/wuean/Image-hosting.git`
    （详见 `DEPLOY.md` 第四节「GitHub 连不上」）。
- **备选：服务器连不上 GitHub 时，走宝塔面板上传**
  - 本地打包（只带源码与产物，不含 `node_modules` / `.env` / `data`）：
    `tar -czf update.tgz server/src web/src web/dist`
  - 宝塔面板「文件」上传到 `/www/wwwroot/imgbed` → 解压覆盖 → `pm2 restart imgbed`。
  - `web/dist` 若已在本地构建，服务器**无需**再 `npm run build`；但后端跑源码，**`server/src` 必须一起更新**。
  - 事后想切回 git 流程：先在服务器 `git checkout -- .` 丢弃覆盖产生的差异，再 `git pull`
    （上传内容与远端提交一致，丢弃本地副本不会丢东西）。
- `imgbed-deploy.tar.gz` / `update.tgz` 均为临时打包产物，**不纳入 git**。
- 更新时绝不覆盖 `server/.env`（密钥）与 `server/data/`（SQLite 库）。
- 提交粒度建议按「功能」而非「文件」：每个独立功能一次 commit，便于回滚与阅读。
