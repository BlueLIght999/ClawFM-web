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
      comment: 'D2: domain 禁止 import node 内置模块。例外: profile/events/ 需要 EventEmitter。',
      from: { path: '^domain/', pathNot: ['^domain/profile/events/'] },
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
    // D10 跨限界上下文耦合（domain/<A> → domain/<B>）
    //
    // 这条规则填补了 D1-D9 的盲区：既有规则要么是顶层层级规则
    // （^domain/ → ^(application|...)/，结构上永远不会对 domain→domain 触发），
    // 要么是写死单文件的探测，因此 domain/community → domain/profile
    // 这类同层跨上下文依赖此前完全不可见。
    //
    // $1 是 from 的捕获组回引用：同上下文内部的嵌套 import
    // （如 profile/enrichment → profile/search）必须保持合法。
    // 共享原语下沉到 domain/shared/，由下方豁免放行。
    //
    // 已清零并收紧为 error（原为 warn + 存量违规 13 处）。共享内核抽取见
    // domain/shared/；新增共享原语时不要塞进某个上下文再对外 export。
    // ───────────────────────────────────────────────────────────
    {
      name: 'target-domain-no-cross-context',
      severity: 'error',
      comment:
        'D10: domain/<A> 禁止 import domain/<B>。限界上下文之间通过 application 层编排通信，' +
        '不直接 import。纯共享原语（songId/artistName/toSongDTO 等）下沉到 domain/shared/。',
      from: { path: '^domain/([^/]+)/', pathNot: ['^domain/shared/'] },
      to: {
        path: '^domain/([^/]+)/',
        pathNot: ['^domain/$1/', '^domain/shared/'],
      },
    },
    {
      name: 'target-domain-shared-must-be-pure',
      severity: 'error',
      comment:
        'shared kernel 防腐：domain/shared 不得反向依赖任何具体上下文或外层，' +
        '否则它退化为新的耦合中转站，跨上下文依赖绕道它继续存在。',
      from: { path: '^domain/shared/' },
      to: { path: '^(domain/(?!shared/)|application|infrastructure|interface|services|db|socket)/' },
    },

    // ───────────────────────────────────────────────────────────
    // Agent 模块隔离守卫（server/agent/ 内部四层）
    // ───────────────────────────────────────────────────────────
    {
      name: 'agent-domain-is-pure',
      severity: 'error',
      comment: 'D1: agent/domain 禁止依赖 application/infrastructure/interface。',
      from: { path: '^agent/domain/' },
      to: { path: '^(agent/application|agent/infrastructure|application|infrastructure|interface|services|db|socket)/' },
    },
    {
      name: 'agent-domain-no-node-builtins',
      severity: 'error',
      comment: 'D2: agent/domain 禁止 import node 内置模块。',
      from: { path: '^agent/domain/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'agent-application-no-outer-layer',
      severity: 'error',
      comment: 'D3/D4: agent/application 禁止依赖 infrastructure/interface/services/db/socket。',
      from: { path: '^agent/application/' },
      to: { path: '^(agent/infrastructure|infrastructure|interface|services|db|socket)/' },
    },
    {
      name: 'agent-infrastructure-no-interface',
      severity: 'error',
      comment: 'D6: agent/infrastructure 禁止依赖 interface/socket 边界。',
      from: { path: '^agent/infrastructure/' },
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
      comment:
        '孤儿模块（无人引用）——死代码候选，如 dj-ai.js / playlist-analyzer.js。' +
        '注意 ports/ 不加 ^ 锚点：depcruise 的 pathNot 在不同输出模式下给出的' +
        '路径可能不带前导目录，锚定 ^application/ports/ 会漏匹配。',
      from: {
        orphan: true,
        pathNot: [
          '\\.(test|spec)\\.js$',
          '\\.d\\.ts$',
          '(^|/)index\\.js$',
          '(^|/)server\\.js$',
          'ports/', // 端口与 @typedef 契约文件本就没有运行时引用者
          'Port\\.js$',
          'Repository\\.js$', // 纯 @typedef 的仓储契约
          '^agent/index\\.js$',
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
    exclude: { path: '(node_modules|__tests__|netease-api|vitest\\.config\\.js|eslint\\.config\\.js)' },
    tsPreCompilationDeps: false,
    combinedDependencies: false,
  },
};
