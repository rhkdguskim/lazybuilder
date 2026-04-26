import type { McpTool } from '../types.js';
import { scanTools } from './scan.js';
import { diagnosticsTools } from './diagnostics.js';
import { toolchainTools } from './toolchain.js';
import { buildTools } from './build.js';
import { metricsTools } from './metrics.js';

export const allTools: McpTool[] = [
  ...scanTools,
  ...diagnosticsTools,
  ...toolchainTools,
  ...buildTools,
  ...metricsTools,
];
