/**
 * LazyBuilder LSP server (Phase C-1 MVP).
 *
 * Wires up vscode-languageserver over stdio, registers diagnostic + hover
 * providers, and proxies into existing application services via LspWorkspace.
 *
 * IMPORTANT: stdout is owned by the LSP RPC transport. Do NOT console.log here
 * — use the file-based logger in `infrastructure/logging/Logger.ts`.
 */
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeParams,
  type InitializeResult,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';
import { LspWorkspace, uriToFsPath } from './workspace.js';
import { computeDiagnostics } from './providers/diagnosticProvider.js';
import { computeHover } from './providers/hoverProvider.js';

const log = logger.child({ component: 'lsp/server' });

/**
 * Boots the LSP server on stdio. Synchronous (createConnection().listen() is
 * the standard pattern for vscode-languageserver). The Node process stays
 * alive on the LSP transport until the client disconnects.
 */
export function runStdioServer(): void {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const workspace = new LspWorkspace();

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    const folders = (params.workspaceFolders ?? []).map((f) => uriToFsPath(f.uri));
    const fallback = params.rootUri ? [uriToFsPath(params.rootUri)] : params.rootPath ? [params.rootPath] : [];
    workspace.setRoots(folders.length > 0 ? folders : fallback);
    log.info('lsp initialize', { folders: folders.length > 0 ? folders : fallback });
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        diagnosticProvider: {
          interFileDependencies: false,
          workspaceDiagnostics: false,
        },
      },
    };
  });

  connection.onInitialized(() => {
    log.info('lsp initialized');
  });

  connection.onDidChangeConfiguration(() => {
    workspace.invalidateAll();
    log.info('configuration changed; cache invalidated');
    // Re-run diagnostics for all open documents.
    for (const doc of documents.all()) {
      void publishDiagnostics(doc);
    }
  });

  async function publishDiagnostics(doc: TextDocument): Promise<void> {
    try {
      const root = workspace.resolveRootForUri(doc.uri);
      const ctx = await workspace.getContext(root);
      const diagnostics = await computeDiagnostics(doc.uri, doc.getText(), ctx);
      void connection.sendDiagnostics({ uri: doc.uri, diagnostics });
    } catch (err) {
      log.warn('failed to publish diagnostics', { uri: doc.uri, ...errToLog(err) });
      void connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
    }
  }

  documents.onDidOpen((evt) => {
    void publishDiagnostics(evt.document);
  });

  documents.onDidChangeContent((evt) => {
    void publishDiagnostics(evt.document);
  });

  connection.onHover(async (params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;
    try {
      const root = workspace.resolveRootForUri(doc.uri);
      const ctx = await workspace.getContext(root);
      return await computeHover(doc.uri, doc.getText(), params.position, ctx);
    } catch (err) {
      log.warn('hover failed', { uri: doc.uri, ...errToLog(err) });
      return null;
    }
  });

  // Pull-mode diagnostics (LSP 3.17+).
  connection.languages.diagnostics.on(async (params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) {
      return { kind: 'full' as const, items: [] };
    }
    try {
      const root = workspace.resolveRootForUri(doc.uri);
      const ctx = await workspace.getContext(root);
      const items = await computeDiagnostics(doc.uri, doc.getText(), ctx);
      return { kind: 'full' as const, items };
    } catch (err) {
      log.warn('pull diagnostics failed', { uri: doc.uri, ...errToLog(err) });
      return { kind: 'full' as const, items: [] };
    }
  });

  documents.listen(connection);
  connection.listen();
}
