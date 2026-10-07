import type { Programme } from '@/types/types';
import type { CalendarEvent, SelectedGroups, TimetableSelection } from '@/types/timetable';

export const TIMETABLE_COLORS = ['#198754', '#dc3545', '#0d6efd', '#6f42c1'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSelectedGroups(value: unknown): SelectedGroups {
  if (!isRecord(value)) throw new Error('Each timetable needs a valid group selection.');
  const entries = Object.entries(value).map(([course, selected]) => {
    if (!Array.isArray(selected) || !selected.every(group => typeof group === 'string')) {
      throw new Error('Each timetable needs a valid group selection.');
    }
    return [course, selected] as const;
  });
  return Object.fromEntries(entries);
}

export function parseTimetablesParam(value: string): TimetableSelection[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('The shared timetable selection is invalid.');
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 4) {
    throw new Error('Choose between one and four timetables.');
  }

  const ids = new Set<string>();
  return parsed.map((item, index) => {
    if (!isRecord(item)) throw new Error('The shared timetable selection is invalid.');
    const id = typeof item.id === 'string' ? item.id : '';
    const programmeId = typeof item.programmeId === 'string' ? item.programmeId : '';
    const year = typeof item.year === 'string' ? item.year : '';
    const branches = typeof item.branches === 'string' ? item.branches : 'all';
    const label = typeof item.label === 'string' ? item.label : '';
    const color = typeof item.color === 'string' ? item.color : TIMETABLE_COLORS[index];
    if (!/^[\da-z_-]{1,64}$/i.test(id) || ids.has(id) || !programmeId || !/^\d+$/.test(year) || !branches || !/^#[\da-f]{6}$/i.test(color)) {
      throw new Error('The shared timetable selection is invalid.');
    }
    ids.add(id);
    return {
      id,
      programmeId,
      year,
      branches,
      selectedGroups: parseSelectedGroups(item.selectedGroups),
      label,
      color,
    };
  });
}

export function serializeTimetables(entries: TimetableSelection[]): string {
  return JSON.stringify(entries.map(({ id, programmeId, year, branches, selectedGroups, label, color }) => ({
    id, programmeId, year, branches, selectedGroups, label, color,
  })));
}

export function validateTimetableSelections(entries: TimetableSelection[], programmes: Programme[]): void {
  for (const entry of entries) {
    const programme = programmes.find(item => item.id === entry.programmeId);
    const year = Number(entry.year);
    if (!programme || !Number.isInteger(year) || year < 1 || year > Number(programme.year)) {
      throw new Error(`Programme or year is unavailable for timetable “${entry.label || entry.programmeId}”.`);
    }
  }
}

export function timetableDisplayName(entry: TimetableSelection, programmes: Programme[]): string {
  if (entry.label.trim()) return entry.label.trim();
  const programme = programmes.find(item => item.id === entry.programmeId);
  return `${programme?.name || entry.programmeId} · Year ${entry.year}`;
}

export function decorateTimetableEvents(
  events: CalendarEvent[],
  entry: TimetableSelection,
  label: string,
  colorMode: 'course' | 'timetable'
): CalendarEvent[] {
  const hex = entry.color.slice(1);
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const textColor = luminance < 0.55 ? '#ffffff' : '#000000';

  return events.map(event => ({
    ...event,
    id: `${entry.id}-${event.id}`,
    backgroundColor: colorMode === 'timetable' ? entry.color : event.backgroundColor,
    borderColor: colorMode === 'timetable' ? entry.color : event.borderColor,
    textColor: colorMode === 'timetable' ? textColor : event.textColor,
    extendedProps: {
      ...event.extendedProps,
      timetableId: entry.id,
      timetableLabel: label,
      timetables: [{ id: entry.id, label, color: entry.color }],
    },
  }));
}

export function mergeTimetableEvents(events: CalendarEvent[], colorMode: 'course' | 'timetable'): CalendarEvent[] {
  const merged = new Map<string, CalendarEvent>();
  const names = (value = '') => value.split(',').map(name => name.trim()).sort();
  for (const event of events) {
    const props = event.extendedProps;
    const key = JSON.stringify([
      new Date(event.start).getTime(), new Date(event.end).getTime(), event.title.trim(),
      props.course.trim(), props.type?.trim() || '', names(props.group), names(props.location), names(props.persons),
    ]);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...event, extendedProps: { ...props, timetables: [...(props.timetables || [])] } });
      continue;
    }
    const owners = existing.extendedProps.timetables!;
    for (const owner of props.timetables || []) {
      if (!owners.some(item => item.id === owner.id)) owners.push(owner);
    }
    if (owners.length > 1 && colorMode === 'timetable') {
      existing.backgroundColor = 'var(--timetable-shared-bg, var(--bs-tertiary-bg))';
      existing.borderColor = 'var(--timetable-shared-border, var(--bs-border-color))';
      existing.textColor = 'var(--timetable-shared-text, var(--bs-body-color))';
    }
  }
  return [...merged.values()];
}

export function getCommonFreeSlots(events: CalendarEvent[], start: Date, end: Date): { start: string; end: string }[] {
  const busy = events.map(event => ({ start: new Date(event.start).getTime(), end: new Date(event.end).getTime() }));
  if (busy.some(slot => !Number.isFinite(slot.start) || !Number.isFinite(slot.end) || slot.end <= slot.start)) return [];
  busy.sort((a, b) => a.start - b.start);
  const free: { start: string; end: string }[] = [];
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  for (; day < end; day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const from = new Date(day);
    const until = new Date(day);
    from.setHours(7);
    until.setHours(21);
    let cursor = Math.max(from.getTime(), start.getTime());
    const limit = Math.min(until.getTime(), end.getTime());
    for (const slot of busy) {
      if (slot.end <= cursor || slot.start >= limit) continue;
      if (slot.start > cursor) free.push({ start: new Date(cursor).toISOString(), end: new Date(slot.start).toISOString() });
      cursor = Math.min(limit, Math.max(cursor, slot.end));
      if (cursor === limit) break;
    }
    if (cursor < limit) free.push({ start: new Date(cursor).toISOString(), end: new Date(limit).toISOString() });
  }
  return free;
}
