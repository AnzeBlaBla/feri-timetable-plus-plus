import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  DateRange,
  filterSchedule,
  getAcademicYearRange,
  getScheduleFilterOptions,
  getSelectionLectures,
  getWeekRange,
  MAX_SEARCH_RANGE_DAYS,
  ScheduleEvent,
  ScheduleFilters,
  ScheduleWeekday,
  TIMETABLE_TIME_ZONE,
  validateDateRange,
} from './schedule';
import { McpTimetableSelection } from './timetable-selection';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, 'Use the YYYY-MM-DD date format.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Use a valid calendar date.');

const filterSchema = {
  course: z.string().trim().min(1).max(120).optional(),
  class_type: z.string().trim().min(1).max(120).optional(),
  group: z.string().trim().min(1).max(120).optional(),
  instructor: z.string().trim().min(1).max(120).optional(),
  room: z.string().trim().min(1).max(120).optional(),
};

const weekdaySchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const eventOutputSchema = z.object({
  id: z.string(),
  start: z.string(),
  end: z.string(),
  course: z.string(),
  class_type: z.string(),
  groups: z.array(z.string()),
  instructors: z.array(z.string()),
  rooms: z.array(z.string()),
  note: z.string(),
});

const scheduleOutputSchema = z.object({
  range: z.object({
    start_date: z.string(),
    end_date: z.string(),
  }),
  events: z.array(eventOutputSchema),
});

const filterOptionsOutputSchema = z.object({
  range: z.object({
    start_date: z.string(),
    end_date: z.string(),
  }),
  courses: z.array(z.string()),
  class_types: z.array(z.string()),
  groups: z.array(z.string()),
  instructors: z.array(z.string()),
  rooms: z.array(z.string()),
});

function formatEvent(event: ScheduleEvent): string {
  const details = [
    event.class_type,
    event.groups.length ? `groups: ${event.groups.join(', ')}` : '',
    event.rooms.length ? `rooms: ${event.rooms.join(', ')}` : '',
    event.instructors.length ? `with ${event.instructors.join(', ')}` : '',
  ].filter(Boolean);

  return `- ${event.start}–${event.end}: ${event.course}${
    details.length ? ` (${details.join('; ')})` : ''
  }`;
}

function formatSchedule(range: DateRange, events: ScheduleEvent[]): string {
  const heading =
    range.start_date === range.end_date
      ? `Schedule for ${range.start_date}`
      : `Schedule from ${range.start_date} through ${range.end_date}`;

  if (!events.length) {
    return `${heading} (${TIMETABLE_TIME_ZONE}): no matching classes.`;
  }

  return `${heading} (${TIMETABLE_TIME_ZONE}):\n${events
    .map(formatEvent)
    .join('\n')}`;
}

function toFilters(input: {
  course?: string;
  class_type?: string;
  group?: string;
  instructor?: string;
  room?: string;
  query?: string;
  weekdays?: ScheduleWeekday[];
}): ScheduleFilters {
  return {
    course: input.course,
    classType: input.class_type,
    group: input.group,
    instructor: input.instructor,
    room: input.room,
    query: input.query,
    weekdays: input.weekdays,
  };
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

async function loadSchedule(
  selection: McpTimetableSelection,
  range: DateRange,
  filters: ScheduleFilters
) {
  const lectures = await getSelectionLectures(selection);
  return filterSchedule(lectures, range, filters);
}

async function scheduleToolResult(
  selection: McpTimetableSelection,
  range: DateRange,
  filters: ScheduleFilters
) {
  try {
    const events = await loadSchedule(selection, range, filters);
    return {
      content: [{ type: 'text' as const, text: formatSchedule(range, events) }],
      structuredContent: { range, events },
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error('MCP schedule query failed:', error.message);
    } else {
      console.error('MCP schedule query failed with a non-error value.');
    }

    return toolError(
      'The timetable could not be loaded. Please try again later or check that the selected timetable is valid.'
    );
  }
}

export function createTimetableMcpServer(selection: McpTimetableSelection): McpServer {
  const server = new McpServer({
    name: 'FERI Timetable++',
    version: process.env.npm_package_version ?? '1.0.0',
  });

  server.registerResource(
    'selected_timetable',
    'timetable://selection',
    {
      title: 'Selected timetable',
      description:
        'The programme, year, class groups, timezone, and date window configured for this read-only timetable connection.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              programme: selection.programme,
              year: selection.year,
              branches: selection.branches,
              selected_groups: selection.selectedGroups,
              timezone: TIMETABLE_TIME_ZONE,
              available_date_range: getAcademicYearRange(),
              access: 'read-only',
            },
            null,
            2
          ),
        },
      ],
    })
  );

  server.registerTool(
    'get_day_schedule',
    {
      title: 'Get day schedule',
      description:
        'Get the selected timetable’s classes for one calendar day. Use filters only to narrow the configured timetable.',
      inputSchema: z.object({
        date: dateSchema.describe('Calendar date to inspect.'),
        ...filterSchema,
      }),
      outputSchema: scheduleOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date, ...filters }) =>
      scheduleToolResult(
        selection,
        { start_date: date, end_date: date },
        toFilters(filters)
      )
  );

  server.registerTool(
    'get_week_schedule',
    {
      title: 'Get week schedule',
      description:
        'Get the selected timetable’s classes for the Monday-through-Sunday week containing a calendar date.',
      inputSchema: z.object({
        date_in_week: dateSchema.describe(
          'Any calendar date in the week to inspect.'
        ),
        ...filterSchema,
      }),
      outputSchema: scheduleOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date_in_week, ...filters }) => {
      try {
        return scheduleToolResult(
          selection,
          getWeekRange(date_in_week),
          toFilters(filters)
        );
      } catch (error) {
        if (error instanceof Error) {
          return toolError(error.message);
        }

        return toolError('A valid calendar date is required.');
      }
    }
  );

  server.registerTool(
    'search_schedule',
    {
      title: 'Search schedule',
      description:
        'Find matching classes in the selected timetable during a bounded calendar-date range.',
      inputSchema: z.object({
        start_date: dateSchema.describe('First calendar date to search.'),
        end_date: dateSchema.describe(
          `Last calendar date to search, at most ${MAX_SEARCH_RANGE_DAYS} days after the first date.`
        ),
        query: z.string().trim().min(1).max(120).optional(),
        weekdays: z.array(weekdaySchema).min(1).max(7).optional(),
        ...filterSchema,
      }),
      outputSchema: scheduleOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ start_date, end_date, ...filters }) => {
      try {
        const range = validateDateRange({
          start_date,
          end_date,
        });
        return scheduleToolResult(selection, range, toFilters(filters));
      } catch (error) {
        if (error instanceof Error) {
          return toolError(error.message);
        }

        return toolError('A valid calendar date range is required.');
      }
    }
  );

  server.registerTool(
    'get_schedule_filter_options',
    {
      title: 'Get schedule filter options',
      description:
        'List the available course, class type, group, instructor, and room values for the selected timetable.',
      inputSchema: z
        .object({
          start_date: dateSchema.optional(),
          end_date: dateSchema.optional(),
        })
        .refine(
          (value) =>
            (value.start_date === undefined && value.end_date === undefined) ||
            (value.start_date !== undefined && value.end_date !== undefined),
          'Provide both start_date and end_date, or neither.'
        ),
      outputSchema: filterOptionsOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ start_date, end_date }) => {
      try {
        const range =
          start_date && end_date
            ? validateDateRange({ start_date, end_date })
            : getAcademicYearRange();
        const lectures = await getSelectionLectures(selection);
        const options = getScheduleFilterOptions(lectures, range);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Available schedule filters from ${range.start_date} through ${range.end_date}: ${options.courses.length} courses, ${options.class_types.length} class types, ${options.groups.length} groups, ${options.instructors.length} instructors, and ${options.rooms.length} rooms.`,
            },
          ],
          structuredContent: { range, ...options },
        };
      } catch (error) {
        if (error instanceof Error) {
          console.error('MCP filter-options query failed:', error.message);
        } else {
          console.error('MCP filter-options query failed with a non-error value.');
        }

        return toolError(
          'The timetable filter options could not be loaded. Please try again later or choose a shorter valid date range.'
        );
      }
    }
  );

  return server;
}
