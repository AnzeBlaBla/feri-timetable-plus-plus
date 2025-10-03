import { NewTimetable } from './NewTimetable';
import { Programme } from '@/types/types';

// Create a singleton instance for server-side usage
let timetableInstance: NewTimetable | null = null;

export function getTimetableInstance(): NewTimetable {
  if (!timetableInstance) {
    timetableInstance = new NewTimetable('feri');
  }
  return timetableInstance;
}

export async function getProgrammes(): Promise<Programme[]> {
  const timetable = getTimetableInstance();
  return await timetable.getBasicProgrammes();
}
