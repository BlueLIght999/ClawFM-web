/**
 * 基准专用 vitest 配置 —— 默认不跑。
 *
 * 与 vitest.config.js 的唯一差别是 include 收窄到 *-bench.test.js，
 * 于是默认配置里那条 exclude（把基准挡在门禁外）在这里不适用。
 *
 * 为什么不直接在默认配置上加个环境变量开关：门禁是 `npm run quality`
 * 一条链，任何「看环境变量决定跑不跑」的写法都会让门禁的实际覆盖面
 * 取决于调用者当时的环境。两份配置是显式的，读的人一眼能看出跑的是哪套。
 */
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*-bench.test.js'],
    exclude: configDefaults.exclude,
  },
});
