import {
  fetchTimetableData,
  filterLecturesByGroups,
} from '@/lib/timetable-utils';
import { LectureWise } from '@/types/types';
import { McpTimetableSelection } from './timetable-selection';

export const TIMETABLE_TIME_ZONE = 'Europe/Ljubljana';
export const MAX_SEARCH_RANGE_DAYS = 31;

export type ScheduleWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface ScheduleFilters {
  course?: string;
  classType?: string;
  group?: string;
  instructor?: string;
  room?: string;
  query?: string;
  weekdays?: ScheduleWeekday[];
}

export interface ScheduleEvent {
  id: string;
  start: string;
  end: string;
  course: string;
  class_type: string;
  groups: string[];
  instructors: string[];
  rooms: string[];
  note: string;
}

export interface DateRange {
  start_date: string;
  end_date: string;
}

export interface ScheduleFilterOptions {
  courses: string[];
  class_types: string[];
  groups: string[];
  instructors: string[];
  rooms: string[];
}

const weekdays: ScheduleWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMETABLE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMETABLE_TIME_ZONE,
  weekday: 'long',
});

function validateDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Dates must use the ISO-8601 YYYY-MM-DD format.');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('A valid calendar date is required.');
  }

  return value;
}

function dateParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    dateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

function eventDate(event: LectureWise): string {
  const parts = dateParts(new Date(event.start_time));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function eventWeekday(event: LectureWise): ScheduleWeekday {
  return weekdayFormatter.format(new Date(event.start_time)).toLowerCase() as ScheduleWeekday;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function includesText(values: string[], filter?: string): boolean {
  if (!filter) {
    return true;
  }

  const normalizedFilter = normalizeText(filter);
  return values.some((value) => normalizeText(value).includes(normalizedFilter));
}

function lectureToEvent(lecture: LectureWise): ScheduleEvent {
  return {
    id: lecture.id,
    start: lecture.start_time,
    end: lecture.end_time,
    course: lecture.course || 'Untitled class',
    class_type: lecture.executionType || '',
    groups: lecture.groups?.map((group) => group.name).filter(Boolean) ?? [],
    instructors: lecture.lecturers?.map((lecturer) => lecturer.name).filter(Boolean) ?? [],
    rooms: lecture.rooms?.map((room) => room.name).filter(Boolean) ?? [],
    note: lecture.note || '',
  };
}

export function getAcademicYearRange(referenceDate = new Date()): DateRange {
  const parts = dateParts(referenceDate);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const academicYearStart = month >= 9 ? year : year - 1;

  return {
    start_date: `${academicYearStart}-09-01`,
    end_date: `${academicYearStart + 1}-08-31`,
  };
}

export function getWeekRange(dateInWeek: string): DateRange {
  const date = validateDate(dateInWeek);
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + offsetToMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  };
}

function normalizeDateRange(range: DateRange): DateRange {
  const startDate = validateDate(range.start_date);
  const endDate = validateDate(range.end_date);
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  if (start > end) {
    throw new Error('The start date must not be after the end date.');
  }

  return { start_date: startDate, end_date: endDate };
}

export function validateDateRange(range: DateRange): DateRange {
  const normalizedRange = normalizeDateRange(range);
  const start = new Date(`${normalizedRange.start_date}T00:00:00.000Z`);
  const end = new Date(`${normalizedRange.end_date}T00:00:00.000Z`);
  const durationInDays = Math.floor(
    (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;
  if (durationInDays > MAX_SEARCH_RANGE_DAYS) {
    throw new Error(`Searches may cover at most ${MAX_SEARCH_RANGE_DAYS} days.`);
  }

  return normalizedRange;
}

export function filterSchedule(
  lectures: LectureWise[],
  range: DateRange,
  filters: ScheduleFilters = {}
): ScheduleEvent[] {
  const normalizedRange = validateDateRange(range);

  return lectures
    .filter((lecture) => {
      const date = eventDate(lecture);
      if (date < normalizedRange.start_date || date > normalizedRange.end_date) {
        return false;
      }

      if (
        filters.weekdays?.length &&
        !filters.weekdays.includes(eventWeekday(lecture))
      ) {
        return false;
      }

      const groups = lecture.groups?.map((group) => group.name) ?? [];
      const instructors = lecture.lecturers?.map((lecturer) => lecturer.name) ?? [];
      const rooms = lecture.rooms?.map((room) => room.name) ?? [];

      if (
        !includesText([lecture.course], filters.course) ||
        !includesText([lecture.executionType], filters.classType) ||
        !includesText(groups, filters.group) ||
        !includesText(instructors, filters.instructor) ||
        !includesText(rooms, filters.room)
      ) {
        return false;
      }

      if (filters.query) {
        return includesText(
          [
            lecture.course,
            lecture.executionType,
            lecture.note,
            ...groups,
            ...instructors,
            ...rooms,
          ],
          filters.query
        );
      }

      return true;
    })
    .map(lectureToEvent)
    .sort((left, right) => {
      const startDifference =
        new Date(left.start).getTime() - new Date(right.start).getTime();
      return startDifference || left.id.localeCompare(right.id);
    });
}

export function getScheduleFilterOptions(
  lectures: LectureWise[],
  range: DateRange
): ScheduleFilterOptions {
  const normalizedRange = normalizeDateRange(range);
  const events = lectures
    .filter((lecture) => {
      const date = eventDate(lecture);
      return (
        date >= normalizedRange.start_date && date <= normalizedRange.end_date
      );
    })
    .map(lectureToEvent);
  const uniqueSorted = (values: string[]) =>
    [...new Set(values.filter(Boolean))].sort((left, right) =>
      left.localeCompare(right)
    );

  return {
    courses: uniqueSorted(events.map((event) => event.course)),
    class_types: uniqueSorted(events.map((event) => event.class_type)),
    groups: uniqueSorted(events.flatMap((event) => event.groups)),
    instructors: uniqueSorted(events.flatMap((event) => event.instructors)),
    rooms: uniqueSorted(events.flatMap((event) => event.rooms)),
  };
}

export async function getSelectionLectures(
  selection: McpTimetableSelection
): Promise<LectureWise[]> {
  const { lectures } = await fetchTimetableData(
    selection.programme,
    selection.year,
    selection.branches
  );

  return filterLecturesByGroups(lectures, selection.selectedGroups);
}
