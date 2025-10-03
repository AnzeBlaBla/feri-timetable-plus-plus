'use client';

import { Programme } from '@/types/types';

interface ProgrammeSelectorProps {
  programmes: Programme[];
  selectedProgramme: Programme | null;
  onProgrammeChange: (programmeId: string) => void;
}

export function ProgrammeSelector({
  programmes,
  selectedProgramme,
  onProgrammeChange,
}: ProgrammeSelectorProps) {
  return (
    <div className="mb-3">
      <label htmlFor="programmeSelect" className="form-label">
        Programme
      </label>
      <select
        id="programmeSelect"
        className="form-select"
        value={selectedProgramme?.id || ''}
        onChange={(e) => onProgrammeChange(e.target.value)}
        required
      >
        <option value="">Select a programme...</option>
        {programmes.map((programme) => {
          const yearText = programme.year === '1' ? '1 year' : `${programme.year} years`;
          return (
            <option key={programme.id} value={programme.id}>
              {programme.name} ({yearText})
            </option>
          );
        })}
      </select>
    </div>
  );
}
