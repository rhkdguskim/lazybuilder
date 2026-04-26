import { runStdioServer } from '../mcp/index.js';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';

const log = logger.child({ component: 'mcpCli' });

/**
 * Entry point for `lazybuilder mcp`.
 *
 * Boots the stdio MCP server and resolves when the transport closes.
 *
 * NEVER write to stdout from this path — stdout is reserved for the MCP
 * transport. Errors and lifecycle messages go to stderr.
 */
export async function runMcpServer(_argv: string[]): Promise<number> {
  try {
    await runStdioServer();
    return 0;
  } catch (err) {
    log.error('mcp server failed', errToLog(err));
    process.stderr.write(
      `[lazybuilder mcp] ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
}
