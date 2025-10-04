'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CalendarEvent, SelectedGroups, CourseGroups } from '@/types/timetable';
import { GroupSelectionModal } from './GroupSelectionModal';
import { SelectedGroupsBadges } from './SelectedGroupsBadges';
import { TimetableCalendar } from './TimetableCalendar';
import { TimetableControls } from './TimetableControls';
import { Footer } from './Footer';
import { Programme } from '@/types/types';
import { ThemeToggle } from './ThemeToggle';

interface TimetableClientProps {
  programmes: Programme[];
  programmeId: string;
  year: string;
  branches: string;
  courses: string[];
  courseGroups: CourseGroups;
  initialSelectedGroups: SelectedGroups;
  initialEvents: CalendarEvent[];
}

export function TimetableClient({
  programmes,
  programmeId,
  year,
  branches,
  courses,
  courseGroups,
  initialSelectedGroups,
  initialEvents,
}: TimetableClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [selectedGroups, setSelectedGroups] = useState<SelectedGroups>(initialSelectedGroups);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [showShareTooltip, setShowShareTooltip] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [copyMessage, setCopyMessage] = useState('');

  // Auto-open modal on first visit (when no groups parameter)
  useEffect(() => {
    const hasGroupsParam = searchParams.get('groups');
    if (!hasGroupsParam && typeof window !== 'undefined' && window.bootstrap) {
      // Small delay to ensure modal DOM is ready
      const timer = setTimeout(() => {
        const modalEl = document.getElementById('groupsModal');
        if (modalEl) {
          const modal = new window.bootstrap.Modal(modalEl);
          modal.show();
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, []); // Only run once on mount

  // Update state when props change (e.g., year or programme changes)
  useEffect(() => {
    setSelectedGroups(initialSelectedGroups);
    setEvents(initialEvents);
    setIsInitialMount(true);
  }, [programmeId, year]);

  // Encode groups to base64url
  const encodeGroups = useCallback((groups: SelectedGroups): string => {
    try {
      const jsonString = JSON.stringify(groups);
      // Browser-compatible base64 encoding
      const base64 = btoa(unescape(encodeURIComponent(jsonString)));
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (error) {
      console.error('Error encoding groups:', error);
      return '';
    }
  }, []);

  // Update URL when groups change
  const updateURL = useCallback((groups: SelectedGroups) => {
    const params = new URLSearchParams(searchParams);
    const encoded = encodeGroups(groups);
    
    if (encoded) {
      params.set('groups', encoded);
    } else {
      params.delete('groups');
    }
    
    const newUrl = `${pathname}?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
  }, [pathname, searchParams, encodeGroups]);

  // Fetch updated events when groups change
  const fetchUpdatedEvents = useCallback(async (groups: SelectedGroups) => {
    setIsUpdating(true);
    
    try {
      const params = new URLSearchParams({
        programme: programmeId,
        year: year,
        branches: branches,
        groups: encodeGroups(groups),
      });
      
      console.log('Fetching events from API...', params.toString());
      const response = await fetch(`/api/timetable?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        console.log('API returned', data.events.length, 'events, updating state...');
        setEvents(data.events);
      } else {
        console.error('Failed to fetch events:', data.error);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [programmeId, year, branches, encodeGroups]);

  // Handle groups change with debouncing (skip on initial mount)
  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }

    console.log('Groups changed, fetching updated events...', selectedGroups);
    const timeoutId = setTimeout(() => {
      updateURL(selectedGroups);
      fetchUpdatedEvents(selectedGroups);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [selectedGroups, isInitialMount, updateURL, fetchUpdatedEvents]);

  const handleGroupsChange = (newGroups: SelectedGroups) => {
    setSelectedGroups(newGroups);
    setIsUpdating(true); // Show loader immediately
  };

  const handleShare = () => {
    if (showShareTooltip) {
      setShowShareTooltip(false);
    } else {
      setShareUrl(window.location.href);
      setShowShareTooltip(true);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMessage('Share link copied to clipboard!');
      setTimeout(() => setCopyMessage(''), 3000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
      setCopyMessage('Failed to copy');
      setTimeout(() => setCopyMessage(''), 3000);
    }
  };

  const handleDownloadIcs = () => {
    const params = new URLSearchParams({
      programme: programmeId,
      year: year,
      branches: branches,
      groups: encodeGroups(selectedGroups),
    });
    
    const icsUrl = `/api/timetable.ics?${params.toString()}`;
    const link = document.createElement('a');
    link.href = icsUrl;
    link.download = `timetable-${programmeId}-${year}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyIcsUrl = async () => {
    const params = new URLSearchParams({
      programme: programmeId,
      year: year,
      branches: branches,
      groups: encodeGroups(selectedGroups),
    });
    
    const fullIcsUrl = `${window.location.origin}/api/timetable.ics?${params.toString()}`;
    
    try {
      await navigator.clipboard.writeText(fullIcsUrl);
      setIcsUrl(fullIcsUrl);
      setCopyMessage('Calendar link copied to clipboard!');
      setTimeout(() => setCopyMessage(''), 3000);
    } catch (error) {
      console.error('Failed to copy ICS URL:', error);
      setCopyMessage('Failed to copy');
      setTimeout(() => setCopyMessage(''), 3000);
    }
  };

  return (
    <>
      {/* External CSS */}
      <link href='https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css' rel='stylesheet' />

      <div className="container-fluid mt-4">
        <div className="row">
          <div className="col-12">
            {/* Timetable Header */}
            <div className="card mb-3">
              <div className="card-body py-3">
                {/* Top Row: Title and Filter Controls */}
                <div className="row align-items-center mb-3">
                  <div className="col-md-3">
                    <a href="/" className="text-decoration-none">
                      <h5 className="mb-0 hover-primary">FERI Timetable++</h5>
                    </a>
                  </div>
                  <div className="col-md-9">
                    <TimetableControls
                      programmes={programmes}
                      currentProgrammeId={programmeId}
                      currentYear={year}
                      branches={branches}
                    />
                  </div>
                </div>

                {/* Bottom Row: Groups and Actions */}
                <div className="row align-items-center">
                  <div className="col-md-8">
                    <div className="d-flex align-items-center gap-2">
                      <small className="text-muted fw-bold">Groups:</small>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        type="button"
                        data-bs-toggle="modal"
                        data-bs-target="#groupsModal"
                      >
                        <i className="bi bi-pencil"></i>{' '}
                        <span className="d-none d-sm-inline">Edit</span>
                      </button>
                      <div className="d-flex flex-wrap gap-1">
                        <SelectedGroupsBadges selectedGroups={selectedGroups} />
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="d-flex align-items-center gap-2 justify-content-md-end position-relative">
                      <ThemeToggle />
                      
                      <button
                        className="btn btn-sm btn-outline-info"
                        type="button"
                        onClick={handleShare}
                        title="Share current selection"
                      >
                        <i className="bi bi-share"></i>{' '}
                        <span className="d-none d-sm-inline">Share</span>
                      </button>
                      
                      {showShareTooltip && (
                        <div className="position-absolute top-100 end-0 mt-2" style={{ zIndex: 1050, minWidth: '300px' }}>
                          <div className="card shadow-lg">
                            <div className="card-body p-2">
                              <div className="d-flex align-items-center gap-2">
                                <small className="text-muted fw-bold">Share:</small>
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  value={shareUrl}
                                  readOnly
                                  onFocus={(e) => e.target.select()}
                                />
                                <button
                                  className="btn btn-sm btn-outline-success"
                                  onClick={handleCopyUrl}
                                  title="Copy to clipboard"
                                >
                                  <i className="bi bi-clipboard"></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => setShowShareTooltip(false)}
                                  title="Close"
                                >
                                  <i className="bi bi-x"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* ICS Download/Copy Split Button */}
                      <div className="btn-group" role="group">
                        <button
                          className="btn btn-sm btn-success"
                          onClick={handleDownloadIcs}
                          title="Download .ics calendar file"
                        >
                          <i className="bi bi-download"></i>{' '}
                          <span className="d-none d-md-inline">.ics</span>
                        </button>
                        <button
                          className="btn btn-sm btn-outline-success"
                          onClick={handleCopyIcsUrl}
                          title="Copy .ics link to clipboard"
                        >
                          <i className="bi bi-clipboard"></i>
                        </button>
                      </div>
                      
                      {/* Copy Toast Notification */}
                      {copyMessage && (
                        <div 
                          className="position-fixed top-0 start-50 translate-middle-x mt-3" 
                          style={{ zIndex: 9999 }}
                        >
                          <div className="alert alert-success alert-dismissible fade show shadow-lg mb-0" role="alert">
                            <i className="bi bi-check-circle-fill me-2"></i>
                            {copyMessage}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="card position-relative">
              {isUpdating && (
                <div className="position-absolute top-0 start-0 m-3" style={{ zIndex: 1000 }}>
                  <div className="d-flex align-items-center gap-2 bg-white rounded shadow-sm px-3 py-2">
                    <div className="spinner-border spinner-border-sm text-primary" role="status" style={{ width: '1.5rem', height: '1.5rem' }}>
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <small className="text-muted">Updating...</small>
                  </div>
                </div>
              )}
              <div className="card-body p-0">
                <TimetableCalendar events={events} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />

      {/* Groups Selection Modal */}
      <GroupSelectionModal
        courses={courses}
        courseGroups={courseGroups}
        selectedGroups={selectedGroups}
        onGroupsChange={handleGroupsChange}
        programmeId={programmeId}
        year={year}
        branches={branches}
      />
    </>
  );
}
