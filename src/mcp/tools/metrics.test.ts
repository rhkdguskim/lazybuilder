import { describe, it, expect, beforeEach, vi } from 'vitest';

const reportMock = vi.fn<(opts: { days?: number; projectId?: string }) => Promise<unknown>>();

vi.mock('../../application/BuildIntelligenceService.js', () => ({
  BuildIntelligenceService: class {
    report(opts: { days?: number; projectId?: string }) {
      return reportMock(opts);
    }
  },
}));

const { metricsTools } = await import('./metrics.js');
const getMetrics = metricsTools.find(t => t.name === 'get_metrics')!;

interface Envelope<K extends string, D> {
  schema: 'lazybuilder/v1';
  kind: K;
  data: D;
}
function parseEnvelope<K extends string = string, D = unknown>(text: string) {
  return JSON.parse(text) as Envelope<K, D>;
}

beforeEach(() => {
  vi.clearAllMocks();
  reportMock.mockResolvedValue({ regressions: [], flaky: [] });
});

describe('get_metrics tool', () => {
  it('declares expected metadata', () => {
    expect(getMetrics.name).toBe('get_metrics');
    expect(getMetrics.inputSchema.type).toBe('object');
  });

  it('returns BuildIntelligenceReport envelope with ok=true on success', async () => {
    const result = await getMetrics.handler({});
    const env = parseEnvelope<
      'BuildIntelligenceReport',
      { ok: boolean; days: number; projectId: string | null; report: unknown }
    >(result.content[0]!.text);
    expect(env.kind).toBe('BuildIntelligenceReport');
    expect(env.data.ok).toBe(true);
    expect(env.data.days).toBe(7);
    expect(env.data.projectId).toBeNull();
  });

  it('forwards days and projectId into the report call', async () => {
    await getMetrics.handler({ days: 30, projectId: 'abc' });
    expect(reportMock).toHaveBeenCalledWith({ days: 30, projectId: 'abc' });
  });

  it('omits projectId when not provided', async () => {
    await getMetrics.handler({ days: 14 });
    const callArg = reportMock.mock.calls[0]![0];
    expect('projectId' in callArg).toBe(false);
    expect(callArg.days).toBe(14);
  });

  it('coerces non-numeric days to default 7', async () => {
    await getMetrics.handler({ days: 'lots' as unknown as number });
    const callArg = reportMock.mock.calls[0]![0];
    expect(callArg.days).toBe(7);
  });

  it('returns error envelope when report throws after service is found', async () => {
    reportMock.mockRejectedValueOnce(new Error('report-explode'));
    const result = await getMetrics.handler({});
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('report-explode');
  });

  it('awaits a synchronous report return value', async () => {
    reportMock.mockReturnValueOnce({ sync: true } as unknown as Promise<unknown>);
    const result = await getMetrics.handler({});
    const env = parseEnvelope<
      'BuildIntelligenceReport',
      { ok: boolean; report: { sync: boolean } }
    >(result.content[0]!.text);
    expect(env.data.ok).toBe(true);
    expect(env.data.report.sync).toBe(true);
  });

  // Keep the "import-fails" case last — vi.resetModules + vi.doMock
  // contaminates the module registry for subsequent tests in this file.
  it('returns ok=false reason="service-not-available" when import fails', async () => {
    vi.resetModules();
    vi.doMock('../../application/BuildIntelligenceService.js', () => {
      throw new Error('module-missing');
    });

    const reloaded = await import('./metrics.js');
    const tool = reloaded.metricsTools.find(t => t.name === 'get_metrics')!;
    const result = await tool.handler({});
    const env = parseEnvelope<
      'BuildIntelligenceReport',
      { ok: boolean; reason?: string }
    >(result.content[0]!.text);
    expect(env.data.ok).toBe(false);
    expect(env.data.reason).toBe('service-not-available');
  });
});
