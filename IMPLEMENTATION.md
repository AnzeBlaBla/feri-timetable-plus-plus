# Index Page Implementation

## ✅ What's Been Implemented

### 1. **Reusable Custom Hook** - `useProgrammeSelection`
Located at: `src/hooks/useProgrammeSelection.ts`

This hook manages the state for programme and year selection:
- Tracks selected programme and year
- Automatically generates available years based on programme
- Validates if selection is complete
- Provides handlers for programme and year changes

**Usage:**
```tsx
const {
  selectedProgramme,
  selectedYear,
  availableYears,
  handleProgrammeChange,
  handleYearChange,
  isValid,
} = useProgrammeSelection(programmes);
```

### 2. **Reusable Components**

#### `ProgrammeSelector` (`src/components/ProgrammeSelector.tsx`)
- Dropdown select for choosing a programme
- Shows programme name and duration (e.g., "Computer Science (3 years)")
- Fully styled with Tailwind CSS

#### `YearSelector` (`src/components/YearSelector.tsx`)
- Button-based year selection
- Dynamically generates year buttons based on selected programme
- Shows placeholder when no programme is selected
- Visual feedback for selected year

#### `ProgrammeSelectionForm` (`src/components/ProgrammeSelectionForm.tsx`)
- Combines both selectors into a complete form
- Handles form submission and navigation to timetable page
- Validates selection before allowing submission
- Uses Next.js router for client-side navigation

### 3. **Server-Side Rendering**

#### `timetable-server.ts` (`src/lib/timetable-server.ts`)
- Singleton pattern for timetable instance
- Server-side utility functions
- Caches timetable instance across requests

#### Home Page (`src/app/page.tsx`)
- **Server Component** that fetches programmes at build time
- Error handling for missing credentials
- Shows helpful error message with setup instructions
- Pre-renders with data from the API

### 4. **Features from Original EJS Implementation**

✅ Programme dropdown with name and year display
✅ Dynamic year buttons (1 to N based on programme)
✅ Year button selection with visual feedback
✅ Form validation - button disabled until both selected
✅ Navigation to timetable with query parameters
✅ All branches selected by default (`branches=all`)
✅ Loading state handling
✅ Error display

### 5. **Improvements Over Original**

- **Server-Side Rendering**: Programmes loaded on server, no loading spinner needed
- **Type Safety**: Full TypeScript support with proper types
- **Reusability**: Hook and components can be reused anywhere
- **Modern Styling**: Tailwind CSS instead of Bootstrap
- **Better Error Handling**: Graceful error display with setup instructions
- **Next.js App Router**: Modern routing with built-in optimizations

## 🏗️ Architecture

```
src/
├── app/
│   └── page.tsx                    # Server component (fetches data)
├── components/
│   ├── ProgrammeSelector.tsx       # Reusable programme dropdown
│   ├── YearSelector.tsx            # Reusable year buttons
│   └── ProgrammeSelectionForm.tsx  # Client component (interactive)
├── hooks/
│   └── useProgrammeSelection.ts    # Reusable selection logic
└── lib/
    └── timetable-server.ts         # Server-side data fetching
```

## 🎨 Design

The page features:
- Clean, modern design with Tailwind CSS
- Responsive layout (works on mobile and desktop)
- Card-based UI with shadow effects
- Blue color scheme matching university branding
- Accessible form controls with proper labels
- Smooth transitions and hover effects

## 📝 Next Steps

To make the page fully functional, you need to:

1. **Add environment variables** (`.env.local`):
   ```env
   WTT_USERNAME=your_username
   WTT_PASSWORD=your_password
   ```

2. **Restart the dev server** after adding credentials

3. The page will then:
   - Load programmes from the FERI API
   - Display the selection form
   - Allow navigation to timetable view

## 🔄 State Flow

```
Server (RSC) → Fetch programmes → Pass to Client Component
                                           ↓
                                  useProgrammeSelection hook
                                           ↓
                         ProgrammeSelector + YearSelector
                                           ↓
                                  User makes selection
                                           ↓
                              Navigate to /timetable
```
