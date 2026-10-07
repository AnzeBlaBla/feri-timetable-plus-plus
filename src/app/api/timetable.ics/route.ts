import { NextRequest } from 'next/server';
import { getProgrammes } from '@/lib/timetable-server';
import { fetchTimetableData, filterLecturesByGroups, parseGroupsParam } from '@/lib/timetable-utils';
import {
  parseTimetablesParam,
  TIMETABLE_COLORS,
  timetableDisplayName,
  validateTimetableSelections,
} from '@/lib/timetable-selection';
import { generateICS } from '@/lib/timetable-ics';
import { TimetableSelection } from '@/types/timetable';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let selections: TimetableSelection[];
  try {
    if (params.has('timetables')) {
      selections = parseTimetablesParam(params.get('timetables')!);
    } else {
      const programmeId = params.get('programme');
      const year = params.get('year');
      if (!programmeId || !year) return new Response('Programme and year are required', { status: 400 });
      selections = [{
        id: 'main',
        programmeId,
        year,
        branches: params.get('branches') || 'all',
        selectedGroups: params.has('groups') ? parseGroupsParam(params.get('groups')!) : {},
        label: '',
        color: TIMETABLE_COLORS[0],
      }];
    }
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Invalid timetable selection', { status: 400 });
  }
  try {
    const programmes = await getProgrammes();
    try {
      validateTimetableSelections(selections, programmes);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'Invalid programme or year', { status: 400 });
    }
    const timetables = await Promise.all(selections.map(async selection => {
      const { lectures } = await fetchTimetableData(selection.programmeId, selection.year, selection.branches);
      return {
        selection,
        label: timetableDisplayName(selection, programmes),
        lectures: filterLecturesByGroups(lectures, selection.selectedGroups).sort((a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        ),
      };
    }));
    const icsContent = generateICS(timetables);
    return new Response(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `${params.get('download') === '1' ? 'attachment' : 'inline'}; filename="feri-timetables.ics"`,
        'Cache-Control': 'no-cache, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate calendar file';
    console.error('Error generating ICS:', error);
    return new Response(message, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
