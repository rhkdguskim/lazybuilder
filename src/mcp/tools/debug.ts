import { DebuggerService } from '../../application/DebuggerService.js';
import type { McpTool } from '../types.js';
import { errorResult, jsonResult } from '../types.js';

/**
 * Singleton DebuggerService — MCP tools share one in-process session manager
 * so `debug.start` followed by `debug.set_breakpoint` / `debug.snapshot` /
 * `debug.continue` / etc. all hit the same active session. D-1 MVP allows
 * exactly one active session at a time.
 *
 * Tests may swap this via `_setDebuggerServiceForTests` before importing the
 * tool list (or use `_resetForTests` between cases).
 */
let debuggerService: DebuggerService = new DebuggerService();

export function _setDebuggerServiceForTests(svc: DebuggerService): void {
  debuggerService = svc;
}

export function _getDebuggerServiceForTests(): DebuggerService {
  return debuggerService;
}

function readString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((s): s is string => typeof s === 'string');
}

function readEnv(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

const debugStart: McpTool = {
  name: 'debug.start',
  description:
    'Start a debug session for a .NET project. Spawns netcoredbg, performs the DAP initialize/launch handshake, and returns a sessionId. The project must already be built.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description:
          'Absolute or relative path to a .csproj (or a directory containing exactly one).',
      },
      configuration: {
        type: 'string',
        description: 'Build configuration. Defaults to "Debug".',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Program arguments passed to the launched assembly.',
      },
      env: {
        type: 'object',
        description:
          'Extra environment variables for the debuggee. String values only.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['project'],
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const project = readString(args['project']);
      if (!project) return errorResult('project is required.');
      const configuration = readString(args['configuration']);
      const result = await debuggerService.start({
        project,
        configuration,
        args: readStringArray(args['args']),
        env: readEnv(args['env']),
      });
      return jsonResult('DebugSession', { ok: true, ...result });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};

const debugSetBreakpoint: McpTool = {
  name: 'debug.set_breakpoint',
  description:
    'Add a breakpoint at file:line for the active session. Optionally pass a `condition` (DAP conditional breakpoint expression).',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      file: { type: 'string' },
      line: { type: 'number' },
      condition: { type: 'string' },
    },
    required: ['sessionId', 'file', 'line'],
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const sessionId = readString(args['sessionId']);
      const file = readString(args['file']);
      const line = readNumber(args['line']);
      if (!sessionId) return errorResult('sessionId is required.');
      if (!file) return errorResult('file is required.');
      if (line === undefined) return errorResult('line is required.');
      const condition = readString(args['condition']);
      const result = await debuggerService.setBreakpoint({
        sessionId,
        file,
        line,
        condition,
      });
      return jsonResult('DebugBreakpoint', { ok: true, ...result });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};

function makeStepTool(
  name: string,
  method: 'continue' | 'stepOver' | 'stepIn' | 'stepOut',
  description: string,
): McpTool {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        threadId: { type: 'number' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
    handler: async (args) => {
      try {
        const sessionId = readString(args['sessionId']);
        if (!sessionId) return errorResult('sessionId is required.');
        const threadId = readNumber(args['threadId']);
        const result = await debuggerService[method]({ sessionId, threadId });
        return jsonResult('DebugStep', { ...result });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

const debugContinue = makeStepTool(
  'debug.continue',
  'continue',
  'Resume execution after a stop. The session must be stopped.',
);
const debugStepOver = makeStepTool(
  'debug.step_over',
  'stepOver',
  'Step over the current statement (DAP `next`). The session must be stopped.',
);
const debugStepIn = makeStepTool(
  'debug.step_in',
  'stepIn',
  'Step into the call at the current statement. The session must be stopped.',
);
const debugStepOut = makeStepTool(
  'debug.step_out',
  'stepOut',
  'Step out of the current frame. The session must be stopped.',
);

const debugEvaluate: McpTool = {
  name: 'debug.evaluate',
  description:
    'Evaluate an expression in the REPL context of the current stop. Returns the formatted value and (when known) the type.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      expression: { type: 'string' },
      frameId: { type: 'number' },
    },
    required: ['sessionId', 'expression'],
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const sessionId = readString(args['sessionId']);
      const expression = readString(args['expression']);
      if (!sessionId) return errorResult('sessionId is required.');
      if (!expression) return errorResult('expression is required.');
      const frameId = readNumber(args['frameId']);
      const result = await debuggerService.evaluate({
        sessionId,
        expression,
        frameId,
      });
      return jsonResult('DebugEvaluate', { ok: true, ...result });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};

const debugSnapshot: McpTool = {
  name: 'debug.snapshot',
  description:
    'Capture the current stop as one structured payload: stack frames, locals per frame, source snippets around each line, and active breakpoints. The session must be stopped.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      maxStackFrames: { type: 'number' },
      maxLocalsPerFrame: { type: 'number' },
      sourceContextLines: { type: 'number' },
    },
    required: ['sessionId'],
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const sessionId = readString(args['sessionId']);
      if (!sessionId) return errorResult('sessionId is required.');
      const payload = await debuggerService.snapshot({
        sessionId,
        maxStackFrames: readNumber(args['maxStackFrames']),
        maxLocalsPerFrame: readNumber(args['maxLocalsPerFrame']),
        sourceContextLines: readNumber(args['sourceContextLines']),
      });
      return jsonResult('DebugSnapshot', { ok: true, snapshot: payload });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};

const debugTerminate: McpTool = {
  name: 'debug.terminate',
  description:
    'Disconnect from the debug adapter and kill the debuggee. Safe to call even if the session has already exited.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
    },
    required: ['sessionId'],
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const sessionId = readString(args['sessionId']);
      if (!sessionId) return errorResult('sessionId is required.');
      const result = await debuggerService.terminate({ sessionId });
      return jsonResult('DebugStep', { ...result });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const debugTools: McpTool[] = [
  debugStart,
  debugSetBreakpoint,
  debugContinue,
  debugStepOver,
  debugStepIn,
  debugStepOut,
  debugEvaluate,
  debugSnapshot,
  debugTerminate,
];
