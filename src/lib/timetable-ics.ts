import type { LectureWise } from '@/types/types';
import type { TimetableSelection } from '@/types/timetable';

export interface TimetableICSData {
  selection: TimetableSelection;
  label: string;
  lectures: LectureWise[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? '' : date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICSText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function generateICS(timetables: TimetableICSData[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FERI Timetable++//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:FERI Timetables',
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    'X-PUBLISHED-TTL:PT30M',
  ];

  for (const { selection, label, lectures } of timetables) {
    for (const lecture of lectures) {
      const dtstart = formatDate(lecture.start_time);
      const dtend = formatDate(lecture.end_time);
      if (!dtstart || !dtend) continue;

      const courseName = lecture.course?.trim() || lecture.note?.trim() || 'Event';
      const executionType = (lecture.executionType || '').trim();
      const summary = escapeICSText(executionType ? `${courseName} - ${executionType}` : courseName);
      if (!summary.trim()) continue;

      const groups = lecture.groups?.map(group => group.name).filter(Boolean).join(', ') || '';
      const lecturers = lecture.lecturers?.map(person => person.name).filter(Boolean).join(', ') || '';
      const rooms = lecture.rooms?.map(room => room.name).filter(Boolean).join(', ') || '';
      const descriptionParts = [
        `Timetable: ${label}`,
        groups && `Groups: ${groups}`,
        lecturers && `Lecturers: ${lecturers}`,
        rooms && `Rooms: ${rooms}`,
      ].filter(Boolean);
      const description = escapeICSText(descriptionParts.join('\n'));
      const uid = [selection.programmeId, selection.year, selection.id, lecture.id]
        .map(value => encodeURIComponent(String(value))).join(':') + '@feri-timetable-plus-plus';
      const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        ...(rooms ? [`LOCATION:${escapeICSText(rooms)}`] : []),
        'STATUS:CONFIRMED',
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  const encoder = new TextEncoder();
  return lines.flatMap(line => {
    const folded: string[] = [];
    let chunk = '';
    let octets = 0;
    for (const character of line) {
      const size = encoder.encode(character).length;
      if (octets + size > 75) {
        folded.push(chunk);
        chunk = ' ';
        octets = 1;
      }
      chunk += character;
      octets += size;
    }
    folded.push(chunk);
    return folded;
  }).join('\r\n') + '\r\n';
}
