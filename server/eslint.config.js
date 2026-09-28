import js from '@eslint/js';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';

/**
 * ESLint 扁平配置 — 编码 CODING-STYLE.md 的质量规则。
 * 基线：@eslint/js recommended（Airbnb 完整规则集对 ESLint 9 flat config 支持尚不稳定，
 * 先用官方 recommended + 本项目质量门禁规则，后续可叠加 airbnb-base）。
 * 叠加 eslint-plugin-sonarjs recommended：补足官方 recommended 不覆盖的
 * 认知复杂度、重复分支、冗余布尔表达式等「可修复性/延展性」信号。
 *
 * 质量门禁对应 CODING-STYLE.md / ERROR-HANDLING.md：
 *   complexity ≤ 10        圈复杂度（方法）
 *   max-lines-per-function  方法 ≤ 80 行
 *   max-lines               文件 ≤ 500 行
 *   no-empty (catch)        禁止吞没异常 (EH1)
 *   eqeqeq / no-var / prefer-const  Airbnb 关键条目
 */
export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    plugins: { sonarjs },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      // ── 质量门禁（CODING-STYLE 第1节 / TESTING 圈复杂度）──
      complexity: ['warn', 10],
      'max-lines-per-function': ['warn', { max: 80, skipComments: true, skipBlankLines: true }],
      'max-lines': ['warn', { max: 500, skipComments: true, skipBlankLines: true }],
      'max-depth': ['warn', 4],

      // ── sonarjs 精确调整 ───────────────────────────────────
      // 核心 no-unused-vars 已覆盖同一问题，且遵守 ^_ 约定；sonarjs 版本不认
      // ignoreRestSiblings，会把「解构剔除字段」惯用法（const { raw: _raw, ...safe } = obj）
      // 误报为未使用变量。保留核心规则，关掉这条重复且更严的实现。
      'sonarjs/no-unused-vars': 'off',

      // ── 禁止吞没异常 (ERROR-HANDLING EH1)──
      'no-empty': ['error', { allowEmptyCatch: false }],

      // ── Airbnb 关键条目 (CODING-STYLE 第2节)──
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // 测试文件放宽：vitest 全局 + 允许更长
    //
    // sonarjs 的测试规则以「测试即断言」的假设为前提，与本项目的契约/特征测试
    // 风格不符，逐条放宽而非整体关闭：
    //   no-clear-text-protocols   测试固件用 http:// 起本地假服务，非真实明文流量
    //   prefer-specific-assertions 断言消息是本项目刻意的可读性选择
    //   parameterized-tests       显式枚举用例比 it.each 更易定位失败点
    //   explicit-test-skip        describe.skip 是暂时禁用整套行为的常规手段
    //   no-floating-point-equality 期望值是常量折叠的结果，非浮点比较语义
    //   pseudo-random/publicly-writable-directories/no-ignored-exceptions
    //                             测试替身与临时目录的常规用法
    files: ['**/__tests__/**', '**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      'sonarjs/prefer-specific-assertions': 'off',
      'sonarjs/parameterized-tests': 'off',
      'sonarjs/explicit-test-skip': 'off',
      'sonarjs/no-floating-point-equality': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/publicly-writable-directories': 'off',
      'sonarjs/no-ignored-exceptions': 'off',
      'sonarjs/no-trivial-assertions': 'off',
      'sonarjs/no-dead-store': 'off',
      'sonarjs/unused-import': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'netease-api/**', 'data/**', 'coverage/**'],
  },
];
