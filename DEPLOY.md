# 部署指南（腾讯轻量 OpenCloudOS 9 + 宝塔 + 已有 WordPress）

本指南针对：**腾讯云轻量应用服务器 / OpenCloudOS 9 / 已安装宝塔面板 / 已运行一个 WordPress 站点** 的环境。
本项目是**单进程 Node 服务**（Hono 同时托管前端静态产物和 `/api/*`），与 WP 完全独立、互不干扰——WP 继续由宝塔 Nginx 服务，本项目用一个**新子域名**反代到本地 `127.0.0.1:3000`。

---

## 一、架构与共存说明

```
浏览器 ──HTTPS──▶ 宝塔 Nginx (子域名 img.你的域名)
                     ├─ WordPress 站点（已存在，独立 server 块）
                     └─ 本项目站点 ──反代──▶ 127.0.0.1:3000 (Node/Hono)
                                               ├─ 静态托管 web/dist
                                               ├─ /api/* 业务接口
                                               └─ SQLite：server/data/imgbed.db
```

- 对外只暴露 **80/443**（WP 已在用，无需新开端口）。
- 本项目端口 **3000 仅监听内网**，不必在腾讯云防火墙/宝塔防火墙开放。
- SQLite 是单文件，落在 `server/data/imgbed.db`，需定期备份（见第七节）。

---

## 二、前置准备

1. **域名**：建议新增一个子域名，例如 `img.你的域名`（也可直接用另一个域名）。
   - 到域名控制台添加 A 记录：`img.你的域名 → 服务器公网 IP`。
2. **宝塔已装**：Nginx（WP 在用）、SSL（Let's Encrypt 免费证书）。
3. 服务器 SSH 能登录（腾讯轻量控制台或本地终端）。

---

## 三、服务器环境（Node + 编译工具）

### 方式 A（推荐）：宝塔「Node.js 版本管理器」
1. 宝塔 → 软件商店 → 运行环境 → **Node.js 版本管理器** → 安装。
2. 打开管理器，安装 **Node 20 或 22**（本项目 tsx/vite 兼容 18+，建议 20/22）。
3. 在该管理器里对全局执行 `npm i -g pm2`（或用终端执行，见下）。

### 方式 B：终端 dnf 安装
```bash
# OpenCloudOS 9 用 dnf（RHEL 系）
dnf install -y gcc gcc-c++ make python3   # better-sqlite3 原生编译需要
# Node 用 nvm 装 22（dnf 自带版本可能偏旧）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22 && nvm alias default 22
npm i -g pm2
node -v   # 应为 v22.x
```

> `better-sqlite3` 安装时会优先拉预编译包；OpenCloudOS 9 (x64/glibc) 一般能直接装上，装不上再用上面的 gcc/make/python3 从源码编译。

---

## 四、获取代码到服务器

**等 GitHub 推送成功后（后台重试中）：**
```bash
cd /www/wwwroot
git clone https://github.com/wuean/Image-hosting.git imgbed
```
或**本地先打包上传**（排除体积大/敏感目录）：
```powershell
# 本地 Windows 打包
cd F:\web\imgbed
tar --exclude=node_modules --exclude=web/dist --exclude=server/.env --exclude=server/data --exclude=.workbuddy -czf imgbed.tar.gz .
```
然后用宝塔「文件」上传 `imgbed.tar.gz` 到 `/www/wwwroot/imgbed/` 并解压，或用 `scp`。

> 目录结构必须保持 `imgbed/server` 与 `imgbed/web` 同级（后端按相对路径解析 `web/dist` 和 `data/`）。

---

## 五、构建与安装依赖

```bash
# 1) 前端构建（产出 web/dist，被后端托管）
cd /www/wwwroot/imgbed/web
npm install
npm run build

# 2) 后端依赖
cd /www/wwwroot/imgbed/server
npm install
```

---

## 六、配置 server/.env（最关键）

在 `server/.env` 写入（宝塔「文件」直接新建/编辑，或用 vi）：
```bash
# ---- 加密/签名密钥：设一次，永不变！改了旧数据解不开 ----
# 注意：本项目用自定义 .env 解析器，不会执行 shell 的 $(...) 展开！
# 必须先在本机/服务器终端单独跑下面的 node 命令，把输出的 64 位十六进制串粘进来，
# 不能直接把 $(node ...) 写进文件（会被当成字面字符串，不是真随机密钥）。
MASTER_KEY=<粘贴生成的64位十六进制串>
JWT_SECRET=<粘贴生成的64位十六进制串>

# ---- 站点对外地址（决定激活邮件里的链接）----
PUBLIC_BASE_URL=https://img.你的域名

# ---- SMTP（与本地一致，QQ 授权码）----
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=lefuo@qq.com
SMTP_PASS=lpnwrrrnjohlbjhi
MAIL_FROM=lefuo@qq.com

# ---- 其它 ----
ALLOW_REGISTER=false
PORT=3000
```
生成随机串（在服务器终端执行，把两次输出分别粘进 MASTER_KEY / JWT_SECRET）：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ `MASTER_KEY`/`JWT_SECRET` 不设会回退到代码写死的开发默认值，**生产必须改成固定随机串且绝不更改**。

---

## 七、用 PM2 守护进程启动

```bash
cd /www/wwwroot/imgbed/server
pm2 start "node_modules/.bin/tsx src/index.ts" --name imgbed
pm2 save
pm2 startup        # 按提示执行它给出的命令，实现开机自启
```
常用：`pm2 logs imgbed` / `pm2 restart imgbed` / `pm2 stop imgbed`

**先本地验证：**
```bash
curl http://127.0.0.1:3000/api/health
# 应返回 {"ok":true,...}
```

> 宝塔用户也可在软件商店装「PM2 管理器」用图形界面管理；或「Supervisor 进程守护」保活，命令填 `node /www/wwwroot/imgbed/server/node_modules/.bin/tsx /www/wwwroot/imgbed/server/src/index.ts`。

---

## 八、宝塔添加站点 + 反向代理 + SSL

1. 宝塔 → **网站 → 添加站点**：
   - 域名：`img.你的域名`
   - 选择「**其他/纯静态**」（不需要 PHP/数据库）
   - 根目录默认即可（项目由 Node 提供服务，此目录仅占位）。
2. 进入该站点 → **反向代理 → 添加反向代理**：
   - 代理名称：`imgbed`
   - 目标 URL：`http://127.0.0.1:3000`
   - 发送域名：`$host`
   - 保存并启用。
3. 站点 → **SSL → Let's Encrypt** → 选该域名 → 申请并**启用**，勾选「强制 HTTPS」。
4. **调整上传大小限制**（默认 1M 太小，图片传不了）：
   - 站点 → **配置文件**，在 `server { ... }` 内或 `location /` 中加入：
     ```
     client_max_body_size 100m;
     ```
   - 保存并重载 Nginx。

---

## 九、验证上线

- 浏览器打开 `https://img.你的域名` → 应显示登录页（大海壁纸）。
- 管理员登录 → 系统设置 → 邮件服务 → 填 SMTP 并「发送测试邮件」验证。
- 添加存储桶（阿里 OSS / 腾讯 COS 等）→ 连通性测试通过即可上传。

---

## 十、备份与维护

- **数据库**：`server/data/imgbed.db`（含 WAL 文件 `imgbed.db-wal/-shm`）。备份时整目录拷走：
  ```bash
  cp -r /www/wwwroot/imgbed/server/data /backup/imgbed-data-$(date +%F)
  ```
- **密钥**：`server/.env` 切勿丢失；丢失需重新生成并会导致已存桶密钥/SMTP 密码无法解密（需重新填）。
- **升级**：`git pull` → 重新 `web` 构建 + `server` 装依赖 → `pm2 restart imgbed`。
- **迁移**：整目录打包（排除 node_modules/dist/.env/data/.workbuddy）到新机，重装依赖、重建 .env、反向代理即可。

---

## 十一、常见问题

| 现象 | 原因 / 解决 |
|------|------------|
| `better-sqlite3` 编译失败 | 缺编译工具：`dnf install -y gcc gcc-c++ make python3` 后重 `npm install` |
| 访问默认 1M 上传报 413 | 宝塔站点配置加 `client_max_body_size 100m;` |
| 激活邮件里是 localhost | `PUBLIC_BASE_URL` 没填真实域名，改后重启 |
| 重启后桶/SMTP 密码失效 | `MASTER_KEY` 被改过；必须固定不变 |
| 端口冲突 | WP 用 80/443，本项目走 3000 仅内网，互不影响 |
| 宝塔 Nginx 未生效反代 | 确认站点「反向代理」已启用且目标 `127.0.0.1:3000`，`pm2` 进程在跑 |
