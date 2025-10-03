import { getProgrammes, getTimetableInstance } from '@/lib/timetable-server';
import {
  fetchTimetableData,
  buildCourseGroupMapping,
  parseGroupsParam,
  filterLecturesByGroups,
  convertLecturesToEvents,
  getDefaultSelectedGroups,
} from '@/lib/timetable-utils';
import { TimetableClient } from '@/components/TimetableClient';
import { TimetableSearchParams } from '@/types/timetable';

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<TimetableSearchParams>;
}) {
  const { programme, year, branches = 'all', groups: groupsParam } = await searchParams;

  // Validate required parameters
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

  try {
    // Fetch all necessary data
    const [programmes, { allGroups, lectures }] = await Promise.all([
      getProgrammes(),
      fetchTimetableData(programme, year, branches),
    ]);

    // Get programme info
    const timetable = getTimetableInstance();
    const programmeInfo = programmes.find(p => p.id === programme);
    
    if (!programmeInfo) {
      throw new Error('Programme not found');
    }

    // Build course-group mapping
    const courseGroups = buildCourseGroupMapping(lectures, allGroups);
    const courses = Object.keys(courseGroups).sort();

    // Parse selected groups from URL or use defaults (all groups)
    const selectedGroups = groupsParam
      ? parseGroupsParam(groupsParam)
      : getDefaultSelectedGroups(courseGroups);

    // Filter lectures and convert to calendar events
    const filteredLectures = filterLecturesByGroups(lectures, selectedGroups);
    const events = convertLecturesToEvents(filteredLectures);

    return (
      <TimetableClient
        programmes={programmes}
        programmeId={programme}
        year={year}
        branches={branches}
        courses={courses}
        courseGroups={courseGroups}
        initialSelectedGroups={selectedGroups}
        initialEvents={events}
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
