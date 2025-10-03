'use client';

import { useState, useEffect } from 'react';
import { CourseGroups, SelectedGroups } from '@/types/timetable';

interface GroupSelectionModalProps {
  courses: string[];
  courseGroups: CourseGroups;
  selectedGroups: SelectedGroups;
  onGroupsChange: (groups: SelectedGroups) => void;
  programmeId: string;
  year: string;
  branches: string;
}

export function GroupSelectionModal({
  courses,
  courseGroups,
  selectedGroups,
  onGroupsChange,
}: GroupSelectionModalProps) {
  const [localSelectedGroups, setLocalSelectedGroups] = useState<SelectedGroups>(selectedGroups);

  // Sync local state when parent state changes
  useEffect(() => {
    setLocalSelectedGroups(selectedGroups);
  }, [selectedGroups]);

  const handleCheckboxChange = (course: string, group: string, checked: boolean) => {
    const updated = { ...localSelectedGroups };
    
    if (!updated[course]) {
      updated[course] = [];
    }
    
    if (checked) {
      if (!updated[course].includes(group)) {
        updated[course] = [...updated[course], group];
      }
    } else {
      updated[course] = updated[course].filter(g => g !== group);
    }
    
    setLocalSelectedGroups(updated);
    onGroupsChange(updated);
  };

  const selectAllForCourse = (course: string) => {
    const updated = { ...localSelectedGroups };
    updated[course] = [...(courseGroups[course] || [])];
    setLocalSelectedGroups(updated);
    onGroupsChange(updated);
  };

  const deselectAllForCourse = (course: string) => {
    const updated = { ...localSelectedGroups };
    updated[course] = [];
    setLocalSelectedGroups(updated);
    onGroupsChange(updated);
  };

  return (
    <div className="modal fade" id="groupsModal" tabIndex={-1} aria-labelledby="groupsModalLabel" aria-hidden="true">
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="groupsModalLabel">
              <i className="bi bi-pencil me-2"></i>Edit Groups - FERI Timetable++
            </h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div className="modal-body">
            <div className="row g-3">
              {courses.map((course) => {
                const groups = courseGroups[course] || [];
                const selected = localSelectedGroups[course] || [];
                
                return (
                  <div key={course} className="col-md-6 col-lg-4">
                    <div className="card h-100">
                      <div className="card-body p-3">
                        <h6 className="card-title text-primary mb-2">{course}</h6>
                        <div className="form-group">
                          <div className="row g-1">
                            {groups.map((group, index) => (
                              <div key={`${course}-${group}-${index}`} className="col-6 col-sm-4">
                                <div className="form-check form-check-sm">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`group-${course}-${index}`}
                                    checked={selected.includes(group)}
                                    onChange={(e) => handleCheckboxChange(course, group, e.target.checked)}
                                  />
                                  <label className="form-check-label small" htmlFor={`group-${course}-${index}`}>
                                    {group}
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm me-1"
                            onClick={() => selectAllForCourse(course)}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => deselectAllForCourse(course)}
                          >
                            None
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="modal-footer">
            <div className="text-muted small me-auto">
              Changes are applied live - no need to save manually
            </div>
            <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
