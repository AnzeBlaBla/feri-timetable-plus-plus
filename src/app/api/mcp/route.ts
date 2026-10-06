import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { randomUUID } from 'crypto';
import { createTimetableMcpServer } from '@/lib/mcp/server';
import {
  areTimetableSelectionsEqual,
  McpSelectionError,
  McpTimetableSelection,
  parseMcpTimetableSelection,
} from '@/lib/mcp/timetable-selection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface McpSession {
  selection: McpTimetableSelection;
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}

const sessions = new Map<string, McpSession>();

function errorResponse(status: number, code: number, message: string): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    },
    { status }
  );
}

function getSelection(request: Request): McpTimetableSelection | Response {
  try {
    return parseMcpTimetableSelection(new URL(request.url).searchParams);
  } catch (error) {
    const message =
      error instanceof McpSelectionError
        ? error.message
        : 'The timetable selection is invalid.';
    return errorResponse(400, -32602, message);
  }
}

function getSessionId(request: Request): string | null {
  return request.headers.get('mcp-session-id');
}

async function handleRequest(request: Request): Promise<Response> {
  const selection = getSelection(request);
  if (selection instanceof Response) {
    return selection;
  }

  const sessionId = getSessionId(request);
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return errorResponse(404, -32001, 'Unknown MCP session.');
    }

    if (!areTimetableSelectionsEqual(session.selection, selection)) {
      return errorResponse(
        400,
        -32602,
        'The timetable selection cannot change during an MCP session.'
      );
    }

    return session.transport.handleRequest(request);
  }

  let initializedSessionId: string | undefined;
  const server = createTimetableMcpServer(selection);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    enableJsonResponse: true,
    onsessioninitialized: (newSessionId) => {
      initializedSessionId = newSessionId;
      sessions.set(newSessionId, { selection, server, transport });
    },
    onsessionclosed: async (closedSessionId) => {
      const session = sessions.get(closedSessionId);
      sessions.delete(closedSessionId);
      await session?.server.close();
    },
  });

  await server.connect(transport);
  const response = await transport.handleRequest(request);

  if (!initializedSessionId) {
    await server.close();
  }

  return response;
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleRequest(request);
}
