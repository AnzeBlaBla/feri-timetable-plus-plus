import { LectureWise, Programme, Branch } from './types';

export interface TimetableSearchParams {
  programme?: string;
  year?: string;
  branches?: string;
  groups?: string; // base64url encoded JSON
  timetables?: string;
  colorMode?: 'course' | 'timetable';
}

export interface CourseGroups {
  [courseName: string]: string[];
}

export interface SelectedGroups {
  [courseName: string]: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    course: string;
    type: string;
    group: string;
    persons?: string;
    location?: string;
    timetableId?: string;
    timetableLabel?: string;
    timetables?: { id: string; label: string; color: string }[];
  };
}

export interface TimetableSelection {
  id: string;
  programmeId: string;
  year: string;
  branches: string;
  selectedGroups: SelectedGroups;
  label: string;
  color: string;
}

export interface TimetableSelectionData extends TimetableSelection {
  courses: string[];
  courseGroups: CourseGroups;
  events: CalendarEvent[];
  isUpdating?: boolean;
  error?: string;
}

export interface TimetableData {
  programme: Programme;
  year: string;
  branches: Branch[];
  selectedBranches: string[];
  courses: string[];
  courseGroups: CourseGroups;
  selectedGroups: SelectedGroups;
  events: CalendarEvent[];
}

export interface GroupWithBranch {
  id: number;
  name: string;
  branchId: string;
}
