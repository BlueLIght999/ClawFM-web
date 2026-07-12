# Image Generator 微服务

AIGC 图片生成微服务，基于 ComfyUI 后端，提供风景图、音乐风格封面等生成能力。

## 架构定位

```
Qclaudio 主项目 (Node.js, 端口 3333)
        │
        │  HTTP (可选，未来集成)
        ▼
Image Generator 微服务 (Python/FastAPI, 端口 8288)
        │
        │  HTTP /prompt + /history 轮询
        ▼
ComfyUI (Python, 端口 8188)  ← 需独立安装运行
```

**完全独立**：此微服务不依赖主项目的任何代码，主项目也不依赖它。两者通过 HTTP 通信，可独立启停。

## 目录结构

```
microservices/image-generator/
├── main.py                  FastAPI 入口 (路由 + 生命周期)
├── config.py                配置 (环境变量)
├── requirements.txt         运行依赖
├── requirements-dev.txt     测试依赖
├── pytest.ini               pytest 配置
├── start.bat                Windows 启动脚本
├── app/
│   ├── workflow_builder.py  ComfyUI 工作流 JSON 构建器 (纯函数)
│   ├── style_presets.py     风格预设 (landscape / music_cover / abstract / portrait)
│   ├── comfyui_client.py    ComfyUI HTTP 异步客户端
│   └── image_service.py     业务逻辑层 (编排)
└── tests/
    ├── test_workflow_builder.py   22 个测试
    ├── test_style_presets.py      13 个测试
    ├── test_image_service.py       9 个测试
    └── test_api.py                 7 个测试
```

## 快速开始

### 1. 安装并启动 ComfyUI

从 [ComfyUI Releases](https://github.com/comfyanonymous/ComfyUI/releases) 下载 Windows 便携版，解压后运行，默认监听 `http://127.0.0.1:8188`。

放入一个 SDXL checkpoint（如 `sd_xl_base_1.0.safetensors`）到 `ComfyUI/models/checkpoints/`。

### 2. 启动本微服务

```bash
cd microservices/image-generator
start.bat
```

或手动：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

服务启动后访问 `http://localhost:8288/docs` 查看交互式 API 文档。

### 3. 运行测试

```bash
pip install -r requirements-dev.txt
python -m pytest tests/ -v
```

## API 端点

### `GET /api/health`
健康检查，返回微服务与 ComfyUI 的连接状态。

### `GET /api/styles`
返回所有可用风格预设列表。

### `POST /api/generate`
生成图片。

```json
{
  "prompt": "misty mountain valley at sunrise",
  "style": "landscape",
  "width": 1024,
  "height": 1024,
  "steps": 20,
  "cfg": 7.0,
  "seed": -1
}
```

响应：
```json
{
  "image_url": "http://127.0.0.1:8188/view?filename=qclaudio_gen_001.png",
  "seed": 1234567890,
  "generation_time_ms": 3200
}
```

## 风格预设

| 风格 | 关键词 | 默认尺寸 |
|------|--------|---------|
| `landscape` | 风景、自然、电影感光照 | 1280x720 |
| `music_cover` | 专辑封面、唱片套、音乐灵感 | 1024x1024 |
| `abstract` | 抽象艺术、数字绘画 | 1024x1024 |
| `portrait` | 人像、柔光、景深 | 832x1216 |

## 配置 (环境变量)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `COMFYUI_HOST` | 127.0.0.1 | ComfyUI 主机 |
| `COMFYUI_PORT` | 8188 | ComfyUI 端口 |
| `COMFYUI_URL` | http://127.0.0.1:8188 | ComfyUI 完整 URL (覆盖 HOST+PORT) |
| `IMAGE_SERVICE_HOST` | 0.0.0.0 | 本服务监听地址 |
| `IMAGE_SERVICE_PORT` | 8288 | 本服务监听端口 |
| `COMFYUI_POLL_INTERVAL` | 0.5 | 轮询间隔 (秒) |
| `COMFYUI_POLL_TIMEOUT` | 120 | 轮询超时 (秒) |
| `COMFYUI_DEFAULT_CHECKPOINT` | sd_xl_base_1.0.safetensors | 默认模型文件名 |

## 扩展指南

### 添加新风格

编辑 `app/style_presets.py`，在 `_STYLES` 注册表中添加新的 `StylePreset`：

```python
STYLE_CYBERPUNK = StylePreset(
    name="cyberpunk",
    positive_suffix="cyberpunk, neon lights, futuristic city, blade runner aesthetic",
    negative_prompt="blurry, low quality, daylight, rural",
    default_prompt="neon-lit cyberpunk street at night",
    width=1280,
    height=720,
)
```

### 修改工作流

`app/workflow_builder.py` 中的 `build_txt2img_workflow` 是纯函数，修改后直接跑测试验证：

```bash
python -m pytest tests/test_workflow_builder.py -v
```

### 与主项目集成 (未来)

主项目的 Node.js 后端可通过 HTTP 调用本服务：

```javascript
const resp = await fetch('http://localhost:8288/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: songName, style: 'music_cover' })
});
const { image_url } = await resp.json();
```

这不需要修改主项目现有代码——只需在需要的地方调用即可。
