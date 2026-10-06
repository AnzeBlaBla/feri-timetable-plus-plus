import { describe, expect, it } from 'vitest';
import {
  areTimetableSelectionsEqual,
  McpSelectionError,
  parseMcpTimetableSelection,
} from './timetable-selection';

function encodeGroups(groups: Record<string, string[]>): string {
  return Buffer.from(JSON.stringify(groups), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

describe('parseMcpTimetableSelection', () => {
  it('preserves a valid URL-bound timetable selection', () => {
    const groups = encodeGroups({
      Algorithms: ['B', 'A', 'A'],
      Databases: [],
    });
    const selection = parseMcpTimetableSelection(
      new URLSearchParams({
        programme: '1001',
        year: '2',
        branches: 'all',
        groups,
      })
    );

    expect(selection).toEqual({
      programme: '1001',
      year: '2',
      branches: 'all',
      selectedGroups: {
        Algorithms: ['A', 'B'],
        Databases: [],
      },
    });
  });

  it('uses all classes when no explicit groups parameter is supplied', () => {
    const selection = parseMcpTimetableSelection(
      new URLSearchParams({ programme: '1001', year: '1' })
    );

    expect(selection.branches).toBe('all');
    expect(selection.selectedGroups).toEqual({});
  });

  it.each([
    ['missing programme', new URLSearchParams({ year: '1' })],
    [
      'malformed groups',
      new URLSearchParams({
        programme: '1001',
        year: '1',
        groups: 'not valid!',
      }),
    ],
    [
      'non-array group values',
      new URLSearchParams({
        programme: '1001',
        year: '1',
        groups: encodeGroups({ Algorithms: 'A' as unknown as string[] }),
      }),
    ],
  ])('rejects %s', (_, params) => {
    expect(() => parseMcpTimetableSelection(params)).toThrow(McpSelectionError);
  });

  it('compares selections independently of course and group ordering', () => {
    const first = parseMcpTimetableSelection(
      new URLSearchParams({
        programme: '1001',
        year: '1',
        groups: encodeGroups({ Algorithms: ['B', 'A'], Databases: ['C'] }),
      })
    );
    const second = parseMcpTimetableSelection(
      new URLSearchParams({
        programme: '1001',
        year: '1',
        groups: encodeGroups({ Databases: ['C'], Algorithms: ['A', 'B'] }),
      })
    );

    expect(areTimetableSelectionsEqual(first, second)).toBe(true);
  });
});
