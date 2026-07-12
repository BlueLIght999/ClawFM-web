# Bad Case 归因体系

Bad Case 不是“感觉不好”的泛化标签，而是把用户体感转成可观测、可归因、可量化的判断。当前体系先落在离线评测集，后续可接入真实 telemetry。

## 运行方式

```bash
cd server
npm run eval:badcase
```

配套单元测试：

```bash
cd server
npm test -- bad-case-attribution.test.js
```

## 文件

- `server/domain/evaluation/badCaseAttribution.js`：Bad Case 归因纯函数。
- `server/evaluation/badCaseEvalSet.js`：离线坏例样本。
- `server/evaluation/runBadCaseAttribution.js`：命令行入口，输出 JSON 报告。
- `server/__tests__/bad-case-attribution.test.js`：TDD 回归测试。

## 三层定义

| 层级 | 定义 | 当前规则 |
| --- | --- | --- |
| 硬 Bad | 客观判死，无需人工体感判断 | 艺人/实体错配、安全违规、格式解析失败、应答未答 |
| 软 Bad | 没有硬错，但体验明显变差 | 推荐后 15 秒内切歌，并在 60 秒内出现明确负反馈 |
| 边界 Bad | 技术上可运行，但业务场景不可接受 | 安全且可答的问题被拒答比例超过 30% |

软 Bad 特别要求交叉信号：单独 skip 不直接判 Bad，必须叠加用户负反馈，降低误判。

## 动作到归因链条

每个坏例输出统一链条：

```text
action -> signal -> classification -> rootCause
```

### 链条示例

| 场景 | 动作 | 可观测信号 | 分层 | 根因 |
| --- | --- | --- | --- | --- |
| 用户要周杰伦，却推荐林俊杰 | `recommend_song` | `entity_mismatch` | `hard` | `music_entity_mapping_error` |
| 用户想放松，推荐重金属后快速切歌且说不想听 | `recommend_song` | `skip_plus_negative_feedback` | `soft` | `preference_alignment_gap` |
| 安全可答问题频繁拒答 | `answer_user` | `safe_refusal_rate_high` | `boundary` | `safety_threshold_too_strict` |
| 意图控制返回截断 JSON | `route_intent` | `format_parse_failed` | `hard` | `response_contract_broken` |

## 当前报告结构

`npm run eval:badcase` 会输出：

- `summary.totalCases`：坏例总数。
- `summary.byLayer`：按 hard/soft/boundary 分层统计。
- `summary.byAction`：按触发动作统计，例如 `recommend_song`、`answer_user`。
- `summary.byRootCause`：按根因统计，例如 `preference_alignment_gap`。
- `cases[].attributionChain`：每个坏例的动作-归因链条。

## 下一步建设

1. 在 Socket 与 service 边界补 telemetry adapter，把真实 `recommend_song`、`answer_user`、`route_intent` 动作事件写入同一事件格式。
2. 扩展软 Bad 代理信号：冗余回复、风格不符、相似歌理解偏差，都必须定义行为或反馈代理指标。
3. 扩展边界 Bad：一致性差、过于激进、公平性偏倚，优先从重复意图回答和用户分群失败率开始。
4. 把 `eval:product` 的 attention 项和 `eval:badcase` 的 rootCause 关联，形成“指标变差 -> 坏例 -> 根因”的闭环。
