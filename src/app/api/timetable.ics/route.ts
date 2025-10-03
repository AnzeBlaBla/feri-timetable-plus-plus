import { NextRequest } from 'next/server';
import {
  fetchTimetableData,
  buildCourseGroupMapping,
  parseGroupsParam,
  filterLecturesByGroups,
} from '@/lib/timetable-utils';
import { LectureWise } from '@/types/types';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateICS(lectures: LectureWise[], programmeId: string, year: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FERI Timetable++//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:FERI Timetable - ${programmeId} Year ${year}`,
    'X-WR-TIMEZONE:Europe/Ljubljana',
  ];

  lectures.forEach((lecture) => {
    const uid = `${lecture.id}@feri-timetable-plus-plus`;
    const dtstart = formatDate(lecture.start_time);
    const dtend = formatDate(lecture.end_time);
    const summary = escapeICSText(`${lecture.course} - ${lecture.executionType}`);
    
    const groups = lecture.groups?.map(g => g.name).join(', ') || '';
    const lecturers = lecture.lecturers?.map(l => l.name).join(', ') || '';
    const rooms = lecture.rooms?.map(r => r.name).join(', ') || '';
    
    const descriptionParts = [
      `Course: ${lecture.course}`,
      `Type: ${lecture.executionType}`,
      groups && `Groups: ${groups}`,
      lecturers && `Lecturers: ${lecturers}`,
      rooms && `Rooms: ${rooms}`,
    ].filter(Boolean);
    
    const description = escapeICSText(descriptionParts.join('\\n'));
    const location = escapeICSText(rooms);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${formatDate(new Date().toISOString())}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      location && `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  
  return lines.filter(Boolean).join('\r\n');
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const programme = searchParams.get('programme');
  const year = searchParams.get('year');
  const branches = searchParams.get('branches') || 'all';
  const groupsParam = searchParams.get('groups');

  if (!programme || !year) {
    return new Response('Programme and year are required', { status: 400 });
  }

  try {
    // Fetch timetable data
    const { allGroups, lectures } = await fetchTimetableData(programme, year, branches);

    // Build course-group mapping
    const courseGroups = buildCourseGroupMapping(lectures, allGroups);

    // Parse selected groups
    const selectedGroups = groupsParam ? parseGroupsParam(groupsParam) : {};

    // Filter lectures
    const filteredLectures = filterLecturesByGroups(lectures, selectedGroups);

    // Generate ICS content
    const icsContent = generateICS(filteredLectures, programme, year);

    // Return ICS file
    return new Response(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="timetable-${programme}-${year}.ics"`,
      },
    });
  } catch (error) {
    console.error('Error generating ICS:', error);
    return new Response('Failed to generate calendar file', { status: 500 });
  }
}
