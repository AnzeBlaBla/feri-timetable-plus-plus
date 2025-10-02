import express, { Request, Response } from "express";
import path from "path";
import calendarRoutes from "./routes/calendar";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set EJS as template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.get("/", (req: Request, res: Response) => {
  res.render("index");
});

// Use calendar routes
app.use(calendarRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});