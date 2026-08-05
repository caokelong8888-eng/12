# AI珠宝设计生成器

按照《AI珠宝设计生成器 - 最终开发需求文档 V3.0》实现的全栈网页工具：用户上传裸石照片或手绘图，选择风格标签，系统自动拼接提示词并调用 AI 图生图 API 生成珠宝设计效果图，采用积分制按次收费。

## 功能总览

| 优先级 | 功能 | 状态 |
|--------|------|------|
| P0 | 苹果式极简前端页面（HTML/CSS/JS） | ✅ |
| P0 | 图片上传 + 预览（不抠图、不压缩，直接作为垫图） | ✅ |
| P0 | 六维标签体系 + 提示词自动拼接 | ✅ |
| P0 | 后端代理 + AI 图生图调用（Nano Banana Pro） | ✅ |
| P0 | 生成结果展示 + 下载按钮 | ✅ |
| P0 | 加载状态（呼吸圆点 + “AI正在为您设计...”） | ✅ |
| P1 | 裸石照片 / 手绘图切换 + 对应重绘幅度（0.4-0.6 / 0.7-0.85） | ✅ |
| P1 | 生成模型选择（对外显示：超高质量2.0 / 高质量1.0，按中转站授权自动展示） | ✅ |
| P1 | 生成 1 / 2 / 4 张（多张自动双列展示） | ✅ |
| P1 | 表现风格（实物 / 手绘图 / 水彩风格 / 铅笔草稿风格） | ✅ |
| P1 | 视图数量（单视图 / 双视图 / 三视图） | ✅ |
| P1 | 镶嵌方式（爪镶/包镶/夹镶/密钉镶/轨道镶/隐形镶） | ✅ |
| P1 | 背景氛围（亮调/暗调/自然光） | ✅ |
| P1 | 硬币参照（垫图放一元硬币辅助 AI 识别尺寸，负面词自动排除硬币） | ✅ |
| P1 | 点击生成结果查看高清大图（支持下载与高清放大） | ✅ |
| P1 | 三端适配（手机 / 平板 / 电脑响应式布局） | ✅ |
| P1 | 错误处理（超时重试、未登录、积分不足、断网、上传失败） | ✅ |
| P2 | 手机号注册 / 登录 + JWT | ✅ |
| P2 | 积分系统（注册赠 3 次、按次扣减、积分包购买、流水记录） | ✅ |
| P2 | 本地历史记录（IndexedDB，最新在上） | ✅ |
| P3 | 高清放大增值服务（消耗 1 积分） | ✅ |
| P3 | 更多风格标签（18 种设计风格） | ✅ |
| P1 | 图片比例选择（1:1 / 3:4 / 4:3 / 9:16 / 16:9） | ✅ |

## 技术架构

| 层级 | 技术 |
|------|------|
| 前端 | HTML + CSS + 原生 JavaScript（无框架） |
| 后端 | Node.js + Express |
| 数据库 | SQLite（sql.js，WebAssembly 版，免编译，持久化为 `server/data/app.db`） |
| 认证 | JWT（jsonwebtoken），Token 存于 localStorage |
| 外部 API | Nano Banana Pro（Gemini 3 Pro Image）图生图：Gemini 直连 / AIMLAPI 聚合 / OpenAI 兼容中转站（未配置 Key 时自动进入演示模式） |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

至少需要修改 `JWT_SECRET`（生产环境务必替换为足够长的随机字符串）；接入真实 AI 生成时，再按下方「演示模式与真实模式」填入 `AI_PROVIDER` 与对应 API Key。

### 3. 启动

```bash
npm start
```

浏览器打开 <http://localhost:3000> 即可使用。

开发模式（代码改动自动重启）：

```bash
npm run dev
```

## 演示模式与真实模式

后端内置两种生成模式，通过环境变量自动切换：

- **演示模式（默认）**：未配置任何 API Key 时启用。后端用纯 JS 图像处理（pngjs / jpeg-js）模拟“生成”：将垫图放置到纯白背景画布并做轻量色彩处理，批量生成时产生 4 种不同观感。页面顶部会显示演示模式提示条。此模式用于无付费 API 时完整跑通注册、积分、生成、下载、放大的全流程。
- **真实模式**：在 `.env` 中配置 `AI_PROVIDER` 与对应 Key 后启用，支持两种供应商：

**gemai.cc 中转站（默认，双模型）**
```env
GEMINI_API_KEY=你的中转站 Key
GEMINI_BASE_URL=https://api.gemai.cc
GEMINI_MODEL=[官]gemini-3.1-flash-image-preview
GPT_IMAGE_MODEL=[官]gpt-image-2-pro
GPT_IMAGE_SIZE=1024x1024
GPT_IMAGE_QUALITY=high
```
前端会让客人自己选择用哪个模型生成；服务启动时会自动查询中转站 `/v1/models`，只在页面上展示当前 Key 已开通的模型。

**Google Gemini 直连（`AI_PROVIDER=gemini`）**
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=你的 Gemini API Key
GEMINI_MODEL=gemini-3-pro-image   # 或 gemini-3-pro-image-preview
```

**AIMLAPI 聚合（`AI_PROVIDER=aimlapi`，OpenAI 兼容、免 allowlist）**
```env
AI_PROVIDER=aimlapi
AIMLAPI_API_KEY=你的 AIMLAPI Key
AIMLAPI_MODEL=google/nano-banana-pro-edit
AIMLAPI_ASPECT_RATIO=1:1
AIMLAPI_RESOLUTION=1K
```

**任意 OpenAI 兼容中转站（`AI_PROVIDER=openai`）**
```env
AI_PROVIDER=openai
OPENAI_BASE_URL=https://你的中转站域名/v1
OPENAI_API_KEY=你的中转站 Key
OPENAI_MODEL=gemini-3-pro-image   # 以中转站提供的模型名为准
```
若中转站的垫图参数名不是 `image_urls`，可加 `OPENAI_IMAGE_FIELD=image` 或通过 `OPENAI_EXTRA_BODY` 补充请求参数。

实现说明：
- Gemini 直连走 `POST /v1beta/models/{GEMINI_MODEL}:generateContent`，提示词 + 垫图（inlineData base64）一起提交，从响应 `candidates[0].content.parts[].inlineData` 取回图片。
- GPT Image 走 OpenAI 兼容 `POST /v1/images/generations`，`image` 参数传垫图 base64（部分中转站可能用 `image_urls`，可配 `GPT_IMAGE_IMAGE_FIELD` 切换），从 `data[].url` / `data[].b64_json` 取回图片。
- AIMLAPI 走 `POST /v1/images/generations`，`image_urls` 传垫图 base64，从 `data[].url` / `data[].b64_json` 取回图片。
- 中转站走 `POST {OPENAI_BASE_URL}/images/generations`，从 `data[].url` / `data[].b64_json` 取回图片。
- Gemini 3.x / GPT Image 都是编辑式模型，不暴露 `denoising_strength` 参数，因此「裸石照片 / 手绘图」语义被映射进提示词：照片强调“忠实保留裸石形状、围绕其设计”，手绘图强调“把草图转化为逼真珠宝摄影”。

> API Key 只存在于后端环境变量中，前端代码不含任何 Key；前端一律通过后端代理调用。

## 提示词拼接规则

拼接顺序与需求文档一致：

`[首饰类型] [设计风格] [金属材质] [镶嵌方式] [配石描述] [背景氛围] [用户自由文字] [固定画质词]`

固定画质词：`professional jewelry photography, studio lighting, pure white background, high resolution, 8k`

固定负面提示词：`blurry, low quality, distorted, deformed, bad anatomy, watermark, text, logo, dark, messy background, cropped, frame, jpeg artifacts, overexposed`

例如选择「戒指 + 复古 + 黄金 + 围一圈小钻」并手打「floral wreath design」：

> ring vintage design yellow gold surrounded by a circle of small diamonds floral wreath design professional jewelry photography, studio lighting, pure white background, high resolution, 8k

## 后端接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET | 公开配置：演示模式标志、积分包、标签体系、负面提示词 |
| `/api/register` | POST | 手机号注册（赠送 3 积分），返回 JWT |
| `/api/login` | POST | 手机号 + 密码登录 |
| `/api/login/wechat` | POST | 微信授权登录（模拟实现，接入真实 code2session 即可） |
| `/api/generate` | POST | 接收垫图 + 标签 + 文字，拼接提示词并生成 1-4 张 |
| `/api/generate/upscale` | POST | 高清放大（消耗 1 积分） |
| `/api/user/credits` | GET | 查询积分余额 |
| `/api/user/history` | GET | 查询后端生成次数记录 |
| `/api/user/transactions` | GET | 查询积分流水 |
| `/api/credits/purchase` | POST | 积分包购买（演示环境直接到账） |

## 项目结构

```text
珠宝设计网站/
├── public/               # 前端（静态资源）
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── server/               # 后端
│   ├── index.js          # Express 入口与全部接口
│   ├── db.js             # SQLite 数据层（sql.js）
│   ├── auth.js           # JWT 签发与校验
│   ├── prompts.js        # 标签体系 + 提示词拼接
│   ├── banana.js         # AI 图生图代理（Gemini/AIMLAPI）+ 演示模式生成器
│   └── data/             # 数据库文件（自动生成，已 gitignore）
├── scripts/
│   ├── api-test.js       # API 端到端测试（npm test）
│   └── ui-test.js        # 浏览器 UI 端到端测试（npm run test:ui）
├── .env.example
└── package.json
```

## 测试

```bash
npm start          # 先启动服务
npm test           # API 端到端测试（61 项断言）
npm run test:ui    # 浏览器 UI 测试（需本机安装 Chrome，36 项断言）
```

UI 测试通过 Chrome DevTools 协议驱动真实页面，覆盖注册、上传、标签选择、提示词预览、单张生成、积分不足弹窗、购买、批量生成、高清放大与 JS 错误检查。

## 部署

项目为纯 Node.js 应用（Express 托管前端静态文件 + sql.js 数据库），无原生编译依赖，Node.js 18+ 即可运行。

### 一键初始化（全新 Ubuntu/Debian 服务器）

在服务器上执行一条命令，自动完成：装 Node.js 20 + Git + PM2 + Nginx → 拉取代码 → 部署启动 → 配置反向代理与开机自启：

```bash
curl -fsSL https://raw.githubusercontent.com/caokelong8888-eng/12/main/setup-server.sh -o setup-server.sh && bash setup-server.sh
```

跑完按提示 `vi /opt/ai-jewelry-design/.env` 填入 `GEMINI_API_KEY`，再 `pm2 restart ai-jewelry-design` 即可上线。

### 方式一：云服务器 + PM2（推荐）

服务器装好 Node.js 20 后，拉取代码一键部署：

```bash
git clone https://github.com/你的用户名/ai-jewelry-design.git
cd ai-jewelry-design
bash deploy.sh          # 自动：装依赖 → 生成 .env → 启动 PM2
vi .env                 # 填入 GEMINI_API_KEY 等真实配置
pm2 restart ai-jewelry-design
```

也可以手动执行：

```bash
# 1. 安装 Node.js 20（推荐用 nvm 或包管理器）
node -v

# 2. 上传代码到服务器（git clone 或 scp），进入项目目录
cd ai-jewelry-design

# 3. 安装依赖（跳过开发依赖）
npm install --omit=dev

# 4. 配置环境变量（关键项：JWT_SECRET、GEMINI_API_KEY、GEMINI_MODEL、GPT_IMAGE_MODEL）
cp .env.example .env
vi .env

# 5. 安装 PM2 并启动
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 按提示执行生成的命令，实现开机自启
```

### 方式二：Docker

```bash
cp .env.example .env   # 先填好配置
docker compose up -d --build
```

数据库通过 volume 持久化在 `./server/data`，升级时 `docker compose pull && docker compose up -d` 即可。

### 反向代理 + HTTPS（Nginx 示例）

```nginx
server {
    listen 443 ssl;
    server_name 你的域名;
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 30m;   # 垫图最大 25MB，需要放宽
    }
}
```

## 部署注意事项

- **JWT_SECRET**：生产环境必须替换为高强度随机值。
- **数据库备份**：定期备份 `server/data/app.db`（单文件，可直接复制）。
- **生产库清理**：本地开发产生的测试账号/记录都在 `server/data/app.db` 里，正式上线前可删除该文件让用户从零注册。
- **网络连通性**：真实生成由服务器调用中转站（gemai.cc），请确保服务器能访问 `api.gemai.cc`。
- **支付**：`/api/credits/purchase` 当前为演示直充，接入真实支付后应在支付回调中校验并入账。
- **微信登录**：`/api/login/wechat` 为模拟实现（code 哈希生成稳定账号），接入真实微信登录时补充 code2session 调用并配置 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`。
- **HEIC**：真实模式可直接透传 HEIC；演示模式仅支持 JPG / PNG。

## 版权

效果图仅供预览参考，裸石边缘可能存在微小误差，实际以工厂制作为准。
