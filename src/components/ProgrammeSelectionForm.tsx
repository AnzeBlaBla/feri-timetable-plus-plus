'use client';

import { useRouter } from 'next/navigation';
import { Programme } from '@/types/types';
import { useProgrammeSelection } from '@/hooks/useProgrammeSelection';
import { ProgrammeSelector } from './ProgrammeSelector';
import { YearSelector } from './YearSelector';

interface ProgrammeSelectionFormProps {
  programmes: Programme[];
}

export function ProgrammeSelectionForm({ programmes }: ProgrammeSelectionFormProps) {
  const router = useRouter();
  const {
    selectedProgramme,
    selectedYear,
    availableYears,
    handleProgrammeChange,
    handleYearChange,
    isValid,
  } = useProgrammeSelection(programmes);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProgramme || !selectedYear) {
      return;
    }

    // Create URL parameters for the timetable route - always use all branches
    const params = new URLSearchParams();
    params.set('programme', selectedProgramme.id);
    params.set('year', selectedYear);
    params.set('branches', 'all');

    // Navigate to timetable view
    router.push(`/timetable?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="row">
        <div className="col-md-8">
          <ProgrammeSelector
            programmes={programmes}
            selectedProgramme={selectedProgramme}
            onProgrammeChange={handleProgrammeChange}
          />
        </div>
        <div className="col-md-4">
          <YearSelector
            availableYears={availableYears}
            selectedYear={selectedYear}
            onYearChange={handleYearChange}
            disabled={!selectedProgramme}
          />
        </div>
      </div>

      <div className="row">
        <div className="col-12">
          <button
            type="submit"
            disabled={!isValid}
            className="btn btn-primary w-100"
          >
            {isValid ? 'Show Timetable' : 'Select Programme and Year First'}
          </button>
        </div>
      </div>
    </form>
  );
}
