import { describe, expect, it } from 'vitest';
import {
  filterSchedule,
  getScheduleFilterOptions,
  getWeekRange,
  validateDateRange,
} from './schedule';
import { LectureWise } from '@/types/types';

const lectures: LectureWise[] = [
  {
    id: 'algorithms',
    start_time: '2026-10-05T08:00:00.000Z',
    end_time: '2026-10-05T09:30:00.000Z',
    courseId: '1',
    course: 'Algorithms',
    eventType: '',
    note: 'Bring notes',
    executionTypeId: '1',
    executionType: 'Lecture',
    branches: [],
    rooms: [{ id: 1, name: 'A-101' }],
    groups: [{ id: 1, name: 'A' }],
    lecturers: [{ id: 1, name: 'Ada Lovelace' }],
    showLink: '',
    color: '',
    colorText: '',
  },
  {
    id: 'databases',
    start_time: '2026-10-06T10:00:00.000Z',
    end_time: '2026-10-06T11:30:00.000Z',
    courseId: '2',
    course: 'Databases',
    eventType: '',
    note: '',
    executionTypeId: '2',
    executionType: 'Lab',
    branches: [],
    rooms: [{ id: 2, name: 'B-202' }],
    groups: [{ id: 2, name: 'B' }],
    lecturers: [{ id: 2, name: 'Grace Hopper' }],
    showLink: '',
    color: '',
    colorText: '',
  },
];

describe('schedule helpers', () => {
  it('uses Monday through Sunday for a week identified by any date in it', () => {
    expect(getWeekRange('2026-10-11')).toEqual({
      start_date: '2026-10-05',
      end_date: '2026-10-11',
    });
  });

  it('filters schedule entries by range and user-facing fields', () => {
    const events = filterSchedule(
      lectures,
      { start_date: '2026-10-05', end_date: '2026-10-06' },
      { instructor: 'grace', weekdays: ['tuesday'] }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'databases',
      course: 'Databases',
      class_type: 'Lab',
      rooms: ['B-202'],
    });
  });

  it('returns stable filter options across a full academic-year range', () => {
    expect(
      getScheduleFilterOptions(lectures, {
        start_date: '2026-09-01',
        end_date: '2027-08-31',
      })
    ).toEqual({
      courses: ['Algorithms', 'Databases'],
      class_types: ['Lab', 'Lecture'],
      groups: ['A', 'B'],
      instructors: ['Ada Lovelace', 'Grace Hopper'],
      rooms: ['A-101', 'B-202'],
    });
  });

  it('rejects inverted and oversized search ranges', () => {
    expect(() =>
      validateDateRange({
        start_date: '2026-10-08',
        end_date: '2026-10-05',
      })
    ).toThrow('start date');
    expect(() =>
      validateDateRange({
        start_date: '2026-10-01',
        end_date: '2026-11-01',
      })
    ).toThrow('at most 31 days');
  });
});
