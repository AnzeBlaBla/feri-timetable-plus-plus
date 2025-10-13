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
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    console.error('Invalid date:', dateStr);
    return '';
  }
  
  // Use Intl.DateTimeFormat to properly convert to Ljubljana timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Ljubljana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  parts.forEach(part => {
    partMap[part.type] = part.value;
  });
  
  return `${partMap.year}${partMap.month}${partMap.day}T${partMap.hour}${partMap.minute}${partMap.second}`;
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateICS(lectures: LectureWise[], programmeId: string, year: string): string {
  console.log(`Starting ICS generation with ${lectures.length} lectures`);
  
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FERI Timetable++//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:FERI Timetable - ${programmeId} Year ${year}`,
    'X-WR-TIMEZONE:Europe/Ljubljana',
    '',
    // Add timezone definition for Europe/Ljubljana
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Ljubljana',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];


  let validEvents = 0;
  let skippedEvents = 0;

  lectures.forEach((lecture, index) => {
    // Create a truly unique UID by combining multiple identifiers
    const uid = `${lecture.id}-${lecture.start_time}-${lecture.end_time}@feri-timetable-plus-plus`;
    const dtstart = formatDate(lecture.start_time);
    const dtend = formatDate(lecture.end_time);
    
    // Skip if date formatting failed
    if (!dtstart || !dtend) {
      console.error(`Skipping lecture ${index} due to invalid dates:`, lecture.start_time, lecture.end_time);
      skippedEvents++;
      return;
    }
        
    // Handle empty course names - show as placeholder like in web app
    const courseName = (lecture.course || 'Empty').trim();
    const executionType = (lecture.executionType || '').trim();
    
    // Ensure summary is never empty
    const summary = escapeICSText(
      executionType && executionType !== '' 
        ? `${courseName} - ${executionType}` 
        : courseName
    );
    
    const groups = lecture.groups?.map(g => g.name).filter(Boolean).join(', ') || '';
    const lecturers = lecture.lecturers?.map(l => l.name).filter(Boolean).join(', ') || '';
    const rooms = lecture.rooms?.map(r => r.name).filter(Boolean).join(', ') || '';
    
    const descriptionParts = [
      groups && `Groups: ${groups}`,
      lecturers && `Lecturers: ${lecturers}`,
      rooms && `Rooms: ${rooms}`,
    ].filter(Boolean);
    
    const description = escapeICSText(descriptionParts.join('\\n'));
    const location = escapeICSText(rooms);
    
    // Validate that we have required fields
    if (!summary || summary.trim() === '') {
      console.warn(`Skipping event ${index} - empty summary`);
      skippedEvents++;
      return;
    }

    // Format DTSTAMP as UTC
    const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    // Build event lines, filtering out empty optional fields
    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Ljubljana:${dtstart}`,
      `DTEND;TZID=Europe/Ljubljana:${dtend}`,
      `SUMMARY:${summary}`,
    ];
    
    // Add optional fields only if they have content
    if (description && description.trim() !== '') {
      eventLines.push(`DESCRIPTION:${description}`);
    }
    if (location && location.trim() !== '') {
      eventLines.push(`LOCATION:${location}`);
    }
    
    eventLines.push(
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'END:VEVENT'
    );
    
    // Add all event lines to the main lines array
    lines.push(...eventLines);
    validEvents++;
  });

  console.log(`ICS generation complete: ${validEvents} valid events, ${skippedEvents} skipped events`);
  
  lines.push('END:VCALENDAR');
  
  const icsContent = lines.filter(Boolean).join('\r\n');
  console.log(`Generated ICS file with ${icsContent.split('BEGIN:VEVENT').length - 1} events`);
  
  return icsContent;
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

    // Sort lectures by start date
    const sortedLectures = filteredLectures.sort((a, b) => {
      const dateA = new Date(a.start_time);
      const dateB = new Date(b.start_time);
      return dateA.getTime() - dateB.getTime();
    });

    // Generate ICS content
    const icsContent = generateICS(sortedLectures, programme, year);

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
