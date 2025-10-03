'use client';

import { SelectedGroups } from '@/types/timetable';

interface SelectedGroupsBadgesProps {
  selectedGroups: SelectedGroups;
}

function abbreviateCourseName(courseName: string): string {
  return courseName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('');
}

export function SelectedGroupsBadges({ selectedGroups }: SelectedGroupsBadgesProps) {
  const hasSelectedGroups = Object.values(selectedGroups).some(groups => groups.length > 0);

  if (!hasSelectedGroups) {
    return <span className="badge bg-secondary">No groups selected</span>;
  }

  return (
    <>
      {Object.entries(selectedGroups).map(([course, groups]) => {
        if (groups.length === 0) return null;
        
        const abbreviatedName = abbreviateCourseName(course);
        
        return (
          <span
            key={course}
            className="badge bg-primary"
            title={`${course}: ${groups.join(', ')}`}
          >
            {abbreviatedName} ({groups.length})
          </span>
        );
      })}
    </>
  );
}
