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

---

# 第二轮：启动与登录链路 Bug 审计

> 日期：2026-07-12
> 环境：Windows 11, Node.js v24.14.1
> 审查范围：`bin/qclaudio.js` → `server.js` 启动链路 + `AuthenticationService` → `netease.js` 登录链路

---

## Bug #9: NeteaseCloudMusicApi 端口冲突导致 QR 码生成挂起 [已修复]

**症状:** 点击 QR LOGIN 后页面永远显示 "Generating QR code..."，二维码不出现，控制台无错误

**原因:** 端口 3000 被系统上另一个 Node 应用（Next.js）占用。`server.js` 中 `startNeteaseApi()` 尝试在 3000 端口启动 NeteaseCloudMusicApi 子进程，但端口已被占用导致子进程崩溃。`waitForNeteaseApi()` 的健康检查只验证 `res.ok`（HTTP 200），没有校验返回内容是否为 NeteaseCloudMusicApi 的 JSON 响应。当端口 3000 上运行的是其他应用时，健康检查持续失败直到 15 秒超时，服务器继续运行但所有网易云 API 调用都收到非 JSON 响应（HTML），`res.json()` 抛出异常被 `callApi` 的 catch 捕获并重新抛出，但错误信息是 `"Unexpected '<' in JSON"` 而非端口冲突提示。

**修复:**
- `server/config.js`：新增 `netease.apiPort` 配置项，默认 3000，可通过环境变量 `NETEASE_API_PORT` 覆盖
- `server/server.js`：`startNeteaseApi` 和 `waitForNeteaseApi` 使用 `config.netease.apiPort`
- `server/services/netease.js`：`API_BASE` 使用 `config.netease.apiPort`
- `waitForNeteaseApi` 健康检查加强：除了 HTTP 200 外，还验证返回 JSON body 包含 `code` 字段（顶层或 `data.code`），确保是 NeteaseCloudMusicApi 而非其他应用

---

## Bug #10: `waitForNeteaseApi` 健康检查 JSON 结构不匹配导致启动超时 [已修复]

**症状:** 服务器启动时输出 `[NeteaseAPI] WARNING: Not ready after timeout, continuing anyway`，等待 15 秒才能继续

**原因:** 健康检查验证 `'code' in body` 只检查顶层 `code` 字段，但 NeteaseCloudMusicApi 的 `/login/status` 响应结构是 `{ data: { code: 200, ... } }`，`code` 在 `data` 里面，顶层不存在。即使 API 已正常运行，健康检查也永远返回 false。

**修复:**
- `server/server.js`：健康检查同时检查 `body.code` 和 `body.data.code`：`'code' in body || (body.data && typeof body.data === 'object' && 'code' in body.data)`

---

## Bug #11: `server.js:241` 日志消息硬编码端口 3000 [已修复]

**症状:** 配置使用非 3000 端口时，日志输出 `[NeteaseAPI] Ready on port 3000` 误导用户

**原因:** `console.log('[NeteaseAPI] Ready on port 3000')` 硬编码字符串

**修复:**
- `server/server.js`：改为 ``console.log(`[NeteaseAPI] Ready on port ${config.netease.apiPort}`)``

---

## Bug #12: NeteaseCloudMusicApi 崩溃后无限重启循环 [已修复]

**严重度:** 中
**位置:** `server/server.js:203-211`

**症状:** 当 NeteaseCloudMusicApi 因端口冲突或其他原因崩溃时，`startNeteaseApi` 的 `close` 事件处理器每 3 秒自动重启一次，永不停止，产生大量日志且无法退出

**原因:**
```javascript
neteaseProc.on('close', (code) => {
  if (code !== 0 && code !== null) {
    setTimeout(() => { startNeteaseApi(); }, 3000);  // 无退出条件
  }
});
```

**修复:**
- `server/server.js`：添加 `neteaseRestartCount` 计数器和 `NETEASE_MAX_RESTARTS = 5` 上限，使用指数退避（3s → 6s → 12s → 24s → 30s cap），超过重试上限后输出明确错误信息并停止重启

---

## Bug #13: `bin/qclaudio.js` 服务器启动崩溃时父进程挂起 30 秒 [已修复]

**严重度:** 高
**位置:** `bin/qclaudio.js:66-82`

**症状:** 服务器在启动过程中崩溃（如 `initDb()` 失败、端口 3333 被占用、模块加载错误），`bin/qclaudio.js` 不输出任何错误信息，挂起 30 秒后输出 `Server failed to start`

**原因:** 启动等待 Promise 只监听 `serverProc.stdout` 中的 "ON AIR" 字符串和 30 秒超时，没有监听 `serverProc` 的 `exit` 事件和 `stderr` 输出

**修复:**
- `bin/qclaudio.js`：添加 `serverProc.on('exit', ...)` 监听器，非零退出码立即 reject 并清除超时定时器

---

## Bug #14: `bin/qclaudio.js` 服务器 stderr 被静默吞掉 [已修复]

**严重度:** 高
**位置:** `bin/qclaudio.js:59-63`

**症状:** 服务器启动期间的任何错误输出（堆栈跟踪、模块加载失败、EADDRINUSE 等）对用户完全不可见

**原因:** `serverProc` 使用 `stdio: 'pipe'`，但只监听了 `stdout`（等待 "ON AIR"），`stderr` 从未被消费

**修复:**
- `bin/qclaudio.js`：添加 `serverProc.stderr.on('data', ...)` 将 stderr 透传到父进程 `console.error`

---

## Bug #15: `netease.js` `callApi` 对非 JSON 响应崩溃且错误信息不明确 [已修复]

**严重度:** 中
**位置:** `server/services/netease.js:34`

**症状:** 当 NeteaseCloudMusicApi 未运行或端口被其他应用占用时，所有 API 调用报错 `Unexpected '<' in JSON at position 0`，不提示端口冲突或服务不可用

**原因:**
```javascript
const body = await res.json();  // HTML 响应时抛 SyntaxError
```

**修复:**
- `server/services/netease.js`：在 `res.json()` 前检查 `Content-Type` 头，非 `application/json` 时抛出明确错误：`"NeteaseCloudMusicApi returned non-JSON response (text/html) — check if port 3000 is occupied by another application"`

---

## Bug #16: `netease.js` cookie 刷新逻辑缺少 301 循环防护 [已修复]

**严重度:** 低
**位置:** `server/services/netease.js:42-56`

**症状:** 当 cookie 过期且 `/login/refresh` 也失败时，重试请求再次返回 301，但代码不检查重试结果的 301 状态，直接返回给调用方

**原因:** 第 42 行检测到 301 后调用 `/login/refresh`，第 53 行重试原始请求，但不检查重试响应是否又是 301

**修复:**
- `server/services/netease.js`：重试后检查 `retryBody.code === 301`，如果仍为 301 则抛出 `"Login expired — please re-login"`

---

## Bug #17: QR 轮询 interval 未在重新点击时清除 [已修复]

**严重度:** 中
**位置:** `server/socket/handler.js:249-270`

**症状:** 用户多次点击 "QR LOGIN" 按钮后，多个 `setInterval` 同时运行，客户端收到重复的 `auth:qr-status` 事件

**原因:**
```javascript
socket.on(EVENTS.AUTH_LOGIN_QR_START, async () => {
  // ...
  const pollInterval = setInterval(async () => { ... }, 2000);
  socket.on('disconnect', () => clearInterval(pollInterval));
});
```
每次触发 `AUTH_LOGIN_QR_START` 都创建新的 interval，但不清除前一次的 interval。`pollInterval` 是局部变量，后续调用无法引用前一次的 interval

**修复:**
- `server/socket/handler.js`：使用 `socket._qrPollInterval` 属性存储 interval ID，新调用前 `clearInterval(socket._qrPollInterval)`，完成后置 null

---

## Bug #18: `LoginOverlay.jsx` 存在永不触发的 `waiting-confirm` 分支 [已修复]

**严重度:** 低
**位置:** `client/src/components/LoginOverlay.jsx:30`

**症状:** 扫码后状态文字不更新（缺少 "Authorizing..." 提示）

**原因:** 前端监听 `data.status === 'waiting-confirm'`，但 `authSessionRules.js` 中 `qrStatusFromCode` 定义的状态只有：`expired`(800)、`waiting-scan`(801)、`scanned`(802)、`success`(803)。不存在 `waiting-confirm` 状态

**修复:**
- `client/src/components/LoginOverlay.jsx`：删除 `waiting-confirm` 死分支

---

## Bug #19: 手机登录 loading 状态 3 秒后无条件重置 [已修复]

**严重度:** 中
**位置:** `client/src/components/LoginOverlay.jsx:63`

**症状:** 如果登录请求超过 3 秒（网络慢或 NeteaseCloudMusicApi 响应慢），登录按钮恢复可点击状态，用户可能重复提交。如果登录失败，用户看不到任何错误提示

**原因:**
```javascript
setTimeout(() => setLoading(false), 3000);
```
定时器不关心请求是否已完成，也不检查是否成功

**修复:**
- `client/src/components/LoginOverlay.jsx`：移除 `setTimeout`，改为在 `auth:login-success` 和 `error` socket 事件回调中重置 loading 状态

---

## Bug #20: 手机登录失败时错误信息被 LoginOverlay 遮挡 [已修复]

**严重度:** 中
**位置:** `client/src/App.jsx:267` + `client/src/components/LoginOverlay.jsx`

**症状:** 手机登录失败时，服务器 emit `EVENTS.ERROR` 事件，`App.jsx` 设置 `error` 状态并在 5 秒后清除。但 LoginOverlay 是全屏覆盖层（`height: 100vh`），错误提示可能被遮挡在登录框后面，用户看不到

**原因:** LoginOverlay 组件没有接收 `error` prop，也没有内置的错误显示区域

**修复:**
- `client/src/App.jsx`：传递 `error` prop 给 LoginOverlay
- `client/src/components/LoginOverlay.jsx`：接收 `error` prop，在登录表单下方显示红色错误信息；同时监听 `error` socket 事件，对 `AUTH_FAILED` / `QR_FAILED` 错误码设置本地 `loginError` 状态

---

## Bug #21: `disconnect` 分支直接操作 scheduler 内部状态 [已修复]

**严重度:** 低（架构）
**位置:** `server/socket/handler.js:378-390`

**症状:** 客户端全部断开时，handler 直接操作 `scheduler.pause()`、`scheduler.playhead.currentSong`、`scheduler.playhead.isPlaying`、`scheduler.coldStartState`，违反 D7 规则

**原因:** 这是尚未提取到 application service 的遗留逻辑

**修复:**
- 新建 `server/application/services/ClientLifecycleService.js` + `server/domain/playback/clientLifecycleRules.js`
- `handler.js` 的 `wireLifecycleEvents` 现在委托 `clientLifecycleService.handleDisconnect(remaining)`，不再直接操作 scheduler 内部状态
- 新增测试：`client-lifecycle-service.test.js`（6 tests）+ `client-lifecycle-rules.test.js`（3 tests）

---

## 本轮涉及文件清单

| 文件 | Bug 编号 | 状态 |
|------|---------|------|
| `server/config.js` | #9 | 已修复 |
| `server/server.js` | #9, #10, #11, #12 | 全部已修复 |
| `server/services/netease.js` | #9, #15, #16 | 全部已修复 |
| `bin/qclaudio.js` | #13, #14 | 全部已修复 |
| `server/socket/handler.js` | #17, #21 | 全部已修复 |
| `client/src/components/LoginOverlay.jsx` | #18, #19, #20 | 全部已修复 |
| `client/src/App.jsx` | #19, #20 | 全部已修复 |

