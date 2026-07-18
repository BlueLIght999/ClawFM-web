# Qclaudio 88.7 — 安装指南

当前应用版本：`2.0.0`。该版本前端使用 Socket Song 协议 v2；服务端仍双发 v1 事件供旧客户端过渡。

AI DJ 电台，24/7 播放网易云音乐，支持自然语言点歌和 AI 语音主持。

## 前置要求

- **Node.js** >= 18（推荐 20+）
- **npm** >= 9
- 一个**网易云音乐账号**（用于扫码登录获取歌曲）

## 安装步骤

### 1. 解压并安装依赖

```bash
cd qclaudio
npm install
cd server
npm install
cd ..
```

### 2. 下载 NetEaseCloudMusicApi

电台需要一个网易云音乐 API 代理才能获取歌曲。

```bash
cd server
git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git netease-api
cd netease-api
npm install
cd ../..
```

### 3. 配置 API Key

复制 `.env.example` 为 `.env`，填入你的密钥：

```bash
cp .env.example .env
```

然后编辑 `.env` 文件：

- `DEEPSEEK_API_KEY`：在 [platform.deepseek.com](https://platform.deepseek.com) 注册获取（新用户有免费额度）
- `DASHSCOPE_API_KEY`：在 [dashscope.aliyun.com](https://dashscope.aliyun.com) 注册获取（阿里云，有免费额度）

> **关于费用**：DeepSeek 和 DashScope 都是你自己的账户，费用从你自己账户扣除。AI DJ 每次对话消耗约 0.001 元人民币。TTS 语音合成有免费额度。

### 4. 启动

```bash
npm start
```

启动器会完成端口身份检查，等待 `/health/ready` 确认服务可用后，再用 Microsoft Edge 打开 `http://localhost:3333`。

无需打开浏览器时运行：

```bash
npm start -- --no-open
```

启动前只做诊断、不修改文件：

```bash
npm run doctor
```

如果 doctor 报告某个 workspace 缺少依赖，可显式执行：

```bash
npm run repair
```

`repair` 只处理 root/server/client 中实际缺依赖的 workspace，使用各自 lockfile 执行 `npm ci`，完成后再次运行 preflight 验证。该命令可能访问 npm registry 并重建对应 `node_modules`，但不会修改 `package.json` 或 lockfile。Node 版本、必要文件或端口配置仍有错误时，修复会在写入前停止。

如果 doctor 显示 `Client build: STALE`，正常启动会自动重新构建。也可以显式强制构建：

```bash
npm start -- --force-build
```

启动器会检查 Node/npm、必要文件、运行依赖、`.env` 和端口配置。缺少依赖时会给出具体 workspace 和包名；普通启动不会自动联网安装，只有用户主动执行 `npm run repair` 才会修复依赖。

验证完整启动和关闭链路：

```bash
npm run test:launcher-system
```

首次使用需要扫码登录网易云账号。

## 目录结构

```
qclaudio/
├── client/           # React 前端（Vite）
│   ├── src/
│   └── dist/         # 已构建好的静态文件
├── server/           # Express + Socket.IO 后端
│   ├── services/     # AI DJ、推荐系统、TTS 等
│   ├── socket/       # WebSocket 事件处理
│   └── prompts/      # DJ 人设 Prompt
├── user/             # 你的听歌偏好配置（可自由编辑）
│   ├── taste.md      # 音乐口味
│   ├── routines.md   # 日常听歌习惯
│   └── mood-rules.md # 心情→音乐映射
├── SETUP.md          # 本文件
└── .env.example      # 环境变量模板
```

## 自定义你的 DJ

编辑 `user/` 目录下的 Markdown 文件：

- `taste.md` — 填入你喜欢的歌手、风格
- `routines.md` — 不同时间段的听歌偏好
- `mood-rules.md` — 不同心情对应的音乐风格

DJ 会自动读取这些文件来个性化推荐。

## 常见问题

**Q: 启动后浏览器一片空白？**
确保在项目根目录运行 `npm start`，而不是 server 目录。新版启动器只会在后端 ready 后打开浏览器；若端口被其他服务占用，会直接输出冲突端口而不是打开空白页。

**Q: 扫码登录失败？**
确认 `server/node_modules/NeteaseCloudMusicApi` 已安装，并检查 `.env` 中的 `NETEASE_API_PORT`（默认 `4001`）是否被其他程序占用。启动器不会自动终止未知进程。

**Q: 如何检查服务是否已经就绪？**
访问 `http://localhost:3333/health/ready`。它只表示 Qclaudio 主进程已可接收请求；包含外部依赖状态的完整检查仍使用 `/health`。

**Q: 为什么启动时自动重新构建前端？**
启动器会对 `client/src`、`client/public`、入口文件和 package lock 计算内容指纹。源码变化或首次建立指纹时会构建一次，成功后记录到 `data/runtime/startup-state.json`；内容未变化时不会重复构建。

**Q: DJ 不说话（只有文字没有语音）？**
检查 `.env` 中的 `DASHSCOPE_API_KEY` 是否正确。TTS 不可用时 DJ 会降级为纯文字模式。

**Q: 如何更新到最新版本？**
找我拿最新的 zip 包，覆盖后重新 `npm install`。
