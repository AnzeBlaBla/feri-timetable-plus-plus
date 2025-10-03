'use client';

import { useEffect, useRef } from 'react';
import { CalendarEvent } from '@/types/timetable';

interface TimetableCalendarProps {
  events: CalendarEvent[];
}

declare global {
  interface Window {
    FullCalendar: any;
    bootstrap: any;
  }
}

export function TimetableCalendar({ events }: TimetableCalendarProps) {
  const calendarRef = useRef<any>(null);

  useEffect(() => {
    // Check if FullCalendar is loaded
    if (typeof window === 'undefined' || !window.FullCalendar) {
      console.log('Waiting for FullCalendar to load...');
      return;
    }

    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    function getSavedView() {
      const savedView = localStorage.getItem('feri-calendar-view');
      if (!savedView) {
        return window.innerWidth < 768 ? 'listWeek' : 'timeGridWeek';
      }
      return savedView;
    }

    function saveViewPreference(viewName: string) {
      localStorage.setItem('feri-calendar-view', viewName);
    }

    // Only initialize calendar if it hasn't been created yet
    if (!calendarRef.current) {
      console.log('Initializing calendar with nowIndicator enabled');
      const calendar = new window.FullCalendar.Calendar(calendarEl, {
        initialView: getSavedView(),
        firstDay: 1,
        timeZone: 'local',
        nowIndicator: true,
        now: () => {
          const currentTime = new Date();
          console.log('FullCalendar now() called, returning:', currentTime.toISOString());
          return currentTime;
        },
        eventTimeFormat: {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        },
        slotLabelFormat: {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        },
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
        },
        views: {
          timeGridWeek: {
            slotMinTime: '07:00:00',
            slotMaxTime: '21:00:00',
          },
          timeGridDay: {
            slotMinTime: '07:00:00',
            slotMaxTime: '21:00:00',
          },
        },
        businessHours: {
          daysOfWeek: [1, 2, 3, 4, 5],
          startTime: '08:00',
          endTime: '20:00',
        },
        weekends: true,
        events: events,
        eventDisplay: 'block',
        displayEventTime: true,
        height: 'auto',
        eventClick: function(info: any) {
          const event = info.event;
          const props = event.extendedProps;

        const modalContent = `
          <div class="modal fade" id="eventModal" tabindex="-1">
            <div class="modal-dialog">
              <div class="modal-content">
                <div class="modal-header" style="background-color: ${event.backgroundColor}; color: white;">
                  <h5 class="modal-title">${event.title}</h5>
                  <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                  <div class="row mb-2">
                    <div class="col-sm-4"><strong>Course:</strong></div>
                    <div class="col-sm-8">${props.course}</div>
                  </div>
                  <div class="row mb-2">
                    <div class="col-sm-4"><strong>Type:</strong></div>
                    <div class="col-sm-8">${props.type}</div>
                  </div>
                  <div class="row mb-2">
                    <div class="col-sm-4"><strong>Group:</strong></div>
                    <div class="col-sm-8">${props.group}</div>
                  </div>
                  ${props.persons ? `
                  <div class="row mb-2">
                    <div class="col-sm-4"><strong>Instructors:</strong></div>
                    <div class="col-sm-8">${props.persons}</div>
                  </div>
                  ` : ''}
                  ${props.location ? `
                  <div class="row mb-2">
                    <div class="col-sm-4"><strong>Location:</strong></div>
                    <div class="col-sm-8">${props.location}</div>
                  </div>
                  ` : ''}
                  <div class="row">
                    <div class="col-sm-4"><strong>Time:</strong></div>
                    <div class="col-sm-8">
                      ${event.start.toLocaleString()} - ${event.end.toLocaleString()}
                    </div>
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
        const modal = new window.bootstrap.Modal(document.getElementById('eventModal')!);
        modal.show();

        const modalEl = document.getElementById('eventModal')!;
        modalEl.addEventListener('hidden.bs.modal', function() {
          modalEl.remove();
        });
      },
      datesSet: function(info: any) {
        if ((calendar as any).isInitialized) {
          saveViewPreference(info.view.type);
        }
      },
      windowResize: function() {
        const savedView = localStorage.getItem('feri-calendar-view');
        if (!savedView) {
          if (window.innerWidth < 768) {
            calendar.changeView('listWeek');
          } else {
            calendar.changeView('timeGridWeek');
          }
        }
      },
    });

    calendar.render();
    calendarRef.current = calendar;
    
    setTimeout(() => {
      (calendar as any).isInitialized = true;
    }, 100);

    // Update calendar every minute to refresh the now indicator
    const nowIndicatorInterval = setInterval(() => {
      if (calendarRef.current) {
        calendarRef.current.refetchEvents();
      }
    }, 60000);

    return () => {
      clearInterval(nowIndicatorInterval);
      if (calendarRef.current) {
        calendarRef.current.destroy();
        calendarRef.current = null;
      }
    };
  }
  }, []);

  // Update calendar events when they change
  useEffect(() => {
    if (calendarRef.current) {
      const eventSources = calendarRef.current.getEventSources();
      eventSources.forEach((source: any) => source.remove());
      calendarRef.current.addEventSource(events);
    }
  }, [events]);

  return <div id="calendar"></div>;
}
