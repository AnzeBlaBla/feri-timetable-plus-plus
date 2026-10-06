import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LectureWise } from '@/types/types';
import { createTimetableMcpServer } from './server';

const { lectures } = vi.hoisted(() => ({
  lectures: [
  {
    id: 'algorithms',
    start_time: '2026-10-05T08:00:00.000Z',
    end_time: '2026-10-05T09:30:00.000Z',
    courseId: '1',
    course: 'Algorithms',
    eventType: '',
    note: '',
    executionTypeId: '1',
    executionType: 'Lecture',
    branches: [],
    rooms: [],
    groups: [{ id: 1, name: 'A' }],
    lecturers: [],
    showLink: '',
    color: '',
    colorText: '',
  },
  ] as LectureWise[],
}));

vi.mock('./schedule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./schedule')>();
  return {
    ...actual,
    getSelectionLectures: vi.fn().mockResolvedValue(lectures),
  };
});

describe('timetable MCP server', () => {
  const connections: Array<{ client: Client; server: ReturnType<typeof createTimetableMcpServer> }> = [];

  afterEach(async () => {
    await Promise.all(
      connections.splice(0).flatMap(({ client, server }) => [
        client.close(),
        server.close(),
      ])
    );
  });

  async function connect() {
    const server = createTimetableMcpServer({
      programme: '1001',
      year: '1',
      branches: 'all',
      selectedGroups: { Algorithms: ['A'] },
    });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
    connections.push({ client, server });
    return client;
  }

  it('advertises its tools and selection resource, then serves a daily schedule', async () => {
    const client = await connect();
    const tools = await client.request(
      { method: 'tools/list', params: {} },
      ListToolsResultSchema
    );
    const resources = await client.request(
      { method: 'resources/list', params: {} },
      ListResourcesResultSchema
    );
    const resource = await client.request(
      { method: 'resources/read', params: { uri: 'timetable://selection' } },
      ReadResourceResultSchema
    );
    const schedule = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'get_day_schedule',
          arguments: { date: '2026-10-05' },
        },
      },
      CallToolResultSchema
    );

    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'get_day_schedule',
        'get_week_schedule',
        'search_schedule',
        'get_schedule_filter_options',
      ])
    );
    expect(resources.resources).toContainEqual(
      expect.objectContaining({ uri: 'timetable://selection' })
    );
    expect(resource.contents[0].text).toContain('"programme": "1001"');
    expect(schedule.structuredContent).toMatchObject({
      range: { start_date: '2026-10-05', end_date: '2026-10-05' },
      events: [expect.objectContaining({ course: 'Algorithms' })],
    });
  });
});
