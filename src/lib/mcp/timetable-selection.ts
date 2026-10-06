import { SelectedGroups } from '@/types/timetable';

const MAX_GROUPS_PARAM_LENGTH = 8_192;
const MAX_COURSES = 200;
const MAX_GROUPS_PER_COURSE = 100;
const MAX_VALUE_LENGTH = 160;

export class McpSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpSelectionError';
  }
}

export interface McpTimetableSelection {
  programme: string;
  year: string;
  branches: string;
  selectedGroups: SelectedGroups;
}

function requireSingleValue(searchParams: URLSearchParams, name: string): string | null {
  const values = searchParams.getAll(name);

  if (values.length > 1) {
    throw new McpSelectionError(`The "${name}" parameter must only be provided once.`);
  }

  return values[0] ?? null;
}

function validateIdentifier(value: string | null, name: string): string {
  if (!value || value.length > MAX_VALUE_LENGTH || value.trim() !== value) {
    throw new McpSelectionError(`A valid "${name}" parameter is required.`);
  }

  return value;
}

function parseBranches(value: string | null): string {
  if (!value || value === 'all') {
    return 'all';
  }

  if (value.length > MAX_VALUE_LENGTH) {
    throw new McpSelectionError('The "branches" parameter is too long.');
  }

  const branchIds = value.split(',');
  if (
    branchIds.length === 0 ||
    branchIds.length > 50 ||
    branchIds.some((branchId) => !branchId || branchId.length > MAX_VALUE_LENGTH)
  ) {
    throw new McpSelectionError('The "branches" parameter is invalid.');
  }

  return branchIds.join(',');
}

function parseSelectedGroups(value: string | null): SelectedGroups {
  if (!value) {
    return {};
  }

  if (
    value.length > MAX_GROUPS_PARAM_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new McpSelectionError('The "groups" parameter is invalid.');
  }

  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    throw new McpSelectionError('The "groups" parameter must contain valid group selections.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new McpSelectionError('The "groups" parameter must contain a group-selection object.');
  }

  const entries = Object.entries(parsed);
  if (entries.length > MAX_COURSES) {
    throw new McpSelectionError('Too many courses were supplied in the group selection.');
  }

  const selectedGroups: SelectedGroups = {};
  for (const [course, groups] of entries) {
    if (
      !course ||
      course.length > MAX_VALUE_LENGTH ||
      !Array.isArray(groups) ||
      groups.length > MAX_GROUPS_PER_COURSE ||
      groups.some(
        (group) =>
          typeof group !== 'string' ||
          !group ||
          group.length > MAX_VALUE_LENGTH
      )
    ) {
      throw new McpSelectionError('The "groups" parameter contains an invalid course or group.');
    }

    selectedGroups[course] = [...new Set(groups)].sort();
  }

  return selectedGroups;
}

export function parseMcpTimetableSelection(
  searchParams: URLSearchParams
): McpTimetableSelection {
  return {
    programme: validateIdentifier(
      requireSingleValue(searchParams, 'programme'),
      'programme'
    ),
    year: validateIdentifier(requireSingleValue(searchParams, 'year'), 'year'),
    branches: parseBranches(requireSingleValue(searchParams, 'branches')),
    selectedGroups: parseSelectedGroups(requireSingleValue(searchParams, 'groups')),
  };
}

export function timetableSelectionKey(selection: McpTimetableSelection): string {
  return JSON.stringify({
    programme: selection.programme,
    year: selection.year,
    branches: selection.branches,
    selectedGroups: Object.fromEntries(
      Object.entries(selection.selectedGroups)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([course, groups]) => [course, [...groups].sort()])
    ),
  });
}

export function areTimetableSelectionsEqual(
  left: McpTimetableSelection,
  right: McpTimetableSelection
): boolean {
  return timetableSelectionKey(left) === timetableSelectionKey(right);
}
