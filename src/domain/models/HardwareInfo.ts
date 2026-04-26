export interface HardwareInfo {
  cpuCores: number;
  cpuModel: string;
  totalMemoryGB: number;
  freeMemoryGB: number;
  platform: NodeJS.Platform;
}
