'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarEvent, SelectedGroups, TimetableSelection, TimetableSelectionData } from '@/types/timetable';
import { Programme } from '@/types/types';
import { GroupSelectionModal } from './GroupSelectionModal';
import { SelectedGroupsBadges } from './SelectedGroupsBadges';
import { TimetableCalendar } from './TimetableCalendar';
import { TimetableControls } from './TimetableControls';
import { Footer } from './Footer';
import { ThemeToggle } from './ThemeToggle';
import { McpConnectionModal } from './McpConnectionModal';
import { TIMETABLE_COLORS, decorateTimetableEvents, mergeTimetableEvents, serializeTimetables, timetableDisplayName, parseTimetablesParam, validateTimetableSelections } from '@/lib/timetable-selection';

interface TimetableClientProps {
  programmes: Programme[];
  initialTimetables: TimetableSelectionData[];
  initialColorMode: 'course' | 'timetable';
}

const COLOR_PRESETS = [
  ['Green', TIMETABLE_COLORS[0]], ['Red', TIMETABLE_COLORS[1]], ['Blue', TIMETABLE_COLORS[2]],
  ['Purple', TIMETABLE_COLORS[3]], ['Orange', '#fd7e14'], ['Yellow', '#ffc107'],
  ['Teal', '#20c997'], ['Pink', '#d63384'], ['Gray', '#6c757d'],
] as const;

function encodeGroups(groups: SelectedGroups): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(groups))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function decodeGroups(value: string): SelectedGroups {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '=');
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  } catch {
    return {};
  }
}

function getDefaultSelectedGroups(courseGroups: Record<string, string[]>): SelectedGroups {
  return Object.fromEntries(Object.entries(courseGroups).map(([course, groups]) => [course, [...groups]]));
}

function toSelection(entry: TimetableSelectionData): TimetableSelection {
  return {
    id: entry.id,
    programmeId: entry.programmeId,
    year: entry.year,
    branches: entry.branches,
    selectedGroups: entry.selectedGroups,
    label: entry.label,
    color: entry.color,
  };
}

function buildTimetableUrl(pathname: string, entries: TimetableSelectionData[], colorMode: 'course' | 'timetable') {
  const params = new URLSearchParams();
  params.set('timetables', serializeTimetables(entries.map(toSelection)));
  params.set('colorMode', colorMode);
  return `${pathname}?${params.toString()}`;
}

export function TimetableClient({ programmes, initialTimetables, initialColorMode }: TimetableClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState(initialTimetables);
  const [colorMode, setColorMode] = useState(initialColorMode);
  const [activeEntryId, setActiveEntryId] = useState(initialTimetables[0]?.id || '');
  const [shareUrl, setShareUrl] = useState('');
  const [showShareTooltip, setShowShareTooltip] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [showSubscription, setShowSubscription] = useState(false);
  const [hiddenEntryIds, setHiddenEntryIds] = useState<string[]>([]);
  const [showCommonFreeTime, setShowCommonFreeTime] = useState(false);
  const requestVersions = useRef<Record<string, number>>({});
  const skipUrlSync = useRef(true);
  const pushUrlOnUpdate = useRef(false);
  const lastUrlState = useRef('');

  useEffect(() => {
    setEntries(initialTimetables);
    setActiveEntryId(current => initialTimetables.some(entry => entry.id === current)
      ? current
      : initialTimetables[0]?.id || '');
    setColorMode(initialColorMode);
  }, [initialTimetables, initialColorMode]);

  const refreshEntry = useCallback(async (entry: TimetableSelectionData, groups?: SelectedGroups) => {
    const version = (requestVersions.current[entry.id] || 0) + 1;
    requestVersions.current[entry.id] = version;
    setEntries(current => current.map(item => item.id === entry.id
      ? { ...item, isUpdating: true, error: undefined }
      : item));

    try {
      const params = new URLSearchParams({
        programme: entry.programmeId,
        year: entry.year,
        branches: entry.branches,
      });
      if (groups) params.set('groups', encodeGroups(groups));
      const response = await fetch(`/api/timetable?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load timetable.');
      if (requestVersions.current[entry.id] !== version) return;

      const selectedGroups = groups && Object.keys(groups).length > 0
        ? groups
        : getDefaultSelectedGroups(data.courseGroups);
      setEntries(current => current.map(item => item.id === entry.id ? {
        ...item,
        courses: Object.keys(data.courseGroups).sort(),
        courseGroups: data.courseGroups,
        selectedGroups,
        events: data.events as CalendarEvent[],
        isUpdating: false,
        error: undefined,
      } : item));
    } catch (error) {
      if (requestVersions.current[entry.id] !== version) return;
      setEntries(current => current.map(item => item.id === entry.id ? {
        ...item,
        events: [],
        isUpdating: false,
        error: error instanceof Error ? error.message : 'Failed to load timetable.',
      } : item));
    }
  }, []);

  const updateEntry = (id: string, update: Partial<TimetableSelectionData>, addHistory = false) => {
    pushUrlOnUpdate.current = addHistory;
    setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...update } : entry));
  };

  const handleProgrammeChange = (entry: TimetableSelectionData, programmeId: string) => {
    const changed = { ...entry, programmeId, year: '1', selectedGroups: {}, courses: [], courseGroups: {}, events: [] };
    updateEntry(entry.id, { ...changed, isUpdating: true }, true);
    void refreshEntry(changed);
  };

  const handleYearChange = (entry: TimetableSelectionData, year: string) => {
    const changed = { ...entry, year, selectedGroups: {}, courses: [], courseGroups: {}, events: [] };
    updateEntry(entry.id, { ...changed, isUpdating: true }, true);
    void refreshEntry(changed);
  };

  const handleGroupsChange = (groups: SelectedGroups) => {
    const entry = entries.find(item => item.id === activeEntryId);
    if (!entry) return;
    const changed = { ...entry, selectedGroups: groups };
    updateEntry(entry.id, { selectedGroups: groups, isUpdating: true }, true);
    void refreshEntry(changed, groups);
  };

  const addTimetable = () => {
    if (entries.length >= 4) return;
    const firstProgramme = programmes[0];
    if (!firstProgramme) return;
    const entry: TimetableSelectionData = {
      id: Array.from(crypto.getRandomValues(new Uint32Array(4)), word => word.toString(16).padStart(8, '0')).join(''),
      programmeId: firstProgramme.id,
      year: '1',
      branches: 'all',
      selectedGroups: {},
      label: '',
      color: TIMETABLE_COLORS.find(color => !entries.some(item => item.color === color)) || TIMETABLE_COLORS[entries.length],
      courses: [],
      courseGroups: {},
      events: [],
      isUpdating: true,
    };
    pushUrlOnUpdate.current = true;
    setEntries(current => [...current, entry]);
    setActiveEntryId(entry.id);
    setColorMode('timetable');
    void refreshEntry(entry);
  };

  const removeTimetable = (id: string) => {
    const remaining = entries.filter(entry => entry.id !== id);
    if (!remaining.length) return;
    requestVersions.current[id] = (requestVersions.current[id] || 0) + 1;
    pushUrlOnUpdate.current = true;
    setEntries(remaining);
    setHiddenEntryIds(current => current.filter(entryId => entryId !== id));
    if (activeEntryId === id) setActiveEntryId(remaining[0].id);
  };

  const handleColorModeChange = (mode: 'course' | 'timetable') => {
    setColorMode(mode);
    pushUrlOnUpdate.current = true;
  };

  useEffect(() => {
    if (skipUrlSync.current) {
      skipUrlSync.current = false;
      return;
    }
    if (!entries.length) return;
    const stateKey = `${serializeTimetables(entries.map(toSelection))}|${colorMode}`;
    if (stateKey === lastUrlState.current) return;
    const url = buildTimetableUrl(pathname, entries, colorMode);
    if (pushUrlOnUpdate.current) window.history.pushState({ timetableState: stateKey }, '', url);
    else window.history.replaceState({ timetableState: stateKey }, '', url);
    lastUrlState.current = stateKey;
    pushUrlOnUpdate.current = false;
  }, [entries, colorMode, pathname]);

  useEffect(() => {
    const restoreUrlState = () => {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('colorMode') === 'course' ? 'course'
        : params.get('colorMode') === 'timetable' || params.has('timetables') ? 'timetable' : 'course';
      let selections: TimetableSelection[];
      try {
        if (params.has('timetables')) {
          selections = parseTimetablesParam(params.get('timetables')!);
        } else {
          const programmeId = params.get('programme');
          const year = params.get('year');
          if (!programmeId || !year) return;
          selections = [{
            id: 'main', programmeId, year, branches: params.get('branches') || 'all',
            selectedGroups: params.has('groups') ? decodeGroups(params.get('groups')!) : {},
            label: '', color: TIMETABLE_COLORS[0],
          }];
        }
        validateTimetableSelections(selections, programmes);
      } catch {
        return;
      }
      lastUrlState.current = `${serializeTimetables(selections)}|${mode}`;
      skipUrlSync.current = true;
      setColorMode(mode);
      setEntries(selections.map((selection, index) => {
        return {
          ...selection,
          color: selection.color || TIMETABLE_COLORS[index],
          courses: [], courseGroups: {}, events: [], isUpdating: true,
        };
      }));
      setActiveEntryId(selections[0].id);
      for (const selection of selections) {
        const programme = programmes.find(item => item.id === selection.programmeId);
        if (programme && Number(selection.year) <= Number(programme.year)) {
          const hasSavedGroups = params.has('timetables') || params.has('groups');
          void refreshEntry(
            { ...selection, courses: [], courseGroups: {}, events: [] },
            hasSavedGroups ? selection.selectedGroups : undefined,
          );
        }
      }
    };
    const onPopState = () => restoreUrlState();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [programmes, refreshEntry]);

  const activeEntry = entries.find(entry => entry.id === activeEntryId) || entries[0];
  const getLabel = (entry: TimetableSelectionData) => timetableDisplayName(entry, programmes);
  const visibleEntries = entries.filter(entry => !hiddenEntryIds.includes(entry.id));
  const canShowCommonFreeTime = entries.length > 1 && visibleEntries.length > 0 && visibleEntries.every(entry => !entry.isUpdating && !entry.error);
  const allEvents = mergeTimetableEvents(visibleEntries.flatMap(entry => decorateTimetableEvents(
    entry.events,
    toSelection(entry),
    getLabel(entry),
    colorMode,
  )), colorMode);

  const handleShare = () => {
    setShareUrl(`${window.location.origin}${buildTimetableUrl(pathname, entries, colorMode)}`);
    setShowShareTooltip(value => !value);
  };

  const showCopyMessage = (message: string) => {
    setCopyMessage(message);
    window.setTimeout(() => setCopyMessage(''), 3000);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showCopyMessage('Share link copied to clipboard!');
    } catch {
      showCopyMessage('Failed to copy');
    }
  };

  const buildIcsUrl = () => {
    const params = new URLSearchParams();
    params.set('timetables', serializeTimetables(entries.map(toSelection)));
    return `/api/timetable.ics?${params.toString()}`;
  };

  const handleDownloadIcs = () => {
    const link = document.createElement('a');
    link.href = `${buildIcsUrl()}&download=1`;
    link.download = 'feri-timetables.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyIcsUrl = async () => {
    const url = `${window.location.origin}${buildIcsUrl()}`;
    try {
      await navigator.clipboard.writeText(url);
      showCopyMessage('Subscription URL copied to clipboard!');
    } catch {
      showCopyMessage('Failed to copy');
    }
  };

  const subscriptionUrl = typeof window === 'undefined' ? '' : `${window.location.origin}${buildIcsUrl()}`;

  useEffect(() => {
    if (searchParams.get('timetables') || searchParams.get('groups') || !window.bootstrap) return;
    const timer = window.setTimeout(() => {
      const modalElement = document.getElementById('groupsModal');
      if (modalElement) new window.bootstrap.Modal(modalElement).show();
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet" />
      <div className="container-fluid mt-4">
        <div className="row">
          <div className="col-12">
            <div className="card mb-3">
              <div className="card-body py-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
                  <a href="/" className="text-decoration-none"><h5 className="mb-0 hover-primary">FERI Timetable++</h5></a>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <label className="small text-muted" htmlFor="timetable-color-mode">Event colors:</label>
                    <select
                      id="timetable-color-mode"
                      className="form-select form-select-sm w-auto"
                      value={colorMode}
                      onChange={event => handleColorModeChange(event.target.value as 'course' | 'timetable')}
                    >
                      <option value="course">Course colors</option>
                      <option value="timetable">Timetable colors</option>
                    </select>
                    <ThemeToggle />
                    {entries.length > 1 && <button
                      className="btn btn-sm btn-outline-info"
                      type="button"
                      aria-pressed={showCommonFreeTime && canShowCommonFreeTime}
                      disabled={!canShowCommonFreeTime}
                      onClick={() => setShowCommonFreeTime(value => !value)}
                    >Highlight free time</button>}
                    <button className="btn btn-sm btn-outline-info" type="button" onClick={handleShare} title="Share current selection">
                      <i className="bi bi-share"></i>{' '}<span className="d-none d-sm-inline">Share</span>
                    </button>
                    <div className="btn-group" role="group" aria-label="Calendar export">
                      <button className="btn btn-sm btn-success" type="button" onClick={handleDownloadIcs} title="Download a one-time calendar snapshot">
                        <i className="bi bi-download"></i>{' '}Download ICS
                      </button>
                      <button className="btn btn-sm btn-outline-success" type="button" onClick={() => setShowSubscription(value => !value)} aria-expanded={showSubscription} aria-controls="calendar-subscription">
                        <i className="bi bi-calendar-plus"></i>{' '}Subscribe to calendar
                      </button>
                    </div>
                  </div>
                  {showSubscription && <div id="calendar-subscription" className="w-100 border rounded p-3">
                    <label className="form-label small fw-bold" htmlFor="calendar-subscription-url">Subscription URL</label>
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <input id="calendar-subscription-url" className="form-control form-control-sm flex-grow-1" style={{ minWidth: '200px', flexBasis: 0 }} value={subscriptionUrl} readOnly onFocus={event => event.target.select()} />
                      <button className="btn btn-sm btn-outline-success" type="button" onClick={handleCopyIcsUrl}>Copy subscription URL</button>
                      <a className="btn btn-sm btn-outline-secondary" href={subscriptionUrl.replace(/^https?:/, 'webcal:')}>Open in calendar app</a>
                    </div>
                    <p className="small text-muted mt-2 mb-1">Add this URL as a subscription, not a file import. Google Calendar: Other calendars → From URL. Apple Calendar: New Calendar Subscription.</p>
                    <p className="small text-muted mb-1">For Google Calendar, use a publicly reachable website URL, not localhost.</p>
                    <p className="small text-muted mb-0">Downloaded files do not update. Subscriptions refresh on your calendar app’s schedule; timetable data is cached for 30 minutes. Links keep the programs and groups selected when copied, so copy a new link after changing your selection.</p>
                  </div>}
                  {showShareTooltip && (
                    <div className="w-100">
                      <div className="d-flex align-items-center gap-2">
                        <small className="text-muted fw-bold">Share:</small>
                        <input className="form-control form-control-sm" value={shareUrl} readOnly onFocus={event => event.target.select()} />
                        <button className="btn btn-sm btn-outline-success" onClick={handleCopyUrl} title="Copy to clipboard"><i className="bi bi-clipboard"></i></button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowShareTooltip(false)} title="Close"><i className="bi bi-x"></i></button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="row g-2">
                  {entries.map((entry, index) => {
                    return (
                      <div className="col-12" key={entry.id}>
                        <div className="border rounded p-2">
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <span className="badge rounded-pill" style={{ backgroundColor: entry.color, color: '#fff' }}>{index + 1}</span>
                            <input
                              className="form-control form-control-sm"
                              style={{ width: '150px' }}
                              aria-label={`Timetable ${index + 1} name`}
                              placeholder={getLabel(entry)}
                              value={entry.label}
                              onChange={event => updateEntry(entry.id, { label: event.target.value })}
                            />
                            <TimetableControls
                              programmes={programmes}
                              currentProgrammeId={entry.programmeId}
                              currentYear={entry.year}
                              timetableId={entry.id}
                              timetableLabel={getLabel(entry)}
                              onProgrammeChange={programmeId => handleProgrammeChange(entry, programmeId)}
                              onYearChange={year => handleYearChange(entry, year)}
                            />
                            <span className="small text-muted">Color</span>
                            <div className="dropdown">
                              <button
                                id={`timetable-color-menu-${entry.id}`}
                                className="btn btn-sm btn-outline-secondary dropdown-toggle"
                                type="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                aria-label={`Choose ${getLabel(entry)} color`}
                              >
                                <span className="d-inline-block rounded align-middle" style={{ width: '20px', height: '20px', backgroundColor: entry.color }} aria-hidden="true" />
                              </button>
                              <div className="dropdown-menu p-3" aria-labelledby={`timetable-color-menu-${entry.id}`}>
                                <div className="d-grid gap-2 mb-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }} role="group" aria-label="Quick colors">
                                  {COLOR_PRESETS.map(([name, color]) => (
                                    <button
                                      key={color}
                                      className="dropdown-item rounded border p-0"
                                      type="button"
                                      title={name}
                                      aria-label={`${name} color for ${getLabel(entry)}`}
                                      aria-pressed={entry.color.toLowerCase() === color}
                                      style={{
                                        height: '40px', backgroundColor: color,
                                        outline: entry.color.toLowerCase() === color ? '2px solid var(--bs-body-color)' : undefined,
                                        outlineOffset: '2px',
                                      }}
                                      onClick={() => updateEntry(entry.id, { color })}
                                    />
                                  ))}
                                </div>
                                <label className="small text-muted" htmlFor={`timetable-color-${entry.id}`}>Custom color</label>
                                <input
                                  id={`timetable-color-${entry.id}`}
                                  className="form-control form-control-color form-control-sm w-100"
                                  type="color"
                                  aria-label={`${getLabel(entry)} color`}
                                  value={entry.color}
                                  onChange={event => updateEntry(entry.id, { color: event.target.value })}
                                />
                              </div>
                            </div>
                            <button
                              className="btn btn-sm btn-outline-primary"
                              type="button"
                              data-bs-toggle="modal"
                              data-bs-target="#groupsModal"
                              disabled={entry.isUpdating || Boolean(entry.error)}
                              onClick={() => setActiveEntryId(entry.id)}
                            ><i className="bi bi-pencil"></i>{' '}Edit groups</button>
                            <McpConnectionModal
                              programmeId={entry.programmeId}
                              year={entry.year}
                              branches={entry.branches}
                              selectedGroups={entry.selectedGroups}
                            />
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              type="button"
                              aria-label={`${hiddenEntryIds.includes(entry.id) ? 'Show' : 'Hide'} ${getLabel(entry)}`}
                              onClick={() => setHiddenEntryIds(current => current.includes(entry.id)
                                ? current.filter(id => id !== entry.id) : [...current, entry.id])}
                            ><i className={`bi bi-eye${hiddenEntryIds.includes(entry.id) ? '-slash' : ''}`} aria-hidden="true" />{' '}{hiddenEntryIds.includes(entry.id) ? 'Show' : 'Hide'}</button>
                            {entries.length > 1 && <button className="btn btn-sm btn-outline-danger" type="button" aria-label={`Remove ${getLabel(entry)}`} onClick={() => removeTimetable(entry.id)}><i className="bi bi-trash"></i></button>}
                            {entry.isUpdating && <span className="small text-muted">Loading…</span>}
                            {entry.error && <>
                              <span className="small text-danger" role="alert">{entry.error}</span>
                              <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => void refreshEntry(entry, entry.selectedGroups)}>Retry</button>
                            </>}
                          </div>
                          <div className="d-flex align-items-center gap-2 flex-wrap mt-2" role="group" aria-label={`Groups for ${getLabel(entry)}`}>
                            <small className="text-muted fw-bold">Groups for {getLabel(entry)}:</small>
                            <SelectedGroupsBadges selectedGroups={entry.selectedGroups} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="col-12 d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <button className="btn btn-sm btn-outline-success" type="button" onClick={addTimetable} disabled={entries.length >= 4}>
                      <i className="bi bi-plus-lg"></i>{' '}Add timetable ({entries.length}/4)
                    </button>
                  </div>
                </div>

                {copyMessage && <div className="alert alert-success py-2 mt-3 mb-0" role="status">{copyMessage}</div>}
                {hiddenEntryIds.some(id => entries.some(entry => entry.id === id)) && <p className="small text-muted mt-2 mb-0">Hidden timetables keep their groups and colors and are still included in exports and subscriptions.</p>}
                {entries.length > 1 && showCommonFreeTime && <p className="small text-muted mt-2 mb-0" role="status">
                  {canShowCommonFreeTime
                    ? 'Free time is highlighted in week/day views, Monday–Friday, 07:00–21:00, based on the visible timetables.'
                    : 'Free time highlighting is unavailable while no timetables are visible, or a visible timetable is loading or has an error.'}
                </p>}
              </div>
            </div>

            <div className="card position-relative">
              {entries.some(entry => entry.isUpdating) && (
                <div className="position-absolute top-0 start-0 m-3" style={{ zIndex: 1000 }}>
                  <div className="d-flex align-items-center gap-2 bg-white rounded shadow-sm px-3 py-2">
                    <div className="spinner-border spinner-border-sm text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
                    <small className="text-muted">Updating…</small>
                  </div>
                </div>
              )}
              <div className="card-body p-0"><TimetableCalendar events={allEvents} showCommonFreeTime={showCommonFreeTime && canShowCommonFreeTime} /></div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
      {activeEntry && (
        <GroupSelectionModal
          courses={activeEntry.courses}
          courseGroups={activeEntry.courseGroups}
          selectedGroups={activeEntry.selectedGroups}
          onGroupsChange={handleGroupsChange}
          programmeId={activeEntry.programmeId}
          year={activeEntry.year}
          branches={activeEntry.branches}
          timetableLabel={getLabel(activeEntry)}
        />
      )}
    </>
  );
}
