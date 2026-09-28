/**
 * @deprecated 已下沉到 domain/shared/ClusterStrategy.js（D10 跨上下文解耦）。
 * 保留此文件仅为兼容既有 import 路径；新代码请直接 import domain/shared/ClusterStrategy.js。
 */
export { ClusterStrategy, KMeansClusterStrategy, DBSCANClusterStrategy } from '../../shared/ClusterStrategy.js';
