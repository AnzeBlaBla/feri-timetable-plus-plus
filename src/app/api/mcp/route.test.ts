import { afterEach, describe, expect, it } from 'vitest';
import { DELETE, POST } from './route';

const initializeRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0',
    },
  },
};

const selectionUrl =
  'http://localhost/api/mcp?programme=1001&year=1&branches=all';

describe('MCP HTTP route', () => {
  let sessionId: string | null = null;

  afterEach(async () => {
    if (sessionId) {
      await DELETE(
        new Request(selectionUrl, {
          method: 'DELETE',
          headers: { 'mcp-session-id': sessionId },
        })
      );
      sessionId = null;
    }
  });

  it('binds an initialized MCP session to its URL selection', async () => {
    const initialized = await POST(
      new Request(selectionUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(initializeRequest),
      })
    );

    expect(initialized.status).toBe(200);
    sessionId = initialized.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const changedSelection = await POST(
      new Request(
        'http://localhost/api/mcp?programme=1002&year=1&branches=all',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            'mcp-session-id': sessionId as string,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        }
      )
    );

    expect(changedSelection.status).toBe(400);
    await expect(changedSelection.json()).resolves.toMatchObject({
      error: {
        code: -32602,
        message: 'The timetable selection cannot change during an MCP session.',
      },
    });
  });
});
