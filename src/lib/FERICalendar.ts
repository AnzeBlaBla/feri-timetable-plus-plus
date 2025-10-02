import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import ICAL from "ical.js";

interface Session {
  cookies: Map<string, string>;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    course: string;
    type: string;
    group: string;
    persons: string;
    location: string;
    description: string;
  };
}

export default class FERICalendar {
  // calendarId_filterId -> FERICalendar instance
  static calendarCache: Map<string, FERICalendar> = new Map();

  private filterId: string;
  private calendarId: string;

  private icalData: string | null = null;
  private courseGroups: Record<string, string[]> = {};

  public isInitialized: boolean = false;

  constructor(filterId: string, calendarId: string) {
    this.filterId = filterId;
    this.calendarId = calendarId;
  }

  public static getCalendar(
    filterId: string,
    calendarId: string = "wtt_um_feri",
  ): FERICalendar {
    const cacheKey = FERICalendar.getCacheKey(calendarId, filterId);
    let calendar = FERICalendar.calendarCache.get(cacheKey);
    if (calendar) {
      console.log(`Using cached calendar for key: ${cacheKey}`);
      return calendar;
    }

    calendar = new FERICalendar(filterId, calendarId);
    FERICalendar.calendarCache.set(cacheKey, calendar);
    return calendar;
  }

  private static getCacheKey(calendarId: string, filterId: string): string {
    return `${calendarId}_${filterId}`;
  }

  public static clearCache(): void {
    FERICalendar.calendarCache.clear();
    console.log("Calendar cache cleared");
  }

  public static getCacheSize(): number {
    return FERICalendar.calendarCache.size;
  }

  private getCacheKey(): string {
    return FERICalendar.getCacheKey(this.calendarId, this.filterId);
  }

  private async fetchIcal(): Promise<string> {
    const session: Session = {
      cookies: new Map<string, string>(),
    };

    function updateCookies(response: any): void {
      const setCookies = response.headers.raw()["set-cookie"];
      if (setCookies) {
        setCookies.forEach((cookie: string) => {
          const [nameValue] = cookie.split(";");
          const [name, value] = nameValue.split("=");
          session.cookies.set(name, value);
        });
      }
    }

    function getCookieString() {
      return Array.from(session.cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }

    try {
      // Initial GET request to get the form
      const response = await fetch(
        `https://www.wise-tt.com/${this.calendarId}/index.jsp?filterId=${this.filterId}`,
        {
          headers: {
            Cookie: getCookieString(),
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      updateCookies(response);
      const html = await response.text();

      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Find ViewState
      const viewstateInput = document.querySelector(
        'input[name="javax.faces.ViewState"]',
      );
      const viewstate = viewstateInput
        ? (viewstateInput as HTMLInputElement).value
        : null;

      if (!viewstate) {
        throw new Error("ViewState not found in response");
      }

      // Find ICS button element
      const icsElement = document.querySelector(
        '[title^="Izvoz celotnega urnika v ICS formatu"]',
      );
      let formId = null;

      if (icsElement && icsElement.getAttribute("onclick")) {
        const onclick = icsElement.getAttribute("onclick");
        const match = onclick ? onclick.match(/'([^']*:j_idt\d+)'/) : null;
        formId = match ? match[1] : null;
      }

      if (!formId) {
        throw new Error("ICS element not found or missing onclick attribute");
      }

      const today = new Date();
      const date = today.toLocaleDateString("sl-SI", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      // Submit the form to download the calendar
      const data = new URLSearchParams({
        form: "form",
        "form:newDate_input": date,
        "javax.faces.ViewState": viewstate,
        [formId]: formId,
      });

      const postResponse = await fetch(
        `https://www.wise-tt.com/${this.calendarId}/pages/home.jsf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: getCookieString(),
          },
          body: data,
        },
      );

      if (!postResponse.ok) {
        throw new Error(`HTTP error! status: ${postResponse.status}`);
      }

      return await postResponse.text();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch calendar: ${errorMessage}`);
    }
  }

  public async init(): Promise<void> {
    const cacheKey = this.getCacheKey();
    try {
      this.icalData = await this.fetchIcal();
      FERICalendar.calendarCache.set(cacheKey, this);
      this.isInitialized = true;
      console.log(`Calendar fetched and cached for key: ${cacheKey}`);
    } catch (error) {
      console.error(`Failed to fetch calendar for key: ${cacheKey}`, error);
      return;
    }

    // Parse iCal to extract course groups
    this.parseCourseGroups();
  }

  private parseCourseGroups(): void {
    if (!this.icalData) {
      return;
    }

    const jcalData = ICAL.parse(this.icalData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents("vevent");

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      const parts = event.description.split(",");
      const [course, type, ...persons] = parts.map((part) => part.trim());
      const group = persons.pop();
      
      if (!course || !type || !group) {
        console.warn("Unexpected event format:", event.description);
        continue;
      }

      if (!this.courseGroups[course]) {
        this.courseGroups[course] = [];
      }

      if (!this.courseGroups[course].includes(group)) {
        this.courseGroups[course].push(group);
      }
    }
  }

  public getCourseGroups(): Record<string, string[]> {
    return this.courseGroups;
  }

  public getIcalData(): string | null {
    return this.icalData;
  }

  public getFilteredIcal(selectedGroups: Record<string, string[]>): string {
    if (!this.icalData) {
      throw new Error("Calendar data not available");
    }

    try {
      // Parse the iCal data
      const jcalData = ICAL.parse(this.icalData);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents("vevent");
      
      // Filter events
      const filteredEvents = vevents.filter((vevent: any) => {
        const event = new ICAL.Event(vevent);
        const parts = event.description.split(",");
        const [course, type, ...persons] = parts.map((part: string) => part.trim());
        const group = persons.pop();
        
        if (!course || !group) {
          return false; // Skip malformed events
        }
        
        // Include event if:
        // 1. The course is in selectedGroups AND
        // 2. The group is in the selected groups for that course
        return selectedGroups[course] && selectedGroups[course].includes(group);
      });
      
      // Remove all existing events from the component
      vevents.forEach((vevent: any) => {
        comp.removeSubcomponent(vevent);
      });
      
      // Add filtered events back
      filteredEvents.forEach((vevent: any) => {
        comp.addSubcomponent(vevent);
      });
      
      // Convert back to iCal string
      return comp.toString();
      
    } catch (error) {
      console.error("Error filtering iCal:", error);
      // Return original iCal if filtering fails
      return this.icalData;
    }
  }

  public getCalendarEvents(selectedGroups: Record<string, string[]>): CalendarEvent[] {
    if (!this.icalData) {
      throw new Error("Calendar data not available");
    }

    try {
      // Parse the iCal data
      const jcalData = ICAL.parse(this.icalData);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents("vevent");
      
      const events: CalendarEvent[] = [];
      
      // Define colors for different courses
      const courseColors = [
        '#3788d8', '#e91e63', '#ff9800', '#4caf50', '#9c27b0',
        '#f44336', '#2196f3', '#ff5722', '#795548', '#607d8b',
        '#009688', '#8bc34a', '#ffeb3b', '#673ab7'
      ];
      
      const courseColorMap: Record<string, string> = {};
      let colorIndex = 0;
      
      vevents.forEach((vevent: any) => {
        const event = new ICAL.Event(vevent);
        const parts = event.description.split(",");
        const [course, type, ...persons] = parts.map((part: string) => part.trim());
        const group = persons.pop();
        
        if (!course || !group) {
          return; // Skip malformed events
        }
        
        // Only include events for selected groups
        if (!selectedGroups[course] || !selectedGroups[course].includes(group)) {
          return;
        }
        
        // Assign color to course if not already assigned
        if (!courseColorMap[course]) {
          courseColorMap[course] = courseColors[colorIndex % courseColors.length];
          colorIndex++;
        }
        
        // Create FullCalendar event object
        const fullCalendarEvent = {
          id: event.uid,
          title: `${course} (${type})`,
          start: event.startDate.toJSDate().toISOString(),
          end: event.endDate.toJSDate().toISOString(),
          backgroundColor: courseColorMap[course],
          borderColor: courseColorMap[course],
          extendedProps: {
            course: course,
            type: type,
            group: group,
            persons: persons.join(', '),
            location: event.location || '',
            description: event.description
          }
        };
        
        events.push(fullCalendarEvent);
      });
      
      return events;
      
    } catch (error) {
      console.error("Error converting iCal to events:", error);
      return [];
    }
  }
}
