'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Programme } from '@/types/types';

interface TimetableControlsProps {
  programmes: Programme[];
  currentProgrammeId: string;
  currentYear: string;
  branches: string;
}

export function TimetableControls({
  programmes,
  currentProgrammeId,
  currentYear,
  branches,
}: TimetableControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedProgramme, setSelectedProgramme] = useState(currentProgrammeId);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  // Sync state with props when URL changes
  useEffect(() => {
    setSelectedProgramme(currentProgrammeId);
    setSelectedYear(currentYear);
  }, [currentProgrammeId, currentYear]);

  useEffect(() => {
    const programme = programmes.find(p => p.id === selectedProgramme);
    if (programme) {
      const totalYears = parseInt(programme.year);
      setAvailableYears(Array.from({ length: totalYears }, (_, i) => (i + 1).toString()));
    }
  }, [selectedProgramme, programmes]);

  const handleProgrammeChange = (programmeId: string) => {
    setSelectedProgramme(programmeId);
    const programme = programmes.find(p => p.id === programmeId);
    if (programme) {
      // Reset to year 1 when changing programme (groups will be reset by page reload)
      const newYear = '1';
      setSelectedYear(newYear);
      router.push(`/timetable?programme=${programmeId}&year=${newYear}&branches=${branches}`);
    }
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    // When changing year only, don't preserve groups as they might not be valid for the new year
    router.push(`/timetable?programme=${selectedProgramme}&year=${year}&branches=${branches}`);
  };

  return (
    <div className="d-flex align-items-center gap-2 justify-content-md-end flex-wrap">
      <div className="d-flex align-items-center gap-1">
        <small className="text-muted">Programme:</small>
        <select
          className="form-select form-select-sm"
          style={{ minWidth: '200px' }}
          value={selectedProgramme}
          onChange={(e) => handleProgrammeChange(e.target.value)}
        >
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

      <div className="d-flex align-items-center gap-1">
        <small className="text-muted">Year:</small>
        <div className="d-flex gap-1">
          {availableYears.map((year) => (
            <button
              key={year}
              type="button"
              className={`btn btn-sm ${
                year === selectedYear ? 'btn-primary' : 'btn-outline-primary'
              } year-button`}
              onClick={() => handleYearChange(year)}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
