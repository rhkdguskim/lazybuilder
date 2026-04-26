import { BuildIntelligenceService } from '../application/BuildIntelligenceService.js';

const SCHEMA = 'lazybuilder/v1';

export interface IntelligenceCliOptions {
  days: number;
  format: 'ndjson' | 'json';
  since: string | null;
  projectId: string | null;
}

function envelope(kind: string, data: unknown): string {
  return JSON.stringify({ schema: SCHEMA, kind, data });
}

function parseFlags(argv: string[]): IntelligenceCliOptions {
  const opts: IntelligenceCliOptions = {
    days: 7,
    format: 'ndjson',
    since: null,
    projectId: null,
  };
  for (const arg of argv) {
    if (arg.startsWith('--days=')) {
      const v = Number(arg.slice('--days='.length));
      if (Number.isFinite(v) && v > 0) opts.days = Math.floor(v);
    } else if (arg.startsWith('--format=')) {
      const v = arg.slice('--format='.length);
      if (v === 'ndjson' || v === 'json') opts.format = v;
    } else if (arg.startsWith('--since=')) {
      opts.since = arg.slice('--since='.length);
    } else if (arg.startsWith('--project=')) {
      opts.projectId = arg.slice('--project='.length);
    }
  }
  return opts;
}

export async function runRegressions(argv: string[]): Promise<number> {
  const opts = parseFlags(argv);
  const service = new BuildIntelligenceService();
  const report = await service.report({
    days: opts.days,
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
  });
  process.stdout.write(
    envelope('BuildIntelligenceReport', {
      ok: true,
      windowDays: report.windowDays,
      totalBuilds: report.totalBuilds,
      regressions: report.regressions,
    }) + '\n',
  );
  return 0;
}

export async function runFlaky(argv: string[]): Promise<number> {
  const opts = parseFlags(argv);
  const service = new BuildIntelligenceService();
  const report = await service.report({
    days: opts.days,
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
  });
  process.stdout.write(
    envelope('BuildIntelligenceReport', {
      ok: true,
      windowDays: report.windowDays,
      totalBuilds: report.totalBuilds,
      flaky: report.flaky,
    }) + '\n',
  );
  return 0;
}

export async function runMetricsExport(argv: string[]): Promise<number> {
  const opts = parseFlags(argv);
  const service = new BuildIntelligenceService();

  if (opts.format === 'ndjson') {
    const exportOpts: { days: number; since?: string } = { days: opts.days };
    if (opts.since) exportOpts.since = opts.since;
    for await (const line of service.exportNdjson(exportOpts)) {
      process.stdout.write(line);
    }
    return 0;
  }

  // json: bundled envelope with the full window
  const all = await service.loadWindow(opts.days);
  const filtered = opts.since
    ? all.filter(m => {
        const ts = Date.parse(m.ts);
        const cutoff = Date.parse(opts.since!);
        return Number.isFinite(ts) && Number.isFinite(cutoff) && ts >= cutoff;
      })
    : all;
  process.stdout.write(
    envelope('BuildMetrics', {
      ok: true,
      windowDays: opts.days,
      totalBuilds: filtered.length,
      metrics: filtered,
    }) + '\n',
  );
  return 0;
}
