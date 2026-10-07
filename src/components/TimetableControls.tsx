import type { Programme } from '@/types/types';

interface TimetableControlsProps {
  programmes: Programme[];
  currentProgrammeId: string;
  currentYear: string;
  timetableId: string;
  timetableLabel: string;
  onProgrammeChange: (programmeId: string) => void;
  onYearChange: (year: string) => void;
}

export function TimetableControls({
  programmes,
  currentProgrammeId,
  currentYear,
  timetableId,
  timetableLabel,
  onProgrammeChange,
  onYearChange,
}: TimetableControlsProps) {
  const programme = programmes.find(item => item.id === currentProgrammeId);
  const years = Array.from({ length: Number(programme?.year || 0) }, (_, index) => String(index + 1));

  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <div className="d-flex align-items-center gap-1">
        <label className="small text-muted" htmlFor={`programme-${timetableId}`}>Programme:</label>
        <select
          id={`programme-${timetableId}`}
          className="form-select form-select-sm"
          style={{ minWidth: '200px', width: 'auto' }}
          aria-label={`${timetableLabel} programme`}
          value={currentProgrammeId}
          onChange={event => onProgrammeChange(event.target.value)}
        >
          {programmes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="d-flex align-items-center gap-1">
        <span className="small text-muted">Year:</span>
        <div className="btn-group" role="group" aria-label={`${timetableLabel} year`}>
          {years.map(year => (
            <button
              key={year}
              type="button"
              className={`btn btn-sm ${year === currentYear ? 'btn-primary' : 'btn-outline-primary'}`}
              aria-pressed={year === currentYear}
              onClick={() => onYearChange(year)}
            >{year}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
