# Qclaudio 88.7 — 绞杀重构进度看板

> 实时反映重构进度、优先级、收益目标、灰度迁移状态。
> 配合 `ARCHITECTURE-BASELINE.md` / `TARGET-DIRECTORY.md` / `SEAMS-AND-PORTS.md` 使用。
> **进度以工具输出为准**：`npm run arch:check` 的 error 数 = 剩余架构债。

---

## 0. 当前基线快照（核对时点）

```
测试：   69 passed (16 files)
架构：   ✔ 0 error, 0 warn —— dependency-cruiser 报告 no violations 🎯
domain/：11 纯文件
  environment/formatWeather · hosting/{cleanTtsText,artistName,fallbackTransitionScript,isLlmConfigured}
  · curation/{formatUserCorpus,buildTasteMarkdown,toSongDTO,userCorpusRules,toPlayableSong} · playback/SpeechSession
infrastructure/：storage/{FileCorpus,defaultCorpus} · llm/llmClient（Port 实现 + 接线）
阶段：   P0✅ · P1✅ · P2-Corpus✅ · P2-Llm✅(共享client) · P2-Music(getState 已接 toPlayableSong)
运行：   server 启动正常(ON AIR)，向后兼容验证通过；currentSong 已带 DTO 稳定字段
待办：   upcomingSongs/SONG_CHANGE 尚未接 toPlayableSong（仍原始网易云字段）
```



---

## 1. 按 DDD 领域的重构进度

### 核心域 CORE

```
① 播放调度 Playback ████░░░░░░░░░░░░░░░░  15%
   ✅ SpeechSession(speech-timer, 7测试) 已就位 domain 逻辑
   ⬜ Playhead 未提炼      ⬜ Queue 未脱离 db     ⬜ Transition 未建
   ⬜ scheduler → db+netease 未切

② DJ 主持 Hosting ████████████░░░░░░░░  50%
   ✅ ProactivePolicy 反向依赖🔴 已切(P0-2, EventPublisher)
   ✅ cleanTtsText 纯逻辑已提炼 domain/hosting
   ✅ artistName 提炼(统一 ar[]/artist/artists[])
   ✅ fallbackTransitionScript 提炼(R1 降级路径)
   ⬜ DjPersona 未从 claude.js 拆   ⬜ claude.js OpenAI/db 缠绕未拆

③ 推荐与听单 Curation ██████░░░░░░░░░░░░░░  25%
   ✅ formatUserCorpus 提炼(槽②格式化)
   ✅ buildTasteMarkdown 提炼(taste.md 内容构建)
   ⬜ Recommender → fs+netease 未切(arch warn: recommender→fs)
   ⬜ Planner → OpenAI+db+weather 未切
   ⬜ ListenerProfile/SeedPool 未建
```


### 支撑域 SUPPORTING

```
④ 意图路由 Routing ░░░░░░░░░░░░░░░░░░░░  0%
   ⬜ IntentRouter → netease+claude 未切（Regex 规则未纯化）
```

### 通用域 GENERIC（Port 化）

```
⑤ 音乐源 Music      ░░░░░░░░░░░░  0%  ⬜ MusicSourcePort 未建(ar/al/dt 仍透传前端)
⑥ 语音合成 TTS      ████░░░░░░░░  25% 🟡 cleanTtsText 提炼；SpeechSynthPort 未建
⑦ LLM 网关          ░░░░░░░░░░░░  0%  ⬜ LlmPort 未建(claude/planner 重复 OpenAI)
⑧ 鉴权 Auth         ░░░░░░░░░░░░  0%  ⬜ AuthRepository 未建
⑨ 环境 Environment  ██████░░░░░░  40% 🟡 formatWeather 提炼；WeatherPort 未建
⑩ 持久化 Persistence ░░░░░░░░░░░░  0%  ⬜ 7×Repository 未建(db/history 17散装函数)
⑪ 实时传输 Transport ████████░░░░  60% ✅ EventPublisher 建成并接线(proactive)
```

---

## 2. 需求优先级（P0-P2）

| 优先级 | 需求 | 状态 | 验收信号 |
|--------|------|------|---------|
| **P0-1** | 删死代码 dj-ai/playlist-analyzer | ✅ 完成 | 测试绿 + 模块 23→21 |
| **P0-2** | EventPublisher 切 proactive🔴 | ✅ 完成 | **arch error 1→0** |
| **P1-a** | Weather 纯逻辑提炼 | ✅ 完成 | formatWeather 6测试 |
| **P1-b** | TTS 清洗逻辑提炼 | ✅ 完成 | cleanTtsText 5测试 |
| **P1-c** | LLM 纯逻辑提炼(artistName/fallbackTransition) | ✅ 完成 | artist-name 6 + fallback 3 测试 |
| **P2-a** | UserCorpus 格式化提炼 | ✅ 完成 | format-user-corpus 4 测试 |
| **P2-b** | TasteMarkdown 构建提炼 | ✅ 完成 | build-taste-markdown 4 测试 |
| **P2-a2** | CorpusPort 切 context/recommender→fs | ⬜ 待办 | arch warn 4→1 |
| **P2-c** | 7×Repository 拆 db/history | ⬜ 待办 | queue/scheduler/planner 脱 db |
| **P2-d** | MusicSourcePort 斩 ar/al/dt 透传 | ⬜ 待办 | 前端无网易云字段(artistName 内核已备) |
| **P2-e** | handler.js 拆 application services | ⬜ 待办 | lint 复杂度 86→分散 |

---

## 3. 重构收益目标（可量化）

| 指标 | 起点 | 当前 | 目标 | 度量命令 |
|------|------|------|------|---------|
| 架构 error | 1 | **0** ✅ | 0 | `npm run arch:check` |
| 架构 warn | 4 | **0** ✅ | 0 | `npm run arch:check` |
| 测试数 | 7 | **59** | 覆盖核心域 | `npm test` |
| 死代码文件 | 2 | **0** ✅ | 0 | grep 引用 |
| handler.js 行数 | 671 | 673 | ≤100 | `wc -l` |
| 最大函数复杂度 | 86 | 86 | ≤10 | `npm run lint` |
| 代码重复率 | ~4% | 下降 | ≤5% | `npm run dup:check` |
| domain 纯文件数 | 1 | **9** | 全核心域 | `ls domain/**` |
| 前端网易云字段透传 | 有 | 有(toSongDTO 内核已备) | 无 | grep song.ar/al/dt |

---

## 4. 总进度条

```
绞杀总进度  ████████░░░░░░░░░░░░  约 40%

P0 反向依赖清零   ██████████████████  100% ✅
P1 纯逻辑提炼      ██████████████████  100% ✅ (Weather✅ TTS✅ LLM✅)
P2 依赖健康(warn)  ██████████████████  100% ✅ (fs 依赖清零 4→0 🎯)
P2 Port化+拆分     ██████░░░░░░░░░░░░   30% (Corpus✅ · Llm/Repo/Music/handler⬜)
```


---

## 5. 灰度迁移板块进度（新旧并存策略）

> 绞杀者模式核心：新代码在接缝后逐步接管，旧实现退到接口背后，全程可运行。

| 板块 | 旧实现 | 新实现 | 灰度状态 | 说明 |
|------|--------|--------|---------|------|
| 消息发射 | io.emit 散落 | SocketEventPublisher | 🟢 **proactive 已切换** | handler 其余 io.emit 仍在用旧法，待逐步迁 |
| 天气格式化 | weather.js 内联 | domain/formatWeather | 🟢 **已切换复用** | weather.js 已调用新纯函数 |
| TTS 清洗 | tts.js 两处重复 | domain/cleanTtsText | 🟢 **已切换复用** | 两处均改用新函数 |
| 艺人字段解析 | claude.js getArtistStr | domain/artistName | 🟢 **已切换复用** | getArtistStr 退化为薄委托 |
| 兜底过渡词 | claude.js fallbackTransition | domain/fallbackTransitionScript | 🟢 **已切换复用** | R1 降级路径纯函数化 |
| 用户语料格式 | context.js 内联 | domain/formatUserCorpus | 🟢 **已切换复用** | slotUserCorpus 委托 |
| taste.md 构建 | recommender.js 内联 | domain/buildTasteMarkdown | 🟢 **已切换复用** | 去 new Date 副作用 |
| LLM 调用 | claude/planner new OpenAI | LlmPort | ⚪ 未开始 | 双实例仍在 |
| 数据存储 | db/history 17函数 | 7×Repository | ⚪ 未开始 | 业务直连未改 |
| 音乐源 | netease.js 直连 | MusicSourcePort | ⚪ 未开始 | ar/al/dt 仍透传 |
| socket 编排 | handler 800行 | application services | ⚪ 未开始 | 上帝对象未拆 |

图例：🟢 已灰度切换　🟡 部分　⚪ 未开始

---

## 6. 下一步候选（按收益/风险）

| 候选 | 收益 | 风险 | 消除 |
|------|------|------|------|
| **P2-a CorpusPort** | warn 4→2 | 低 | context.js→fs |
| **P2-b Recommender去fs** | warn -1 | 低 | recommender→fs |
| P1-c LLM纯逻辑 | 备好拆 planner/claude 的内核 | 低 | 重复 OpenAI |
| P2-d MusicSourcePort | 斩前端字段透传(ML2) | 中 | 需配 DTO/VO |
| P2-e handler拆分 | 复杂度 86→分散 | 高 | 上帝对象 |

> 建议顺序：先清 warn（P2-a/b 低风险快速见效）→ 再 LLM 纯逻辑 → 最后攻 handler 拆分（最高风险，放最后）。

---

## 7. 迁移纪律（每步不可破坏）

```
1. 先写失败测试(RED) → 最小实现(GREEN) → 重构(REFACTOR)
2. 每步跑 npm test 全绿 + npm run arch:check 无新增 error
3. 灰度：新实现接线后旧实现才移除，全程项目可运行
4. 不变量 R1-R9 全程不破（尤其 R1 永不静默）
5. 进度看板同步更新（本文件）
```

---

## 一句话进度

> **P0 完成（反向依赖清零，error 1→0）；P1 过半（Weather/TTS 纯逻辑已提炼，LLM 待办）；
> P2 未启（Port化+handler拆分）；总进度约 20%，20 测试全绿，灰度 3 板块已切换。
> 下一步先清 4 个 warn（低风险），handler 拆分留最后。**
