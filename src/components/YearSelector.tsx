'use client';

interface YearSelectorProps {
  availableYears: string[];
  selectedYear: string | null;
  onYearChange: (year: string) => void;
  disabled?: boolean;
}

export function YearSelector({
  availableYears,
  selectedYear,
  onYearChange,
  disabled = false,
}: YearSelectorProps) {
  if (disabled || availableYears.length === 0) {
    return (
      <div className="mb-3">
        <label className="form-label">Year</label>
        <div className="text-muted small">Select a programme first</div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <label className="form-label">Year</label>
      <div className="d-flex flex-wrap gap-2">
        {availableYears.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => onYearChange(year)}
            className={`btn btn-sm ${
              selectedYear === year ? 'btn-primary' : 'btn-outline-primary'
            } year-button`}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  );
}
