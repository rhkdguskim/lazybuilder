/**
 * Shared types for MCP tool registration.
 *
 * Each tool module exports an `McpTool` describing its name, JSON Schema input,
 * and an async handler. `server.ts` collects all tools and registers them in one
 * loop on the `Server` instance.
 */

export interface McpToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpToolTextContent {
  type: 'text';
  text: string;
}

export interface McpToolResult {
  content: McpToolTextContent[];
  isError?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

/**
 * Standard envelope used across LazyBuilder JSON output. Keeps tool results
 * structurally identical to the existing CLI envelopes so agents can parse them
 * uniformly.
 */
export interface LazyBuilderEnvelope<TKind extends string, TData> {
  schema: 'lazybuilder/v1';
  kind: TKind;
  data: TData;
}

export function envelope<TKind extends string, TData>(
  kind: TKind,
  data: TData,
): LazyBuilderEnvelope<TKind, TData> {
  return { schema: 'lazybuilder/v1', kind, data };
}

/**
 * Build a successful MCP tool result whose content is a single JSON-encoded
 * envelope.
 */
export function jsonResult<TKind extends string, TData>(
  kind: TKind,
  data: TData,
): McpToolResult {
  return {
    content: [
      { type: 'text', text: JSON.stringify(envelope(kind, data)) },
    ],
  };
}

/**
 * Build an MCP error result. Errors are NEVER thrown out of handlers because
 * doing so would close the stdio transport.
 */
export function errorResult(message: string, details?: unknown): McpToolResult {
  const payload =
    details === undefined
      ? { ok: false, error: message }
      : { ok: false, error: message, details };
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(envelope('Error', payload)),
      },
    ],
    isError: true,
  };
}
