import { LectureWise, Programme, Branch } from './types';

export interface TimetableSearchParams {
  programme: string;
  year: string;
  branches?: string;
  groups?: string; // base64url encoded JSON
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
  };
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
