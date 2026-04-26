import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';
import { allTools } from './tools/index.js';
import { errorResult, type McpToolResult } from './types.js';

const log = logger.child({ component: 'McpServer' });

const SERVER_NAME = 'lazybuilder';
const SERVER_VERSION = '0.1.1';

/**
 * Build a configured MCP `Server` instance with all LazyBuilder tools registered.
 * Caller is responsible for connecting a transport.
 */
export function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const tool = allTools.find((t) => t.name === name);
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    let result: McpToolResult;
    if (!tool) {
      result = errorResult(`Unknown tool: ${name}`);
    } else {
      try {
        result = await tool.handler(args);
      } catch (err) {
        // Defensive: handlers should already swallow their own errors. If one
        // escapes, surface it as an error result rather than tearing down the
        // transport.
        log.error('tool handler threw', { tool: name, ...errToLog(err) });
        result = errorResult(
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    // The CallToolResultSchema accepts `content` plus optional `isError` —
    // cast through `unknown` because the SDK's broader `ServerResult` union
    // includes other shapes (task results) that don't apply here.
    return result as unknown as Record<string, unknown>;
  });

  return server;
}

/**
 * Run the MCP server over stdio. Resolves when the transport closes.
 *
 * IMPORTANT: stdout is owned by the MCP transport. Logging must go to file
 * (default Logger sink) or to stderr only.
 */
export async function runStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Resolve when the transport closes (parent disconnects, EOF on stdin, etc.).
  await new Promise<void>((resolve, reject) => {
    transport.onclose = () => {
      log.info('mcp transport closed');
      resolve();
    };
    transport.onerror = (err: Error) => {
      log.error('mcp transport error', errToLog(err));
      reject(err);
    };

    server
      .connect(transport)
      .then(() => {
        log.info('mcp server connected', {
          name: SERVER_NAME,
          version: SERVER_VERSION,
          toolCount: allTools.length,
        });
      })
      .catch((err: unknown) => {
        log.error('mcp server connect failed', errToLog(err));
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}
