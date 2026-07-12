/**
 * dependency-cruiser 架构检验配置
 * 编码 ARCHITECTURE-BASELINE.md 的核心依赖禁令 D1-D9。
 *
 * 当前代码尚未完成 DDD 分层迁移，因此规则分两类：
 *   [现状违规探测] 针对当前 services/ 扁平结构，捕获已知违规（应报红）
 *   [目标分层守卫] 针对目标 domain/application/infrastructure/interface 结构，
 *                  迁移过程中逐步生效
 *
 * 验收标准（工具有效性）：对已知违规 proactive.js → socket/events.js 必须报错。
 * 若此配置运行后零违规，说明规则未生效，工具无意义。
 */
module.exports = {
  forbidden: [
    // ───────────────────────────────────────────────────────────
    // D4 / 🔴 最严重：禁止内层 import 外层（反向依赖）
    // 已知违规：services/proactive.js → socket/events.js
    // ───────────────────────────────────────────────────────────
    {
      name: 'no-domain-to-interface',
      severity: 'error',
      comment:
        'D4: 领域/服务层禁止 import 接口层(socket/)。' +
        '已知违规 proactive.js→socket/events.js 必须在此被捕获。',
      from: { path: '^services/' },
      to: { path: '^socket/' },
    },

    // ───────────────────────────────────────────────────────────
    // D8 目标守卫：业务代码不得直连具体基础设施（迁移完成后生效）
    // 当前 services 间直连允许，待 Port 接缝插入后收紧
    // ───────────────────────────────────────────────────────────
    {
      name: 'no-domain-to-node-builtins',
      severity: 'warn',
      comment:
        'D2: 纯领域对象不应 import node 内置(fs等)。' +
        '当前 recommender/context 直连 fs 为已知 🟠 违规，标记为 warn 追踪。',
      from: { path: '^services/(recommender|context)\\.js$' },
      to: { dependencyTypes: ['core'], path: '^(fs|path)$' },
    },

    // ───────────────────────────────────────────────────────────
    // 目标四层守卫：新建 application/infrastructure 代码从一开始受约束
    // ───────────────────────────────────────────────────────────
    {
      name: 'target-domain-is-pure',
      severity: 'error',
      comment: 'D1: domain 禁止依赖 application/infrastructure/interface/services/db/socket。',
      from: { path: '^domain/' },
      to: { path: '^(application|infrastructure|interface|services|db|socket)/' },
    },
    {
      name: 'target-domain-no-node-builtins',
      severity: 'error',
      comment: 'D2: domain 禁止 import node 内置模块。',
      from: { path: '^domain/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'target-application-no-outer-layer',
      severity: 'error',
      comment: 'D3/D4: application 只能依赖 domain 与自身 ports，禁止依赖 infrastructure/interface/services/db/socket。',
      from: { path: '^application/' },
      to: { path: '^(infrastructure|interface|services|db|socket)/' },
    },
    {
      name: 'target-infrastructure-no-interface',
      severity: 'error',
      comment: 'D6: infrastructure 禁止依赖 interface/socket 边界。',
      from: { path: '^infrastructure/' },
      to: { path: '^(interface|socket)/' },
    },

    // ───────────────────────────────────────────────────────────
    // 通用健康规则
    // ───────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      severity: 'error',
      comment: '禁止循环依赖',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: '孤儿模块（无人引用）——死代码候选，如 dj-ai.js / playlist-analyzer.js',
      from: {
        orphan: true,
        pathNot: [
          '\\.(test|spec)\\.js$',
          '\\.d\\.ts$',
          '(^|/)index\\.js$',
          '(^|/)server\\.js$',
          '^application/ports/',
          '^evaluation/runBadCaseAttribution\\.js$',
          '^evaluation/runProductEffectEvaluation\\.js$',
          '\\.cjs$',
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|__tests__|netease-api)' },
    tsPreCompilationDeps: false,
    combinedDependencies: false,
  },
};
