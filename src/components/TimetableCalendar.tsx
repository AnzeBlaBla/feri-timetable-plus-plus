'use client';

import { useRef, useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarEvent } from '@/types/timetable';
import { getCommonFreeSlots } from '@/lib/timetable-selection';

interface TimetableCalendarProps {
  events: CalendarEvent[];
  showCommonFreeTime?: boolean;
}

declare global {
  interface Window {
    bootstrap: any;
  }
}

export function TimetableCalendar({ events, showCommonFreeTime = false }: TimetableCalendarProps) {
  const calendarRef = useRef<any>(null);
  const renderCountRef = useRef<number>(0);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date; viewType: string } | null>(null);
  const freeSlots = showCommonFreeTime && dateRange?.viewType.startsWith('timeGrid')
    ? getCommonFreeSlots(events, dateRange.start, dateRange.end).map((slot, index) => ({
      ...slot, id: `common-free-${index}`, title: 'Free time', display: 'background',
      classNames: ['timetable-free-slot'], backgroundColor: 'rgba(var(--bs-info-rgb, 13, 202, 240), 0.16)',
      extendedProps: { isCommonFreeSlot: true },
    })) : [];

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (showCommonFreeTime && api && !api.view.type.startsWith('timeGrid')) {
      api.changeView(window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek');
    }
  }, [showCommonFreeTime]);

  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  const escapeHTML = (value: string): string => value.replace(/[&<>"']/g, character => htmlEntities[character]);

  // Debug: Log events when they change
  useEffect(() => {
    console.log(`TimetableCalendar received ${events.length} events`);
    if (events.length > 0) {
      console.log('First event:', events[0]);
      console.log('Last event:', events[events.length - 1]);
      
      // Check date range
      const dates = events.map(e => new Date(e.start).getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      console.log('Event date range:', minDate.toLocaleDateString(), 'to', maxDate.toLocaleDateString());
      
      // Group events by week to see distribution
      const eventsByWeek: { [key: string]: number } = {};
      events.forEach(event => {
        const eventDate = new Date(event.start);
        const weekStart = new Date(eventDate);
        weekStart.setDate(eventDate.getDate() - eventDate.getDay() + 1); // Monday
        const weekKey = weekStart.toISOString().split('T')[0];
        eventsByWeek[weekKey] = (eventsByWeek[weekKey] || 0) + 1;
      });
      console.log('Events per week:', eventsByWeek);
      
      // Check if calendar is showing the right date
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        const currentDate = calendarApi.getDate();
        console.log('Calendar currently showing:', currentDate.toLocaleDateString());
        console.log('First event is on:', minDate.toLocaleDateString());
      }
    }
    
    // Reset render count when events change
    renderCountRef.current = 0;
  }, [events]);

  function getSavedView() {
    if (typeof window === 'undefined') return 'timeGridWeek';
    const savedView = localStorage.getItem('feri-calendar-view');
    if (!savedView) {
      return window.innerWidth < 768 ? 'listWeek' : 'timeGridWeek';
    }
    return savedView;
  }

  function saveViewPreference(viewName: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('feri-calendar-view', viewName);
    }
  }

  const handleEventClick = (info: any) => {
    const event = info.event;
    const props = event.extendedProps;
    if (props.isCommonFreeSlot) return;
    const owners = props.timetables || (props.timetableLabel ? [{ label: props.timetableLabel, color: event.backgroundColor }] : []);
    const timetableRow = owners.length ? `
      <div class="row mb-2">
        <div class="col-sm-4"><strong>${owners.length > 1 ? 'Timetables' : 'Timetable'}:</strong></div>
        <div class="col-sm-8">${owners.map((owner: { label: string; color: string }) => `
          <div><span class="timetable-owner-dot" style="background-color: ${escapeHTML(owner.color)};"></span>${escapeHTML(owner.label)}</div>
        `).join('')}</div>
      </div>
    ` : '';

    const modalContent = `
      <div class="modal fade" id="eventModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header" style="background-color: ${escapeHTML(event.backgroundColor || '')}; color: ${escapeHTML(event.textColor || '')};">
              <h5 class="modal-title">${escapeHTML(event.title || '')}</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row mb-2">
                <div class="col-sm-4"><strong>Course:</strong></div>
                <div class="col-sm-8">${escapeHTML(props.course || '')}</div>
              </div>
              <div class="row mb-2">
                <div class="col-sm-4"><strong>Type:</strong></div>
                <div class="col-sm-8">${escapeHTML(props.type || '')}</div>
              </div>
              ${timetableRow}
              ${props.group ? `
                <div class="row mb-2">
                  <div class="col-sm-4"><strong>Group:</strong></div>
                  <div class="col-sm-8">${escapeHTML(props.group)}</div>
                </div>
              ` : ''}
              ${props.persons ? `
                <div class="row mb-2">
                  <div class="col-sm-4"><strong>Lecturer:</strong></div>
                  <div class="col-sm-8">${escapeHTML(props.persons)}</div>
                </div>
              ` : ''}
              ${props.location ? `
                <div class="row mb-2">
                  <div class="col-sm-4"><strong>Location:</strong></div>
                  <div class="col-sm-8">${escapeHTML(props.location)}</div>
                </div>
              ` : ''}
              <div class="row mb-2">
                <div class="col-sm-4"><strong>Start:</strong></div>
                <div class="col-sm-8">${escapeHTML(event.start?.toLocaleString() || '')}</div>
              </div>
              <div class="row mb-2">
                <div class="col-sm-4"><strong>End:</strong></div>
                <div class="col-sm-8">${escapeHTML(event.end?.toLocaleString() || '')}</div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const existingModal = document.getElementById('eventModal');
    if (existingModal) {
      existingModal.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalContent);
    
    if (typeof window !== 'undefined' && window.bootstrap) {
      const modal = new window.bootstrap.Modal(document.getElementById('eventModal')!);
      modal.show();

      const modalEl = document.getElementById('eventModal')!;
      modalEl.addEventListener('hidden.bs.modal', function() {
        modalEl.remove();
      });
    }
  };

  const handleDatesSet = (dateInfo: any) => {
    setDateRange(current => current?.start.getTime() === dateInfo.start.getTime()
      && current?.end.getTime() === dateInfo.end.getTime() && current?.viewType === dateInfo.view.type
      ? current : { start: dateInfo.start, end: dateInfo.end, viewType: dateInfo.view.type });
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi && (calendarApi as any).isInitialized) {
      saveViewPreference(dateInfo.view.type);
    }
    
    // Log what week/period is being displayed
    console.log('Calendar view changed:', {
      viewType: dateInfo.view.type,
      start: dateInfo.start.toLocaleDateString(),
      end: dateInfo.end.toLocaleDateString(),
      title: dateInfo.view.title
    });
    
    // Check how many events fall within this date range
    const eventsInView = events.filter(event => {
      const eventDate = new Date(event.start);
      return eventDate >= dateInfo.start && eventDate < dateInfo.end;
    });
    console.log(`Events in current view (${dateInfo.start.toLocaleDateString()} to ${dateInfo.end.toLocaleDateString()}): ${eventsInView.length}`);
    
    if (eventsInView.length > 0) {
      console.log('Sample events in view:', eventsInView.slice(0, 3).map(e => ({
        title: e.title,
        start: e.start,
        course: e.extendedProps.course
      })));
    }
    
    // Reset render count when view changes
    renderCountRef.current = 0;
  };

  const handleWindowResize = () => {
    const savedView = localStorage.getItem('feri-calendar-view');
    if (!savedView && calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      if (window.innerWidth < 768) {
        calendarApi.changeView('listWeek');
      } else {
        calendarApi.changeView('timeGridWeek');
      }
    }
    
    // Force re-render of events to update shorthand/full names
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.render();
    }
  };

  const renderEventContent = (eventInfo: any) => {
    if (eventInfo.event.extendedProps.isCommonFreeSlot) return <span>Free time</span>;
    const location = eventInfo.event.extendedProps.location;
    const courseName = eventInfo.event.title;
    const courseType = eventInfo.event.extendedProps.type;
    const owners = eventInfo.event.extendedProps.timetables || [];
    // Full name for tooltip (always with type if available)
    const fullName = courseType ? `${courseName} (${courseType})` : courseName;
    
    return (
      <div className={`fc-event-main-frame${owners.length > 1 ? ' fc-event-shared' : ''}`}>
        {owners.length > 1 && <div
          className="fc-event-owner-stripes"
          role="img"
          aria-label={owners.map((owner: { label: string }) => owner.label).join(', ')}
          title={owners.map((owner: { label: string }) => owner.label).join(', ')}
          style={{ backgroundImage: `linear-gradient(to bottom, ${owners.map((owner: { color: string }, index: number) =>
            `${owner.color} ${index * 100 / owners.length}% ${(index + 1) * 100 / owners.length}%`).join(', ')})` }}
        />}
        <div className="fc-event-time">{eventInfo.timeText}</div>
        <div className="fc-event-title-container">
          <div className="fc-event-title" title={fullName} aria-label={fullName}>
            {courseName}{courseType && <span className="fc-event-type"> ({courseType})</span>}
          </div>
          {location && <div className="fc-event-location">{location}</div>}
        </div>
      </div>
    );
  };

  const handleEventDidMount = (info: any) => {
    // Count how many events are actually rendered
    renderCountRef.current++;
    
    if (renderCountRef.current <= 10) {
      console.log(`Event rendered #${renderCountRef.current}:`, info.event.title, 'at', info.event.start?.toLocaleString());
    }
    
    if (renderCountRef.current === events.length) {
      console.log(`✅ All ${events.length} events have been rendered by FullCalendar`);
    }
  };

  useEffect(() => {
    // Mark calendar as initialized after first render
    const timer = setTimeout(() => {
      if (calendarRef.current) {
        (calendarRef.current.getApi() as any).isInitialized = true;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView={getSavedView()}
      firstDay={1}
      timeZone="local"
      nowIndicator={true}
      now={() => new Date()}
      /* validRange={{
        start: new Date(new Date().getFullYear(), 8, 1), // September 1st
        end: new Date(new Date().getFullYear() + 1, 8, 30), // August 30th next year
      }} */
      eventTimeFormat={{
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }}
      slotLabelFormat={{
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }}
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
      }}
      views={{
        timeGridWeek: {
          slotMinTime: '07:00:00',
          slotMaxTime: '21:00:00',
        },
        timeGridDay: {
          slotMinTime: '07:00:00',
          slotMaxTime: '21:00:00',
        },
      }}
      /* businessHours={{
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '20:00',
      }} */
      weekends={false}
      events={[...events, ...freeSlots]}
      slotEventOverlap={false}
      eventDisplay="block"
      displayEventTime={true}
      eventContent={renderEventContent}
      height="auto"
      eventClick={handleEventClick}
      eventDidMount={handleEventDidMount}
      datesSet={handleDatesSet}
      windowResize={handleWindowResize}
    />
  );
}
