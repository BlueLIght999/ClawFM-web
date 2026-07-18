# Qclaudio 2.0.0 重构进度

> 更新时间：2026-07-18
> 方法：TDD（RED → GREEN → REFACTOR）+ 绞杀者模式
> 当前节点：启动器 P2 完成，Socket Song 协议 v2 完成

## 总览

Qclaudio 已从“legacy 服务直接编排”推进到“Port/Repository 接缝 + 应用服务 + 版本化 Socket 契约”的过渡状态。旧实现仍保留在兼容层，新实现通过接缝逐步接管，避免一次性重写。

当前版本：`2.0.0`

| 指标 | 当前结果 |
|------|----------|
| 后端测试 | `161` 个文件，`1368` 个测试通过 |
| 前端测试 | `53` 个文件，`255` 个测试通过 |
| ESLint | `0 errors`，`36` 条既有 warning |
| 架构检查 | `0 errors`，`10` 条既有 orphan warning |
| 前端构建 | 通过，主 JS gzip 约 `80 KB` |
| npm audit | `0 vulnerabilities` |
| 启动器系统测试 | 真实启动/关闭链通过 |
| doctor | `READY / CURRENT` |

## 已完成节点

### 1. 启动器 P0/P1/P2

- `/health/ready` 作为确定性 readiness 身份契约。
- 等待 ready 后才打开 Microsoft Edge，支持 `--no-open`。
- 识别新实例、legacy Qclaudio 和外部端口占用，不杀未知进程。
- ready 前启动失败直接退出，ready 后崩溃才使用有界退避重启。
- Windows 使用 `process.execPath`、`shell:false` 和 IPC 逐层关闭。
- 启动前执行 Node/npm、文件、依赖、环境和端口预检。
- 对前端源码计算 SHA-256 构建指纹，避免 dist 过期。
- `npm run doctor` 只读诊断；`npm run repair` 才执行显式依赖修复。
- repair 只对缺依赖 workspace 顺序执行 lockfile 驱动的 `npm ci`，并在结束后复检。

### 2. 后端绞杀接缝

- `MusicSourcePort` 包装 NetEase，输出稳定 `Song` DTO。
- Queue、ListenHistory、Profile、SeedPool、Chat、Plan、Auth Repository 已接线。
- Playback、Conversation、ColdStart、Authentication、DJ Speech、Streaming Conversation 等应用服务已承接 handler 分支。
- recommender、scheduler 的主要 IO 依赖已改为注入 Port/Repository。
- 纯规则已逐步沉入 `domain/curation`、`domain/playback`、`domain/hosting` 和 `domain/routing`。

### 3. Socket Song 协议 v2

服务端现在对携带 Song 的事件双发：

| 兼容事件 v1 | 正式事件 v2 | v2 处理 |
|-------------|-------------|---------|
| `radio:state` | `radio:state-v2` | current/upcoming Song 只保留稳定字段 |
| `radio:song-change` | `radio:song-change-v2` | song 只保留稳定字段 |
| `radio:queue-update` | `radio:queue-update-v2` | 队列 Song 只保留稳定字段 |

v2 payload 带 `schemaVersion: 2`，Song 形态固定为：

```text
{ id, title, artist, album, durationMs, coverUrl }
```

旧客户端继续消费 v1；2.0.0 前端只订阅 v2。Service Worker 已升级为 `qclaudio-v7`，避免缓存旧客户端代码。

## TDD 产物

- `radio-event-v2.test.js`：稳定 Song 投影、空值和队列映射。
- `versioned-radio-emitter.test.js`：v1/v2 双发契约。
- `radio-event-emission-seam.test.js`：禁止 socket/http 绕过统一 emitter。
- `StableSongArchitecture.test.js`：禁止前端生产代码读取 `ar/al/dt` 或订阅 v1 Song 事件。
- `version-2-contract.test.js`：package、lockfile、readiness 和 Service Worker 版本一致性。
- `startup-repair-rules.test.js`、`startup-dependency-repair.test.js`：P2 repair 规则、阻塞和复检。

## 已知遗留

- v1 Socket 事件仍保留原始字段，作为一个大版本过渡兼容；删除前必须重新进行协议版本决策。
- 仍有 `36` 条 ESLint warning，主要集中在既有复杂度、测试 helper 和 orphan 模块。
- `10` 条架构 warning 是 orphan 提示，不是 dependency error。
- REST 接口仍未整体迁移到 `/api/v1`，本节点不扩大 REST 破坏性变更范围。
- `socket/handler.js` 仍是组合入口，剩余复杂度应继续拆到 application service 或纯规则模块。

## 下一节点

按紧急度和收益排序：

1. **scheduler 规则深化**：提炼播放推进、transition 和 refill 的纯规则，保持 R1“电台不静默”。
2. **recommender 规则深化**：继续拆推荐策略选择、种子池和偏好匹配，补 characterization tests。
3. **proactive 规则深化**：锁住播放/播报冲突、频率限制和降级行为，再拆 application 编排。
4. **v1 下线评估**：收集客户端升级覆盖率后，决定是否删除 v1 事件，不提前删除。
5. **warning 清理**：只处理明确归因的 warning，不进行无关格式化或大范围搬目录。

## 回归门禁

```bash
cd server && npm test
cd client && npm test
cd client && npm run build
cd server && npm run lint
cd server && npm run arch:check
cd .. && npm run test:launcher-system
cd .. && npm run doctor
```

所有新切口继续遵守：先写失败测试，最小实现通过后再重构；不改变现有 Socket v1、REST 路径和核心播放行为，除非先建立新的版本化契约。
