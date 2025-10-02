import { Router, Request, Response } from "express";
import FERICalendar from "../lib/FERICalendar";
import { encodeGroupSelection, decodeGroupSelection } from "../lib/utils";

const router = Router();

// JSON API route for calendar data (for AJAX updates)
router.get("/api/calendar/:filterId", async (req: Request, res: Response) => {
  try {
    const { filterId } = req.params;
    console.log('API Request - FilterId:', filterId);
    console.log('API Request - Query:', req.query);
    
    // Parse selectedGroups from query parameters
    const selectedGroups: { [course: string]: string[] } = {};
    
    // Handle the query parameter format: selectedGroups[course][]=group1&selectedGroups[course][]=group2
    Object.keys(req.query).forEach(key => {
      const match = key.match(/selectedGroups\[(.+?)\]\[\]/);
      if (match) {
        const course = match[1];
        const value = req.query[key];
        
        if (!selectedGroups[course]) {
          selectedGroups[course] = [];
        }
        
        if (Array.isArray(value)) {
          selectedGroups[course].push(...(value as string[]));
        } else if (value) {
          selectedGroups[course].push(value as string);
        }
      }
    });
    
    console.log('Parsed selectedGroups:', selectedGroups);
    
    if (!filterId) {
      return res.status(400).json({ error: "Filter ID is required" });
    }

    const calendar = FERICalendar.getCalendar(filterId);
    
    if (!calendar.isInitialized) {
      await calendar.init();
    }
    
    const events = calendar.getCalendarEvents(selectedGroups);
    console.log('Generated events count:', events.length);
    
    res.json({ events });
    
  } catch (error) {
    console.error("Error fetching calendar data:", error);
    res.status(500).json({ error: "Failed to fetch calendar data" });
  }
});

// Groups route without encoded groups (initial access)
router.get("/groups/:filterId", async (req: Request, res: Response) => {
  try {
    const { filterId } = req.params;
    
    if (!filterId) {
      return res.status(400).render("error", { 
        error: "Filter ID is required" 
      });
    }

    const calendar = FERICalendar.getCalendar(filterId);
    
    // Initialize the calendar to fetch data
    if (!calendar.isInitialized) {
      await calendar.init();
    }
    
    const courseGroups = calendar.getCourseGroups();
    
    res.render("groups", { 
      filterId,
      courseGroups,
      courses: Object.keys(courseGroups),
      previouslySelectedGroups: {}
    });
    
  } catch (error) {
    console.error("Error fetching course groups:", error);
    res.status(500).render("error", { 
      error: "Failed to fetch course groups. Please check your filter ID." 
    });
  }
});

// Groups route with encoded groups (editing existing selection)
router.get("/groups/:filterId/:encodedGroups", async (req: Request, res: Response) => {
  try {
    const { filterId, encodedGroups } = req.params;
    
    if (!filterId) {
      return res.status(400).render("error", { 
        error: "Filter ID is required" 
      });
    }

    // Decode previously selected groups
    let previouslySelectedGroups: Record<string, string[]> = {};
    if (encodedGroups) {
      try {
        previouslySelectedGroups = decodeGroupSelection(encodedGroups);
      } catch (error) {
        console.warn("Failed to decode previously selected groups:", error);
        // Continue without previously selected groups
      }
    }

    const calendar = FERICalendar.getCalendar(filterId);
    
    // Initialize the calendar to fetch data
    if (!calendar.isInitialized) {
      await calendar.init();
    }
    
    const courseGroups = calendar.getCourseGroups();
    
    res.render("groups", { 
      filterId,
      courseGroups,
      courses: Object.keys(courseGroups),
      previouslySelectedGroups
    });
    
  } catch (error) {
    console.error("Error fetching course groups:", error);
    res.status(500).render("error", { 
      error: "Failed to fetch course groups. Please check your filter ID." 
    });
  }
});

// Handle group selection form submission
router.post("/groups/submit", async (req: Request, res: Response) => {
  try {
    console.log('Request body:', req.body); // Debug log
    console.log('Request headers:', req.headers['content-type']); // Debug log
    
    const { filterId, selectedGroups } = req.body || {};
    
    if (!filterId) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(400).json({ error: "Filter ID is required" });
      }
      return res.status(400).render("error", { 
        error: "Filter ID is required" 
      });
    }

    // Encode the selected groups
    const encodedGroups = encodeGroupSelection(selectedGroups || {});
    
    // Handle AJAX requests (return JSON)
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, encodedGroups });
    }
    
    // Handle regular form submissions (redirect)
    res.redirect(`/calendar/${filterId}/${encodedGroups}`);
    
  } catch (error) {
    console.error("Error processing group selection:", error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: "Failed to process group selection" });
    }
    res.status(500).render("error", { 
      error: "Failed to process group selection" 
    });
  }
});

// View calendar in web interface (now the main calendar route)
router.get("/calendar/:filterId/:encodedGroups", async (req: Request, res: Response) => {
  try {
    const { filterId, encodedGroups } = req.params;
    
    // Decode selected groups from URL
    let selectedGroups: Record<string, string[]>;
    try {
      selectedGroups = decodeGroupSelection(encodedGroups);
    } catch (error) {
      return res.render("error", { error: "Invalid group selection encoding" });
    }
    
    // Get calendar instance
    const calendar = FERICalendar.getCalendar(filterId);
    
    // Initialize if needed
    if (!calendar.isInitialized) {
      await calendar.init();
    }
    
    // Get calendar events for FullCalendar
    const events = calendar.getCalendarEvents(selectedGroups);
    
    // Get all available course groups for editing
    const courseGroups = calendar.getCourseGroups();
    
    res.render("calendar", {
      filterId,
      selectedGroups,
      events,
      courseGroups,
      courses: Object.keys(courseGroups),
      downloadUrl: `/download/${filterId}/${encodedGroups}`,
      editGroupsUrl: `/groups/${filterId}/${encodedGroups}`
    });
    
  } catch (error) {
    console.error("Error displaying calendar:", error);
    res.render("error", { error: "Failed to display calendar" });
  }
});

// Download filtered calendar as .ics file
router.get("/download/:filterId/:encodedGroups", async (req: Request, res: Response) => {
  try {
    const { filterId, encodedGroups } = req.params;
    
    // Decode selected groups from URL
    let selectedGroups: Record<string, string[]>;
    try {
      selectedGroups = decodeGroupSelection(encodedGroups);
    } catch (error) {
      return res.status(400).send("Invalid group selection encoding");
    }
    
    // Get calendar instance
    const calendar = FERICalendar.getCalendar(filterId);
    
    // Initialize if needed
    if (!calendar.isInitialized) {
      await calendar.init();
    }
    
    // Get filtered iCal data
    const filteredIcal = calendar.getFilteredIcal(selectedGroups);
    
    // Set appropriate headers for iCal file
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="feri-timetable-${filterId}.ics"`,
      'Cache-Control': 'no-cache'
    });
    
    res.send(filteredIcal);
    
  } catch (error) {
    console.error("Error generating filtered calendar:", error);
    res.status(500).send("Failed to generate filtered calendar");
  }
});

export default router;