import { NextRequest, NextResponse } from 'next/server';
import {
  fetchTimetableData,
  buildCourseGroupMapping,
  parseGroupsParam,
  filterLecturesByGroups,
  convertLecturesToEvents,
} from '@/lib/timetable-utils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const programme = searchParams.get('programme');
  const year = searchParams.get('year');
  const branches = searchParams.get('branches') || 'all';
  const groupsParam = searchParams.get('groups');

  console.log('API /api/timetable called with:', { programme, year, branches, hasGroups: !!groupsParam });

  if (!programme || !year) {
    return NextResponse.json(
      { success: false, error: 'Programme and year are required' },
      { status: 400 }
    );
  }

  try {
    // Fetch timetable data
    const { allGroups, lectures } = await fetchTimetableData(programme, year, branches);

    // Build course-group mapping
    const courseGroups = buildCourseGroupMapping(lectures, allGroups);

    // Parse selected groups
    const selectedGroups = groupsParam ? parseGroupsParam(groupsParam) : {};
    console.log('Selected groups:', JSON.stringify(selectedGroups, null, 2));

    // Filter lectures and convert to events
    const filteredLectures = filterLecturesByGroups(lectures, selectedGroups);
    const events = convertLecturesToEvents(filteredLectures);

    console.log(`Returning ${events.length} events (filtered from ${lectures.length} lectures)`);

    return NextResponse.json({
      success: true,
      events,
      courseGroups,
    });
  } catch (error) {
    console.error('Error in timetable API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch timetable data',
      },
      { status: 500 }
    );
  }
}
