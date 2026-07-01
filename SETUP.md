# Qclaudio 88.7 — 安装指南

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

打开浏览器访问 `http://localhost:3333`。

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
确保在项目根目录运行 `npm start`，而不是 server 目录。

**Q: 扫码登录失败？**
检查 `server/netease-api/` 是否已正确安装并启动（端口 3000）。

**Q: DJ 不说话（只有文字没有语音）？**
检查 `.env` 中的 `DASHSCOPE_API_KEY` 是否正确。TTS 不可用时 DJ 会降级为纯文字模式。

**Q: 如何更新到最新版本？**
找我拿最新的 zip 包，覆盖后重新 `npm install`。
