/**
 * CLI entry that boots the LazyBuilder LSP server in stdio mode.
 *
 * Returns a Promise<number> exit code, but in practice the LSP transport keeps
 * the process alive until the client disconnects (which terminates the
 * process directly). The promise is wired so callers can `await` it without
 * spinning.
 */
import { runStdioServer } from '../lsp/index.js';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';

const log = logger.child({ component: 'cli/lspCli' });

export async function runLspServer(_argv: string[]): Promise<number> {
  try {
    runStdioServer();
  } catch (err) {
    log.error('lsp server failed to start', errToLog(err));
    process.stderr.write(`[lazybuilder] lsp server failed: ${(err as Error).message ?? err}\n`);
    return 1;
  }
  // The LSP `connection.listen()` call detaches from this stack; the Node
  // event loop is held open by the stdio streams. Resolve only when the
  // process is shutting down.
  return new Promise<number>((resolve) => {
    const finish = (code: number) => resolve(code);
    process.on('exit', () => finish(0));
    process.on('SIGINT', () => finish(0));
    process.on('SIGTERM', () => finish(0));
  });
}
