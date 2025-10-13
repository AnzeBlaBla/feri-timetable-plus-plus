import { getTimetableInstance } from './timetable-server';
import { LectureWise } from '@/types/types';
import { GroupWithBranch, CourseGroups, SelectedGroups, CalendarEvent } from '@/types/timetable';

/**
 * Fetch timetable data for given programme, year, and branches
 */
export async function fetchTimetableData(
  programme: string,
  year: string,
  branchesParam?: string
) {
  const timetable = getTimetableInstance();
  
  // Parse branches - can be "all" or comma-separated list of branch IDs
  let selectedBranches: string[];
  if (!branchesParam || branchesParam === 'all') {
    const allBranches = await timetable.getBranchesForProgramme(programme, year);
    selectedBranches = allBranches.map(b => b.id);
  } else {
    selectedBranches = branchesParam.split(',');
  }

  // Get all groups for the selected branches
  const allGroups: GroupWithBranch[] = [];
  for (const branchId of selectedBranches) {
    const branchGroups = await timetable.getGroupsForBranch(branchId);
    const groupsWithBranch = branchGroups.map(group => ({
      id: parseInt(group.id),
      name: group.name,
      branchId: branchId,
    }));
    allGroups.push(...groupsWithBranch);
  }

  // Get timetable data for all groups (1 full academic year)
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Start from beginning of academic year (September 1st of current or previous year)
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based
  const academicYearStart = currentMonth >= 8 ? currentYear : currentYear - 1; // September = month 8
  
  const startDate = new Date(academicYearStart, 8, 1); // September 1st
  const endDate = new Date(academicYearStart + 1, 7, 31); // August 31st next year
  
  const lectures = await timetable.getLecturesForGroups(
    allGroups.map(g => ({ id: g.id })),
    startDate,
    endDate
  );

  return { allGroups, lectures, selectedBranches };
}

/**
 * Build course-group mapping from lectures
 */
export function buildCourseGroupMapping(
  lectures: LectureWise[],
  allowedGroups: GroupWithBranch[]
): CourseGroups {
  const courseGroups: CourseGroups = {};
  const allowedGroupNames = new Set(allowedGroups.map(g => g.name));
  
  lectures.forEach(lecture => {
    const courseName = lecture.course;
    if (!courseName) return;
    
    if (!courseGroups[courseName]) {
      courseGroups[courseName] = [];
    }
    
    if (lecture.groups) {
      lecture.groups.forEach(group => {
        if (
          allowedGroupNames.has(group.name) &&
          !courseGroups[courseName].includes(group.name)
        ) {
          courseGroups[courseName].push(group.name);
        }
      });
    }
  });
  
  // Sort groups within each course
  Object.keys(courseGroups).forEach(course => {
    courseGroups[course].sort();
  });
  
  return courseGroups;
}

/**
 * Parse groups parameter from URL (base64url encoded JSON)
 */
export function parseGroupsParam(groupsParam?: string): SelectedGroups {
  if (!groupsParam) return {};
  
  try {
    // Decode base64url
    const base64 = groupsParam.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const jsonString = Buffer.from(padded, 'base64').toString('utf-8');
    
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error parsing groups parameter:', error);
    return {};
  }
}

/**
 * Encode selected groups to base64url for URL
 */
export function encodeGroupsParam(selectedGroups: SelectedGroups): string {
  try {
    const jsonString = JSON.stringify(selectedGroups);
    return Buffer.from(jsonString, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  } catch (error) {
    console.error('Error encoding groups parameter:', error);
    return '';
  }
}

/**
 * Filter lectures based on selected groups
 */
export function filterLecturesByGroups(
  lectures: LectureWise[],
  selectedGroups: SelectedGroups
): LectureWise[] {
  // If no groups object provided, return all lectures
  if (Object.keys(selectedGroups).length === 0) {
    return lectures;
  }
  
  return lectures.filter(lecture => {
    const courseName = lecture.course;
    const courseSelectedGroups = selectedGroups[courseName];
    
    // If this course is not in the selection object, include all its lectures
    if (!courseSelectedGroups) {
      return true;
    }
    
    // If the course has an empty array, exclude all its lectures
    if (courseSelectedGroups.length === 0) {
      return false;
    }
    
    // Check if lecture has any of the selected groups
    return lecture.groups?.some(group =>
      courseSelectedGroups.includes(group.name)
    );
  });
}

/**
 * Generate a consistent color from a string (course name)
 * Uses a hash function to ensure the same string always produces the same color
 */
function stringToColor(str: string): string {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to HSL color for better visual distribution
  // Use hue based on hash, with fixed saturation and lightness for good visibility
  const hue = Math.abs(hash % 360);
  const saturation = 65; // 65% saturation for vibrant but not overwhelming colors
  const lightness = 50; // 50% lightness for good contrast
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Determine if a color needs light or dark text for readability
 */
function needsLightText(hslColor: string): boolean {
  // Extract lightness from HSL string
  const match = hslColor.match(/hsl\(\d+,\s*\d+%,\s*(\d+)%\)/);
  if (match) {
    const lightness = parseInt(match[1]);
    return lightness < 60; // Use white text if lightness is less than 60%
  }
  return true; // Default to white text
}

/**
 * Convert lectures to FullCalendar events
 */
export function convertLecturesToEvents(lectures: LectureWise[]): CalendarEvent[] {
  return lectures.map((lecture, index) => {
    const groupNames = lecture.groups?.map(g => g.name).join(', ') || '';
    const lecturerNames = lecture.lecturers?.map(l => l.name).join(', ') || '';
    const roomNames = lecture.rooms?.map(r => r.name).join(', ') || '';
    
    // Generate consistent color based on course name
    const backgroundColor = stringToColor(lecture.course);
    const textColor = needsLightText(backgroundColor) ? '#ffffff' : '#000000';
    
    // Build title without location (location will be shown as subtitle)
    const title = lecture.course;
    
    // Create unique ID by combining lecture ID with group and room info
    // This ensures that different groups/rooms at the same time get different IDs
    const uniqueId = `${lecture.id}-${groupNames}-${roomNames}-${index}`;
    
    return {
      id: uniqueId,
      title,
      start: lecture.start_time,
      end: lecture.end_time,
      backgroundColor,
      borderColor: backgroundColor,
      textColor,
      extendedProps: {
        course: lecture.course,
        type: lecture.executionType,
        group: groupNames,
        persons: lecturerNames || undefined,
        location: roomNames || undefined,
      },
    };
  });
}

/**
 * Get default selected groups (all groups for all courses)
 */
export function getDefaultSelectedGroups(courseGroups: CourseGroups): SelectedGroups {
  const result: SelectedGroups = {};
  
  Object.entries(courseGroups).forEach(([course, groups]) => {
    result[course] = [...groups];
  });
  
  return result;
}
