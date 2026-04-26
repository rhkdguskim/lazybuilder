import os from 'node:os';
import type { HardwareInfo } from '../../domain/models/HardwareInfo.js';

const BYTES_PER_GB = 1024 ** 3;

export function detectHardware(): HardwareInfo {
  const cpus = os.cpus();
  return {
    cpuCores: cpus.length || 1,
    cpuModel: cpus[0]?.model?.trim() ?? 'unknown',
    totalMemoryGB: round(os.totalmem() / BYTES_PER_GB),
    freeMemoryGB: round(os.freemem() / BYTES_PER_GB),
    platform: process.platform,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
