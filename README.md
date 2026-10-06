# Feri Timetable Plus Plus

A timetable application for FERI UM. Goal is group selection per subject (as that's not supported on the official site, for some reason...)
> [!WARNING]
> VIBE CODING AHEAD: This project is a vibecoded app that was created purely for myself and is not meant to be trusted, used by other people, or even touched or upgraded, ever, in the future. It is not a reflection of my coding ability.
> If you are a masochist and would like to look into the code, I recommend a premium subscription to your LLM of choice, because any code in here has not been seen by a human, and should never be.


## Installation

Clone the repository and navigate to the project directory.

```bash
git clone https://github.com/anzeblabla/feri-timetable-plus-plus.git
cd feri-timetable-plus-plus
```

Install dependencies:

```bash
npm install
```

## Configuration

Copy the example environment file and add your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your WISE Timetable API credentials:

```env
WTT_USERNAME=your_username_here
WTT_PASSWORD=your_password_here
```

For local Next.js development, use `.env.local`; escape literal `$` characters there with a backslash. For Docker, place the credentials in the project-root `.env` beside `docker-compose.yml`; Docker uses this same file for both the static build and the running container. Wrap values containing `$` in single quotes and do not add a backslash, for example `WTT_PASSWORD='part$with$dollars'`. The file is available only to the server-side build and container; do not expose these values through `NEXT_PUBLIC_*` variables.

## Deployment

Deploy from the branch you intend to serve:

```bash
./deploy.sh
```

The deployment script pulls the current branch, pulls Traefik, rebuilds the application, and recreates the services.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## MCP timetable connection

FERI Timetable++ provides a public, read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for the timetable currently selected in the web app.

1. Open a timetable and choose the programme, year, branches, and class groups.
2. Select **Connect MCP** in the timetable toolbar.
3. Copy the generated server URL, or adapt the displayed `mcpServers` JSON to your MCP client's configuration format.

The endpoint uses Streamable HTTP at `/api/mcp`. The generated URL contains the selected timetable parameters, including the chosen groups, but never the WISE API credentials. For example, a client that accepts remote MCP configuration can use:

```json
{
  "mcpServers": {
    "feri-timetable": {
      "url": "https://your-host.example/api/mcp?programme=...&year=...&branches=...&groups=..."
    }
  }
}
```

Treat the generated URL as a shareable timetable link: anyone with it can read the timetable selection encoded in it. The MCP server is public and read-only; it cannot change your selected programme or groups after the connection is initialized.

### Available MCP capabilities

- The `timetable://selection` resource describes the connected programme, groups, timezone, and current academic-year data window.
- `get_day_schedule` returns classes for one calendar date.
- `get_week_schedule` returns the Monday-through-Sunday week containing a supplied calendar date.
- `search_schedule` finds classes in a date range of up to 31 days and can filter by weekday, course, class type, group, instructor, room, or text.
- `get_schedule_filter_options` lists the values available for those filters.

All dates use `YYYY-MM-DD`; schedule times and week boundaries use the `Europe/Ljubljana` timezone. The timetable data is available only for the current academic year reported by the selection resource.

## Validation

```bash
npm test
npm run build
```
