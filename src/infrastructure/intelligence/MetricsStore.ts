import { mkdir, appendFile, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { BuildMetric } from '../../domain/models/BuildMetric.js';
import { logger, errToLog } from '../logging/Logger.js';

const log = logger.child({ component: 'MetricsStore' });

/**
 * Append-only ndjson store for {@link BuildMetric} records.
 *
 * Layout: `~/.lazybuilder/metrics-YYYYMMDD.ndjson` — one file per UTC day so
 * range queries (e.g. last 7 days) can short-circuit by file name. Corrupt or
 * partial lines are skipped during reads so a torn write never poisons the
 * whole window.
 */
export class MetricsStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), '.lazybuilder');
  }

  /** Append a single metric to today's ndjson file. */
  async append(metric: BuildMetric): Promise<void> {
    await this.ensureDir();
    const file = this.fileForDate(metric.ts);
    const line = JSON.stringify(metric) + '\n';
    await appendFile(file, line, 'utf-8');
  }

  /**
   * Load all metrics whose source file falls inside the trailing `days` window
   * (inclusive of today). Corrupt lines are skipped silently — see class doc.
   */
  async loadWindow(days: number): Promise<BuildMetric[]> {
    if (!existsSync(this.baseDir)) return [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    let entries: string[];
    try {
      entries = await readdir(this.baseDir);
    } catch (err) {
      log.warn('readdir failed', { dir: this.baseDir, ...errToLog(err) });
      return [];
    }

    const metricFiles = entries
      .filter(name => /^metrics-\d{8}\.ndjson$/.test(name))
      .filter(name => {
        const stamp = name.slice('metrics-'.length, 'metrics-'.length + 8);
        const fileTs = stampToUtcMs(stamp);
        if (fileTs == null) return false;
        // include the day if any of its 24h overlaps the window
        return fileTs + 24 * 60 * 60 * 1000 - 1 >= cutoff;
      });

    const out: BuildMetric[] = [];
    for (const name of metricFiles) {
      const filePath = join(this.baseDir, name);
      let raw: string;
      try {
        raw = await readFile(filePath, 'utf-8');
      } catch (err) {
        log.warn('failed to read metrics file', { filePath, ...errToLog(err) });
        continue;
      }
      const lines = raw.split('\n');
      for (const line of lines) {
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as BuildMetric;
          if (parsed && typeof parsed === 'object' && 'ts' in parsed) {
            const tsMs = Date.parse(parsed.ts);
            if (Number.isFinite(tsMs) && tsMs >= cutoff) {
              out.push(parsed);
            }
          }
        } catch {
          // skip corrupt line
        }
      }
    }
    return out;
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  private fileForDate(iso: string): string {
    const d = new Date(iso);
    const stamp = utcDateStamp(Number.isFinite(d.getTime()) ? d : new Date());
    return join(this.baseDir, `metrics-${stamp}.ndjson`);
  }
}

function utcDateStamp(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function stampToUtcMs(stamp: string): number | null {
  if (stamp.length !== 8) return null;
  const y = Number(stamp.slice(0, 4));
  const m = Number(stamp.slice(4, 6));
  const d = Number(stamp.slice(6, 8));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return Date.UTC(y, m - 1, d);
}
