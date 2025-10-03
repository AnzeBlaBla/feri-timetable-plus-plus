'use client';

import { useState, useEffect } from 'react';
import { Programme } from '@/types/types';

export interface ProgrammeSelectionState {
  selectedProgramme: Programme | null;
  selectedYear: string | null;
  availableYears: string[];
}

export function useProgrammeSelection(programmes: Programme[]) {
  const [selectedProgramme, setSelectedProgramme] = useState<Programme | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  // Update available years when programme changes
  useEffect(() => {
    if (selectedProgramme) {
      const totalYears = parseInt(selectedProgramme.year);
      const years = Array.from({ length: totalYears }, (_, i) => (i + 1).toString());
      setAvailableYears(years);
      // Reset year selection when programme changes
      setSelectedYear(null);
    } else {
      setAvailableYears([]);
      setSelectedYear(null);
    }
  }, [selectedProgramme]);

  const handleProgrammeChange = (programmeId: string) => {
    const programme = programmes.find(p => p.id === programmeId);
    setSelectedProgramme(programme || null);
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
  };

  const isValid = selectedProgramme !== null && selectedYear !== null;

  return {
    selectedProgramme,
    selectedYear,
    availableYears,
    handleProgrammeChange,
    handleYearChange,
    isValid,
  };
}
