import js from '@eslint/js';
import globals from 'globals';

/**
 * ESLint 扁平配置 — 编码 CODING-STYLE.md 的质量规则。
 * 基线：@eslint/js recommended（Airbnb 完整规则集对 ESLint 9 flat config 支持尚不稳定，
 * 先用官方 recommended + 本项目质量门禁规则，后续可叠加 airbnb-base）。
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
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // ── 质量门禁（CODING-STYLE 第1节 / TESTING 圈复杂度）──
      complexity: ['warn', 10],
      'max-lines-per-function': ['warn', { max: 80, skipComments: true, skipBlankLines: true }],
      'max-lines': ['warn', { max: 500, skipComments: true, skipBlankLines: true }],
      'max-depth': ['warn', 4],

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
    files: ['**/__tests__/**', '**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'netease-api/**', 'data/**', 'coverage/**'],
  },
];
