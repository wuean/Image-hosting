# 图床管理系统（imgbed）

一个自托管的 Web 图床管理系统。统一对接多家对象存储（Cloudflare R2、AWS S3/MinIO、阿里云 OSS、腾讯云 COS、七牛云 Kodo、又拍云 USS），支持多用户隔离、邮箱激活、管理后台、流式上传、暗黑主题等。适合个人或小团队自建图床。

## 功能特性

- **多存储后端统一接入**：6 种存储类型，统一的上传 / 列表 / 删除 / 外链体验。
- **多用户 + 邮箱激活**：注册需邮箱，激活后才能登录（未激活登录返回 `INACTIVE`）。
- **桶级隔离**：用户只能查看和使用自己创建的桶；管理员可见全部桶但仅查看，不能删除他人桶内的实际远端文件。
- **流式上传**：服务端中转，请求体边收边传，大文件不会占满内存（先落临时文件再上传）。
- **管理后台**：用户管理（激活/停用/编辑/删除/重发激活邮件）、系统设置（站点 branding、登录背景、SMTP）。
- **邮件可配置**：SMTP 既可在 `server/.env` 配置，也可在后台「系统设置 → 邮件服务」直接配置，支持发送测试邮件。
- **现代化界面**：Vue3 + Naive UI，暗黑主题（跟随系统 + 手动切换），登录页全屏壁纸。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Hono + TypeScript（tsx 运行），better-sqlite3，nodemailer，busboy |
| 存储 SDK | `@aws-sdk/client-s3`（S3 兼容类）、`qiniu`、`upyun` |
| 前端 | Vue 3 + Vite + TypeScript + Naive UI + vue-router |
| 数据库 | SQLite（单文件 `server/data/imgbed.db`，WAL 模式） |
| 部署 | 单进程：后端静态托管前端 `dist/` 产物 |

## 目录结构

```
imgbed/
├── server/                 # 后端 (Hono + TS)
│   ├── src/
│   │   ├── index.ts        # 入口：挂载路由、托管前端 dist
│   │   ├── env.ts          # 轻量 .env 加载器
│   │   ├── db.ts           # SQLite 初始化 + 建表 + 种子数据
│   │   ├── adapters/       # 存储适配器 (StorageAdapter 接口)
│   │   │   ├── types.ts    # 接口定义 + BucketType
│   │   │   ├── index.ts    # 工厂：根据 type 创建适配器（含 S3 兼容端点推导）
│   │   │   ├── s3.ts       # S3/R2/阿里OSS/腾讯COS 共用
│   │   │   ├── qiniu.ts    # 七牛
│   │   │   └── upyun.ts    # 又拍云
│   │   ├── lib/            # auth(令牌/鉴权)、crypto(AES加密/密码哈希)、mail(邮件)
│   │   └── routes/         # auth / buckets / images / stats / settings
│   ├── data/               # SQLite 数据库（git 忽略）
│   └── .env                # 环境变量（git 忽略）
├── web/                    # 前端 (Vue3 + Vite)
│   ├── src/
│   │   ├── api.ts          # 封装后端请求
│   │   ├── router.ts       # 前端路由 + 登录守卫
│   │   └── views/          # Login / Register / Activate / Dashboard / Images / Buckets / AdminUsers / SystemSettings
│   └── dist/               # 构建产物（git 忽略，由后端托管）
├── .gitignore
└── README.md
```

## 环境要求

- Node.js 18+（开发与测试使用 Node 22）。
- 至少一个对象存储服务商的账号（用于创建桶）。
- 如需邮件激活，需可用的 SMTP（QQ / 阿里 / 腾讯企业邮等均可）。

## 快速开始

### 1. 安装依赖

```bash
# 后端
cd server
npm install

# 前端
cd ../web
npm install
```

### 2. 配置环境变量

编辑 `server/.env`（首次运行可复制一份）。最少需要以下字段：

```env
# 核心密钥（务必修改默认值，且不要随意变更，否则已加密的桶配置会解不开）
MASTER_KEY=0123456789abcdef0123456789abcdef
JWT_SECRET=test-jwt-secret-abc123
ADMIN_PASSWORD=admin123

# SMTP 邮件（也可在后台系统设置里配置，二者都没有时激活邮件仅打印到控制台日志）
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=you@example.com
SMTP_PASS=your-smtp-authcode
MAIL_FROM=you@example.com

# 站点
PUBLIC_BASE_URL=http://localhost:3000
# ALLOW_REGISTER=false   # 取消注释可关闭自助注册
```

> `PUBLIC_BASE_URL` 决定激活邮件里链接的域名。部署到真实域名后请改为对应地址。

### 3. 启动

**开发模式（前后端分离）**

```bash
# 终端 A：后端（默认 http://localhost:3000）
cd server && npm run dev        # tsx watch，改文件自动热重载

# 终端 B：前端（默认 http://localhost:5173）
cd web && npm run dev
```

后端已对 `/api/*` 开启 CORS，前端 dev server 可直接跨域调用。

**生产模式（单进程托管）**

```bash
cd web && npm run build         # 产物输出到 web/dist
cd ../server && npm run start   # 后端静态托管 dist/，访问 http://localhost:3000 即为完整站点
```

## 存储桶配置

进入「存储桶配置」页添加桶。支持的 6 种类型及必填字段如下：

| 类型 | 说明 | 必填字段 |
|------|------|----------|
| `r2` | Cloudflare R2 | Endpoint、Region、桶名、Access Key ID、Secret Access Key、访问域名 |
| `s3` | AWS S3 / MinIO / 其他 S3 兼容 | Endpoint（可选，S3 官方留空）、Region、桶名、Access Key ID、Secret Access Key、访问域名 |
| `aliyun-oss` | 阿里云 OSS（S3 兼容） | Region（如 `cn-hangzhou`）、桶名、AccessKeyId、AccessKeySecret、访问域名 |
| `tencent-cos` | 腾讯云 COS（S3 兼容） | Region（如 `ap-guangzhou`）、桶名、SecretId、SecretKey、访问域名 |
| `qiniu` | 七牛云 Kodo | AccessKey、SecretKey、桶名、访问域名 |
| `upyun` | 又拍云 USS | 服务名、操作员、操作员密码、访问域名 |

> 阿里云 OSS 与腾讯云 COS 走官方 S3 兼容端点（`oss-{region}.aliyuncs.com` / `cos.{region}.myqcloud.com`），由系统按 Region 自动推导，无需手填 Endpoint。
>
> 表单中「存储类型」已置于最顶部，选择后会动态切换对应的字段。

添加桶后可点击「测试连接」验证配置是否正确（使用 `HeadBucket` 等轻量探测）。

## 用户与权限模型

- **普通用户**
  - 只能查看 / 上传 / 删除**自己创建**的桶。
  - 上传与远端文件删除严格锁定 `bucket.owner_id === 当前用户`。
- **管理员（admin）**
  - 可见全部用户的桶（仅查看，不可删除他人远端文件）。
  - 用户管理页可：激活 / 停用 / 编辑（用户名、邮箱）/ 删除（级联删除本地记录，不删远端文件；不能删除自己）/ 重发激活邮件。
- **注册流程**：填写用户名 + 邮箱 + 密码 → 发送激活邮件（含 `PUBLIC_BASE_URL` 链接）→ 点击激活 → 才能登录。
- 关闭自助注册：在 `server/.env` 设置 `ALLOW_REGISTER=false`。

## 系统设置（后台）

管理员进入「系统设置」（侧边栏）→「邮件服务 (SMTP)」与「系统设置」两个区块：

- **系统设置**：站点名称、LOGO 文字、LOGO 图片 URL、登录背景图（留空则使用默认壁纸）。
- **邮件服务 (SMTP)**：服务器、端口、加密开关、用户名、密码（点击显示）、发件人，以及「发送测试邮件」按钮。
- SMTP 密码以 AES 加密存入数据库；公开接口不返回任何 SMTP 字段，仅管理员专用接口返回解密后的值供表单回填。

## API 概览

所有接口前缀为 `/api`。除登录 / 注册 / 激活 / 公开设置外，均需 `Authorization: Bearer <token>`。

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，返回 `{ token, user }`；未激活返回 401 `code: INACTIVE` |
| POST | `/api/auth/register` | 自助注册（受 `ALLOW_REGISTER` 控制） |
| GET  | `/api/auth/activate?token=` | 邮箱激活 |
| POST | `/api/auth/change-password` | 修改密码（需登录） |
| GET  | `/api/auth/admin/users` | 用户列表（admin） |
| POST | `/api/auth/admin/users/:id/activate` | 激活用户（admin） |
| POST | `/api/auth/admin/users/:id/deactivate` | 停用用户（admin） |
| PUT  | `/api/auth/admin/users/:id` | 编辑用户名/邮箱（admin） |
| POST | `/api/auth/admin/users/:id/resend-activation` | 重发激活邮件（admin） |
| DELETE | `/api/auth/admin/users/:id` | 删除用户（admin，不能删自己） |

### 存储桶 `/api/buckets`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/buckets` | 当前用户可见桶（admin 看全部） |
| POST | `/api/buckets` | 创建桶（type / name / config / keyPrefix） |
| PUT  | `/api/buckets/:id` | 更新桶 |
| DELETE | `/api/buckets/:id` | 删除桶（仅删本地记录，不删远端文件） |
| POST | `/api/buckets/:id/test` | 连通性测试 |

### 图片 `/api/images`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/images/upload?bucketId=` | 流式中转上传（multipart `file` 字段），返回 url / markdown |
| GET  | `/api/images/records?bucketId=&page=` | 本站上传记录 |
| GET  | `/api/images/browse?bucketId=&prefix=&cursor=` | 直接浏览桶内对象 |
| POST | `/api/images/delete` | 批量删除远端文件（仅桶主） |

### 统计 `/api/stats`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/stats` | 桶分布、图片总数/体积、本月上传、最近上传（限登录用户可见范围） |

### 系统设置 `/api/settings`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/settings` | 公开返回 branding（site_name / logo_text / logo_url / login_bg_url） |
| GET  | `/api/settings/all` | 管理员：返回全部含 SMTP（解密密码） |
| PUT  | `/api/settings` | 管理员：保存设置（含 SMTP） |
| POST | `/api/settings/test-smtp` | 管理员：发送测试邮件 |

## 数据模型

SQLite，单文件 `server/data/imgbed.db`。核心表：

- **users**：`id, username, password_hash, role, created_at, email, is_active, activation_token, activated_at`
- **buckets**：`id, name, type, config_enc（AES 加密的 JSON 配置）, key_prefix, owner_id, created_at`
- **images**：`id, bucket_id, user_id, key, original_name, size, mime, created_at`
- **settings**：`key, value, updated_at`（site_name / logo_* / login_bg_url / smtp_*）

桶配置与 SMTP 密码均以 **AES-256-GCM**（主密钥 `MASTER_KEY`）加密存储，明文不下发前端。

## 安全说明

- 存储桶密钥、SMTP 密码均加密入库，主密钥仅在服务端环境变量 `MASTER_KEY` 中，**务必妥善保管且不泄露**。
- 公开接口（`GET /api/settings`）仅返回站点 branding，绝不暴露 SMTP 等敏感字段。
- 远端文件删除严格按「桶主」身份锁定，管理员也无法越权删除他人远端文件。
- 删除用户仅级联删除本地数据库记录，**不会触碰远端存储中的实际文件**（避免误删）。
- 生产环境强烈建议使用 HTTPS（尤其是 SMTP 密码回填给管理员表单的场景）。

## 已知限制与后续计划

已完成：多用户 + 邮箱激活、6 种存储后端、流式上传、仪表盘统计、暗黑主题、登录壁纸、系统设置（含 SMTP）。

待办（按优先级）：

1. **Docker 部署**：当前为开发态单进程，尚未容器化。

2. **API Key（PicGo / Typora 兼容上传）**：签发长效密钥 + `/api/v1/upload`，让写作工具直接传图。

3. **presign 直传**：二期优化，让前端直连对象存储，绕过服务端中转。

   

## 常见问题

- **改了 `MASTER_KEY` 后旧桶配置解不开？** 已加密的 `config_enc` 依赖原主密钥。改密钥后请在后台删除并重建对应桶。
- **七牛测试域名 30 天回收？** 七牛免费测试域名有期限，正式使用请绑定已备案的自定义域名。
- **R2 外链无法访问？** 需在 Cloudflare 绑定自定义域名或开启 `r2.dev`（有限速）。
- **又拍云删除报错？** 删非空目录需递归处理，目前删除走适配器 `remove`。
- **上传大文件内存暴涨？** 已采用 busboy 流式 + 临时文件方案，正常情况下不会占满内存。
- **如何修改管理员账号和密码？** 初始管理员为 `admin` / `admin123`（服务器 `.env` 设了 `ADMIN_PASSWORD` 则为该值；仅首次初始化、库里无用户时生效）。
  - **改密码**：登录后右上角头像 → 「修改密码」，旧密码填 `admin123`，新密码 ≥6 位保存；或 `POST /api/auth/change-password`（需旧密码，走当前登录 token）。
  - **改账号（用户名）**：管理员 → 用户管理 → 找到 `admin` 行点「编辑」改用户名/邮箱。注意「停用/删除/重发激活」对管理员行禁用，但「编辑」可用。
  - **忘记密码的兜底**：在服务器项目目录用项目同款 scrypt 算法直接改库（密码为加盐哈希，不能填明文）：
    ```bash
    cd /www/wwwroot/imgbed/server
    node -e "
    const crypto=require('crypto');
    const Database=require('better-sqlite3');
    const db=new Database('data/imgbed.db');
    const np='你的新密码';
    const salt=crypto.randomBytes(16).toString('hex');
    const hash=crypto.scryptSync(np,salt,32).toString('hex');
    db.prepare(\"UPDATE users SET password_hash=?, username='新管理员名' WHERE username='admin'\").run(salt+':'+hash);
    console.log('已更新:', db.prepare('SELECT id,username,role FROM users WHERE role=?').get('admin'));
    db.close();
    "
    ```
    改完直接重新登录，无需重启。
