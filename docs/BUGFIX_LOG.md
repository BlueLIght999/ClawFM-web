# Qclaudio 88.7 — 初次安装 Bug 修复日志

> 日期：2026-05-29  
> 环境：Windows 11, Node.js v24.14.1

---

## Bug #1: Service Worker 拦截 API/Socket.IO 请求导致页面报错

**症状:** 浏览器控制台报 `Failed to fetch`、`FetchEvent resulted in a network error response`

**原因:** `sw.js` 的 fetch 事件监听器拦截了所有请求，包括 `/api/` 和 `/socket.io/` 路径。Socket.IO 使用 HTTP 长轮询，Service Worker 的 `fetch()` 无法正确处理非标准 HTTP 请求，导致前端连接中断。

**修复:**
- `client/public/sw.js`：在 fetch handler 中添加过滤条件，跳过 `method !== 'GET'`、`/api/`、`/socket.io/` 路径的请求
- 更新缓存版本号强制浏览器刷新旧 SW

---

## Bug #2: `bin/window.py` 缺失导致启动崩溃

**症状:** `npm start` 后报错 `can't open file 'bin/window.py': No such file or directory`，服务器启动即退出

**原因:** `bin/qclaudio.js` 启动脚本尝试使用 Python 桌面窗口（`spawn('python', ['window.py'])`），但 `window.py` 文件不存在。

**修复:**
- `bin/qclaudio.js`：检测 `window.py` 是否存在，若不存在则降级为直接打开浏览器（使用系统默认浏览器），并捕获 SIGINT 以优雅退出
- 修复了 `shell: true` 参数传递导致的 `DEP0190` 警告

---

## Bug #3: NeteaseCloudMusicApi 从 GitHub clone 失败

**症状:** `git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git` 连接被重置（国内网络环境不可达）

**原因:** GitHub 直连在部分国内网络环境下不稳定。

**修复:**
- `server/server.js:200`：将 `neteaseApiDir` 从本地 `netease-api/` 子目录改为 npm 已安装的 `node_modules/NeteaseCloudMusicApi`，无需额外 clone
- 该 npm 包已在 `server/package.json` 中声明为依赖（`"NeteaseCloudMusicApi": "^4.32.0"`），直接使用即可

---

## Bug #4: 匿名用户被误判为已登录，无法显示扫码界面

**症状:** 浏览器始终显示主界面冷加载动画，无法回到登录页获取二维码

**原因:** NeteaseCloudMusicApi 在无 cookie 时自动注册匿名用户（`anonimousUser: true`），服务端 `/api/auth/status` 的判断逻辑 `!!(profile || account)` 把匿名账户当作已登录，前端跳过登录页面。

**修复:**
- `server/server.js:37-39`：增加匿名用户检测 `const isAnonymous = account?.anonimousUser === true`，只认真实 profile 才算已登录

---

## Bug #5: 前端 LoginOverlay 没有渲染二维码的能力

**症状:** 点击 QR LOGIN 后只显示静态占位符 "QR HERE"，无二维码图片

**原因:** `LoginOverlay.jsx` 组件中 QR 区域是静态 div，没有：
1. 监听服务端 `auth:qr-created` socket 事件
2. 接收并渲染 base64 二维码图片（`qrimg`）的状态管理

**修复:**
- `client/src/components/LoginOverlay.jsx`：添加 `useEffect` 监听 `auth:qr-created`、`auth:qr-status`、`auth:qr-expired`、`auth:login-success` 事件
- 新增 `qrImage`、`qrStatus` 状态，实时显示二维码图片和扫码状态文字
- 支持 fallback：若无 `qrimg` 则使用 `api.qrserver.com` 生成二维码
- 服务端 `server/socket/handler.js`：补充传递 `qrimg` 字段

---

## Bug #6: QR 扫码状态码 800/803 颠倒

**症状:** 用户扫码授权成功后，服务端将其当作"二维码过期"停止轮询，登录流程中断

**原因:** `server/socket/handler.js` 的 QR 轮询逻辑中，状态码映射完全搞反：

| 码值 | 实际含义 | 修改前（错误） | 修改后 |
|------|---------|---------------|--------|
| 800 | 二维码过期 | 当成登录成功 ❌ | 触发过期提示 |
| 803 | 授权成功 | 当成过期停止轮询 ❌ | 正确触发登录 |

该错误码定义来源于 NeteaseCloudMusicApi 官方文档及 `public/qrlogin.html` 示例。

**修复:**
- `server/socket/handler.js`：调换 800 与 803 的处理逻辑，803 分支中额外调用 `checkLoginStatus()` 获取完整用户 profile 后再发射 `auth:login-success`

---

## Bug #7: `cookies.json` Windows 路径 bug —— cookie 无法持久化

**症状:** 每次扫码登录成功后，刷新页面又回到登录页，cookie 从未保存到磁盘

**根本原因 — Windows 路径正反斜杠:**

`server/utils/cookie-store.js:17` 原代码：
```js
const dir = config.netease.cookieFile.replace(/\/[^/]+$/, '');
```

正则 `\/[^/]+$` 只匹配**正斜杠** `/`，Windows 路径使用**反斜杠** `\`。`replace` 无匹配 → `dir` 保持完整路径 → `fs.mkdirSync(dir)` 在**本应是文件**的位置创建了**目录** → 后续 `writeFileSync` 往目录写文件静默失败 → cookie 丢失。

**修复:**
- `server/utils/cookie-store.js`：导入 `path.dirname`，用 `dirname(config.netease.cookieFile)` 替代正则路径解析，跨平台兼容
- 删除已创建的 `data/cookies.json/` 残留目录

---

## Bug #8: 冷启动 `triggerColdStart` 因队列 `current` 为空而静默跳过

**症状:** 登录后浏览器一直显示加载动画 "QCLADIO 88.7 / CLAWED is warming up the decks..."，永不进入主界面

**原因:** `triggerColdStart()` 的守卫条件包含 `!queue.hasCurrent`。`recommender.fillQueue()` 只将歌曲追加到 `queue.future[]` 列表，没有任何地方调用 `queue.advance()` 将第一首歌推入 `queue.current`。因此 `queue.hasCurrent` 永远为 `false`，冷启动从未执行。

> 注：服务器启动时通过 `server.js` 中的 `scheduler.prepareQueue()` 正常设定了 `current`，但登录回调中重新 `fillQueue()` 后没有再次调用 `prepareQueue()`，导致重新初始化后 `current` 始终为空。

**修复:**
- `server/socket/handler.js` - `triggerColdStart()`：在守卫检查前增加自动 `advance()`：
```js
if (!queue.hasCurrent && queue.future.length > 0) {
  queue.advance();
}
```

---

## 涉及文件清单

| 文件 | 修改内容 |
|------|---------|
| `client/public/sw.js` | 过滤非 GET / API / socket.io 请求 |
| `client/src/components/LoginOverlay.jsx` | 完整的 QR 码接收与渲染逻辑 |
| `client/src/App.jsx` | 传递 `socket` prop 给 LoginOverlay |
| `bin/qclaudio.js` | 处理缺失 `window.py`，降级打开浏览器 |
| `server/server.js` | 使用 npm 模块路径替代 git clone 本地路径；修复匿名用户判断 |
| `server/socket/handler.js` | 修复 QR 状态码 800↔803 颠倒；修复冷启动队列 advance；补充 qrimg 传递 |
| `server/utils/cookie-store.js` | `replace` 正则 → `path.dirname()`，修复 Windows cookie 持久化 |

