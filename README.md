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

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.



