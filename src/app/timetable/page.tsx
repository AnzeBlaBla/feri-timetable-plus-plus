import { getProgrammes } from '@/lib/timetable-server';
import {
  buildCourseGroupMapping,
  convertLecturesToEvents,
  fetchTimetableData,
  filterLecturesByGroups,
  getDefaultSelectedGroups,
  parseGroupsParam,
} from '@/lib/timetable-utils';
import {
  parseTimetablesParam,
  TIMETABLE_COLORS,
  validateTimetableSelections,
} from '@/lib/timetable-selection';
import { TimetableClient } from '@/components/TimetableClient';
import { TimetableSearchParams, TimetableSelection } from '@/types/timetable';

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<TimetableSearchParams>;
}) {
  const params = await searchParams;
  const { programme, year, branches = 'all', groups: groupsParam } = params;
  const isMultiTimetable = Boolean(params.timetables);

  try {
    let selections: TimetableSelection[];

    if (params.timetables) {
      selections = parseTimetablesParam(params.timetables);
    } else {
      if (!programme || !year) {
        return (
          <div className="container mt-5">
            <div className="alert alert-danger" role="alert">
              <h4 className="alert-heading">Missing Parameters</h4>
              <p>Programme and year are required to view the timetable.</p>
              <hr />
              <a href="/" className="btn btn-primary">Go to Home</a>
            </div>
          </div>
        );
      }
      selections = [{
        id: 'main',
        programmeId: programme,
        year,
        branches,
        selectedGroups: groupsParam ? parseGroupsParam(groupsParam) : {},
        label: '',
        color: TIMETABLE_COLORS[0],
      }];
    }

    const programmes = await getProgrammes();
    validateTimetableSelections(selections, programmes);
    const initialTimetables = await Promise.all(selections.map(async (selection, index) => {
      const entry = { ...selection, color: selection.color || TIMETABLE_COLORS[index] };
      try {
        const { allGroups, lectures } = await fetchTimetableData(
          selection.programmeId,
          selection.year,
          selection.branches,
        );
        const courseGroups = buildCourseGroupMapping(lectures, allGroups);
        const selectedGroups = (!isMultiTimetable && !groupsParam) || Object.keys(selection.selectedGroups).length === 0
          ? getDefaultSelectedGroups(courseGroups)
          : selection.selectedGroups;
        const filteredLectures = filterLecturesByGroups(lectures, selectedGroups);
        return {
          ...entry,
          selectedGroups,
          courses: Object.keys(courseGroups).sort(),
          courseGroups,
          events: convertLecturesToEvents(filteredLectures),
        };
      } catch (error) {
        return {
          ...entry, courses: [], courseGroups: {}, events: [],
          error: error instanceof Error ? error.message : 'Failed to load timetable.',
        };
      }
    }));

    return (
      <TimetableClient
        programmes={programmes}
        initialTimetables={initialTimetables}
        initialColorMode={params.colorMode === 'course' ? 'course' : isMultiTimetable ? 'timetable' : 'course'}
      />
    );
  } catch (error) {
    console.error('Error loading timetable:', error);
    return (
      <div className="container mt-5">
        <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">Error Loading Timetable</h4>
          <p>{error instanceof Error ? error.message : 'An unexpected error occurred'}</p>
          <hr />
          <a href="/" className="btn btn-primary">Go to Home</a>
        </div>
      </div>
    );
  }
}
