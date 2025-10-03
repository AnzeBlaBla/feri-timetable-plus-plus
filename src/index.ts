import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import path from "path";
import calendarRoutes from "./routes/calendar";
import { NewTimetable } from "./lib/NewTimetable";

const app = express();
const PORT = process.env.PORT || 3000;

// Create NewTimetable instance for FERI
const feriTimetable = new NewTimetable("feri");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set EJS as template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.get("/", (req: Request, res: Response) => {
  res.render("index");
});

// API route to get programmes for FERI
app.get("/api/programmes", async (req: Request, res: Response) => {
  try {
    const programmes = await feriTimetable.getBasicProgrammes();
    res.json({
      success: true,
      programmes
    });
  } catch (error) {
    console.error('Error fetching programmes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// API route to get branches for a specific programme and year
app.get("/api/programmes/:programmeId/years/:year/branches", async (req: Request, res: Response) => {
  try {
    const { programmeId, year } = req.params;
    const branches = await feriTimetable.getBranchesForProgramme(programmeId, year);
    res.json({
      success: true,
      branches
    });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// API route to get available years for a programme (hardcoded for now, can be made dynamic later)
app.get("/api/programmes/:programmeId/years", async (req: Request, res: Response) => {
  try {
    // For now, return common academic years - this could be made dynamic
    const years = ['1', '2', '3', '4', '5'];
    res.json({
      success: true,
      years
    });
  } catch (error) {
    console.error('Error fetching years:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});



// Helper function to get timetable data and build course-group mapping
async function getTimetableData(programme: string, year: string, branchesParam: string | undefined) {
  // Parse branches - can be "all" or comma-separated list of branch IDs
  let selectedBranches: string[];
  if (!branchesParam || branchesParam === "all") {
    // Get all branches for the programme and year
    const allBranches = await feriTimetable.getBranchesForProgramme(programme, year);
    selectedBranches = allBranches.map(b => b.id);
  } else {
    selectedBranches = branchesParam.split(",");
  }

  // Get all groups for the selected branches
  let allGroups: { id: number; name: string; branchId: string }[] = [];
  for (const branchId of selectedBranches) {
    const branchGroups = await feriTimetable.getGroupsForBranch(branchId);
    // Add branchId to each group for reference
    const groupsWithBranch = branchGroups.map(group => ({
      id: parseInt(group.id),
      name: group.name,
      branchId: branchId
    }));
    allGroups.push(...groupsWithBranch);
  }

  // Get timetable data for all groups (6 months back and 6 months ahead)
  // Normalize to start of day to ensure consistent caching across requests
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Set to midnight for consistency
  
  const startDate = new Date(now);
  startDate.setMonth(now.getMonth() - 6);
  const endDate = new Date(now);
  endDate.setMonth(now.getMonth() + 6);
  
  const lectures = await feriTimetable.getLecturesForGroups(
    allGroups.map(g => ({ id: g.id })),
    startDate,
    endDate
  );

  return { allGroups, lectures, selectedBranches };
}

// Helper function to build course-group mapping from lectures, filtered by allowed groups
function buildCourseGroupMapping(lectures: any[], allowedGroups: { id: number; name: string; branchId: string }[]) {
  const courseGroups: Record<string, string[]> = {};
  
  // Create a set of allowed group names for fast lookup
  const allowedGroupNames = new Set(allowedGroups.map(g => g.name));
  
  lectures.forEach(lecture => {
    const courseName = lecture.course;
    if (!courseName) return; // Skip if no course name
    if (!courseGroups[courseName]) {
      courseGroups[courseName] = [];
    }
    
    // Add groups from this lecture to the course, but only if they're in the allowed groups
    if (lecture.groups) {
      lecture.groups.forEach((group: any) => {
        if (allowedGroupNames.has(group.name) && !courseGroups[courseName].includes(group.name)) {
          courseGroups[courseName].push(group.name);
        }
      });
    }
  });
  
  // Sort groups for each course
  Object.keys(courseGroups).forEach(course => {
    courseGroups[course].sort();
  });
  
  return courseGroups;
}

// Helper function to parse selected groups from base64 encoded parameter
function parseSelectedGroups(groupsParam: string | undefined): Record<string, string[]> {
  if (!groupsParam) return {};
  
  try {
    const decoded = Buffer.from(groupsParam, 'base64url').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error parsing groups parameter:', error);
    return {};
  }
}

// Helper function to filter lectures based on selected groups
function filterLecturesByGroups(lectures: any[], selectedGroups: Record<string, string[]>) {
  if (Object.keys(selectedGroups).length === 0) {
    return []; // No filtering if no groups selected - show nothing
  }
  
  return lectures.filter(lecture => {
    const courseName = lecture.course;
    if (!courseName) return true; // Always include lectures without a course name (hack)
    const courseSelectedGroups = selectedGroups[courseName];
    
    // If no groups selected for this course, exclude all lectures for this course
    if (!courseSelectedGroups || courseSelectedGroups.length === 0) {
      return false;
    }
    
    // Check if any of the lecture's groups are in the selected groups
    if (lecture.groups) {
      return lecture.groups.some((group: any) => 
        courseSelectedGroups.includes(group.name)
      );
    }
    
    return false;
  });
}

// Helper function to convert lectures to calendar events
function lecturesToEvents(lectures: any[]) {
  return lectures.map(lecture => ({
    title: `${lecture.course}`,
    start: lecture.start_time,
    end: lecture.end_time,
    backgroundColor: getColorForSubject(lecture.course),
    borderColor: getColorForSubject(lecture.course),
    textColor: '#ffffff',
    extendedProps: {
      course: lecture.course,
      type: lecture.executionType || 'Lecture',
      group: lecture.groups ? lecture.groups.map((g: any) => g.name).join(', ') : 'N/A',
      persons: lecture.lecturers ? lecture.lecturers.map((l: any) => l.name).join(', ') : null,
      location: lecture.rooms ? lecture.rooms.map((r: any) => r.name).join(', ') : null,
      rawLecture: lecture
    }
  }));
}

// Helper function to generate ICS (iCalendar) content
function generateICS(lectures: any[], programme: string, year: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
  
  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FERI Timetable++//Timetable//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:FERI ${programme} Year ${year}`,
    'X-WR-TIMEZONE:Europe/Ljubljana',
    'X-WR-CALDESC:FERI University timetable'
  ];

  lectures.forEach((lecture, index) => {
    const startTime = new Date(lecture.start_time);
    const endTime = new Date(lecture.end_time);
    
    // Format dates for ICS (YYYYMMDDTHHMMSS)
    const formatICSDate = (date: Date): string => {
      return date.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
    };

    // Create event UID
    const uid = `lecture-${index}-${timestamp}@feri-timetable.local`;

    // Build description
    const description = [
      `Course: ${lecture.course}`,
      `Type: ${lecture.executionType || 'Lecture'}`,
      lecture.groups ? `Groups: ${lecture.groups.map((g: any) => g.name).join(', ')}` : '',
      lecture.lecturers ? `Lecturers: ${lecture.lecturers.map((l: any) => l.name).join(', ')}` : '',
    ].filter(Boolean).join('\\n');

    // Build location
    const location = lecture.rooms ? lecture.rooms.map((r: any) => r.name).join(', ') : '';

    ics.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${formatICSDate(startTime)}`,
      `DTEND:${formatICSDate(endTime)}`,
      `DTSTAMP:${timestamp}`,
      `SUMMARY:${lecture.course}`,
      `DESCRIPTION:${description}`,
      location ? `LOCATION:${location}` : '',
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  });

  ics.push('END:VCALENDAR');
  
  return ics.filter(Boolean).join('\r\n');
}

// Timetable view route
app.get("/timetable", async (req: Request, res: Response) => {
  try {
    const { programme, year, branches: branchesParam, groups: groupsParam } = req.query;
    
    if (!programme || !year) {
      return res.status(400).render("error", {
        error: "Programme and year are required"
      });
    }

    // Get timetable data
    const { allGroups, lectures } = await getTimetableData(
      programme as string, 
      year as string, 
      branchesParam as string
    );

    // Build course-group mapping
    const courseGroups = buildCourseGroupMapping(lectures, allGroups);
    const courses = Object.keys(courseGroups).sort();

    // Parse selected groups
    const selectedGroups = parseSelectedGroups(groupsParam as string);
    
    // Use selected groups as-is, don't default to all groups
    // If no groups parameter is provided, show all lectures (no filtering)
    // If groups parameter is provided but empty, show no lectures
    const filteredLectures = groupsParam === undefined 
      ? lectures // No groups parameter = show all
      : filterLecturesByGroups(lectures, selectedGroups); // Groups parameter present = filter

    // Convert to calendar events
    const events = lecturesToEvents(filteredLectures);

    // Get programme and branch info for display
    const programmes = await feriTimetable.getBasicProgrammes();
    const selectedProgramme = programmes.find(p => p.id === programme);
    
    const branchesData = await feriTimetable.getBranchesForProgramme(programme as string, year as string);
    const selectedBranches = !branchesParam || branchesParam === "all"
      ? branchesData.map(b => b.id)
      : (branchesParam as string).split(",");
    const selectedBranchNames = branchesData
      .filter(b => selectedBranches.includes(b.id))
      .map(b => b.branchName);

    res.render("timetable", {
      programme: selectedProgramme?.name || programme,
      programmeId: programme,
      year,
      branches: selectedBranchNames,
      groups: allGroups,
      events: events,
      courses: courses,
      courseGroups: courseGroups,
      selectedGroups: selectedGroups,
      queryParams: req.query,
      // Additional data for interactive controls
      allProgrammes: programmes,
      selectedProgramme: selectedProgramme,
      allBranches: branchesData,
      selectedBranchIds: selectedBranches
    });

  } catch (error) {
    console.error('Error in timetable route:', error);
    res.status(500).render("error", {
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// API endpoint for live timetable updates
app.get("/api/timetable", async (req: Request, res: Response) => {
  try {
    const { programme, year, branches: branchesParam, groups: groupsParam } = req.query;
    
    if (!programme || !year) {
      return res.status(400).json({
        success: false,
        error: "Programme and year are required"
      });
    }

    // Get timetable data
    const { lectures } = await getTimetableData(
      programme as string, 
      year as string, 
      branchesParam as string
    );

    // Parse selected groups
    const selectedGroups = parseSelectedGroups(groupsParam as string);

    // Filter lectures by selected groups
    const filteredLectures = filterLecturesByGroups(lectures, selectedGroups);

    // Convert to calendar events
    const events = lecturesToEvents(filteredLectures);

    res.json({
      success: true,
      events: events
    });

  } catch (error) {
    console.error('Error in timetable API route:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// ICS export endpoint
app.get("/api/timetable.ics", async (req: Request, res: Response) => {
  try {
    const { programme, year, branches: branchesParam, groups: groupsParam } = req.query;
    
    if (!programme || !year) {
      return res.status(400).send("Programme and year are required");
    }

    // Get timetable data (reuse the same logic as timetable route)
    const { lectures } = await getTimetableData(
      programme as string, 
      year as string, 
      branchesParam as string
    );

    // Parse selected groups
    const selectedGroups = parseSelectedGroups(groupsParam as string);

    // Filter lectures by selected groups
    const filteredLectures = groupsParam === undefined 
      ? lectures // No groups parameter = show all
      : filterLecturesByGroups(lectures, selectedGroups); // Groups parameter present = filter

    // Generate ICS content
    const icsContent = generateICS(filteredLectures, programme as string, year as string);

    // Set appropriate headers for ICS download
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="timetable-${programme}-${year}.ics"`);
    res.send(icsContent);

  } catch (error) {
    console.error('Error in ICS export route:', error);
    res.status(500).send('Error generating calendar file');
  }
});

// Helper functions
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
  return new Date(d.setDate(diff));
}

function getWeekEnd(startDate: Date): Date {
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6); // Sunday
  return endDate;
}

function getColorForSubject(subjectName: string): string {
  // Simple hash-based color generation
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert to a nice color
  const colors = [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400',
    '#8e44ad', '#27ae60', '#2980b9', '#c0392b', '#16a085'
  ];
  
  return colors[Math.abs(hash) % colors.length];
}

// Use calendar routes
app.use(calendarRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`FERI programmes API: http://localhost:${PORT}/api/programmes`);
});