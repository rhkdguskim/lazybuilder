/**
 * Per-workspace-folder cache of EnvironmentSnapshot and ProjectScanResult.
 *
 * Phase C-1 strategy: keep it simple. One context per folder URI, 5 minute TTL.
 * Cache keyed on the folder root path (fsPath of the LSP folder URI, or a
 * derived best-guess root for files outside any workspace folder).
 */
import { dirname } from 'node:path';
import { EnvironmentService } from '../application/EnvironmentService.js';
import { ProjectScanService } from '../application/ProjectScanService.js';
import type { EnvironmentSnapshot } from '../domain/models/EnvironmentSnapshot.js';
import type { ProjectInfo, SolutionInfo } from '../domain/models/ProjectInfo.js';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';

const log = logger.child({ component: 'lsp/workspace' });

const TTL_MS = 5 * 60 * 1000;

export interface WorkspaceContext {
  rootPath: string;
  snapshot: EnvironmentSnapshot;
  projects: ProjectInfo[];
  solutions: SolutionInfo[];
}

interface CacheEntry {
  context: WorkspaceContext;
  expiresAt: number;
}

/**
 * Decode an LSP `file://` URI to an absolute filesystem path.
 *
 * Avoids depending on `vscode-uri` since it isn't already in dependencies.
 * Handles percent-encoding and Windows drive letters.
 */
export function uriToFsPath(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  let path = uri.slice('file://'.length);
  // file:///C:/foo  → leading slash before drive letter on Windows
  if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(path)) {
    path = path.slice(1);
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // leave as-is on malformed sequences
  }
  return path;
}

export class LspWorkspace {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<WorkspaceContext>>();
  private readonly envService = new EnvironmentService();
  private readonly scanService = new ProjectScanService();
  private workspaceRoots: string[] = [];

  /** Replace the set of known workspace folder roots (fs paths). */
  setRoots(roots: string[]): void {
    this.workspaceRoots = roots.slice();
  }

  /**
   * Resolve the best workspace root for a given document URI. Uses the
   * registered workspace folders if any contain the file; otherwise falls
   * back to the file's directory.
   */
  resolveRootForUri(uri: string): string {
    const fsPath = uriToFsPath(uri);
    for (const root of this.workspaceRoots) {
      if (fsPath === root || fsPath.startsWith(root + '/') || fsPath.startsWith(root + '\\')) {
        return root;
      }
    }
    return dirname(fsPath);
  }

  /** Force-invalidate every cached context (e.g. on didChangeConfiguration). */
  invalidateAll(): void {
    this.cache.clear();
  }

  async getContext(rootPath: string): Promise<WorkspaceContext> {
    const now = Date.now();
    const cached = this.cache.get(rootPath);
    if (cached && cached.expiresAt > now) return cached.context;

    const existingFlight = this.inflight.get(rootPath);
    if (existingFlight) return existingFlight;

    const flight = (async () => {
      try {
        const [snapshot, scan] = await Promise.all([
          this.envService.scan(),
          this.scanService.scan(rootPath),
        ]);
        const context: WorkspaceContext = {
          rootPath,
          snapshot,
          projects: scan.projects,
          solutions: scan.solutions,
        };
        this.cache.set(rootPath, { context, expiresAt: Date.now() + TTL_MS });
        return context;
      } catch (err) {
        log.warn('failed to build workspace context', { rootPath, ...errToLog(err) });
        // Return a graceful empty context so the LSP keeps responding.
        const empty: WorkspaceContext = {
          rootPath,
          snapshot: (await this.envService.scan().catch(() => ({} as EnvironmentSnapshot))) as EnvironmentSnapshot,
          projects: [],
          solutions: [],
        };
        return empty;
      } finally {
        this.inflight.delete(rootPath);
      }
    })();

    this.inflight.set(rootPath, flight);
    return flight;
  }
}

export type SupportedDocKind = 'csproj' | 'globalJson' | 'unsupported';

export function classifyDocument(uri: string): SupportedDocKind {
  const lower = uri.toLowerCase();
  if (
    lower.endsWith('.csproj') ||
    lower.endsWith('.fsproj') ||
    lower.endsWith('.vbproj') ||
    lower.endsWith('.vcxproj')
  ) {
    return 'csproj';
  }
  if (lower.endsWith('/global.json') || lower.endsWith('\\global.json') || lower.endsWith('global.json')) {
    return 'globalJson';
  }
  return 'unsupported';
}
