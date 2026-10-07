// Node 22.11: node --experimental-require-module scripts/check-timetable-ui.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://timetable.test/timetable?programme=rit&year=2&groups=saved',
  pretendToBeVisual: true,
});
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: typeof dom.window[name] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? dom.window[name].bind(dom.window) : dom.window[name] });
}
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
// jsdom has no layout; supply slot geometry so FullCalendar can position overlaps.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 560 });
HTMLElement.prototype.getBoundingClientRect = function () {
  const isSlot = this.matches('.fc-timegrid-slots tr');
  const top = isSlot ? this.rowIndex * 20 : 0;
  const height = isSlot ? 20 : 560;
  return { x: 0, y: top, left: 0, right: 1000, top, bottom: top + height, width: 1000, height, toJSON() {} };
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.bootstrap = require('bootstrap/dist/js/bootstrap.bundle.js');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return originalResolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, ...args);
};
for (const extension of ['.ts', '.tsx']) {
  Module._extensions[extension] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    });
    module._compile(result.outputText, filename);
  };
}
const originalLoad = Module._load;
let serverMocks;
Module._load = function (name, ...args) {
  if (name === 'next/navigation') return {
    usePathname: () => window.location.pathname,
    useSearchParams: () => new URLSearchParams(window.location.search),
  };
  if (serverMocks && name === './timetable-server') return serverMocks['@/lib/timetable-server'];
  if (serverMocks?.[name]) return name === '@/lib/timetable-utils'
    ? { ...originalLoad.call(this, name, ...args), ...serverMocks[name] }
    : serverMocks[name];
  return originalLoad.call(this, name, ...args);
};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { TimetableClient } = require('../src/components/TimetableClient.tsx');
const { ThemeProvider } = require('../src/components/ThemeProvider.tsx');
const { parseTimetablesParam } = require('../src/lib/timetable-selection.ts');
const programmes = [{ id: 'rit', name: 'RIT UN', year: '3' }, { id: 'ipt', name: 'IPT', year: '3' }];
const now = new Date();
now.setDate(now.getDate() - (now.getDay() + 6) % 7);
now.setHours(9, 0, 0, 0);
function dataFor(programme, year, groups) {
  const course = `${programme}-${year}`;
  const selected = groups?.[course];
  return {
    success: true,
    courseGroups: { [course]: ['G1', 'G2'] },
    events: ['G1', 'G2'].filter(group => !selected || selected.includes(group)).map(group => ({
      id: group, title: course, start: now.toISOString(), end: new Date(now.getTime() + 3600000).toISOString(),
      backgroundColor: '#663399', borderColor: '#663399', textColor: '#fff',
      extendedProps: { course, type: 'Lab', group, location: 'Room 1' },
    })),
  };
}
let failNextRequest = false;
globalThis.fetch = async input => {
  const params = new URL(input, window.location.origin).searchParams;
  const groups = params.has('groups') ? JSON.parse(Buffer.from(params.get('groups'), 'base64url').toString()) : undefined;
  if (failNextRequest) {
    failNextRequest = false;
    return { ok: false, json: async () => ({ success: false, error: 'Test backend failure' }) };
  }
  return { ok: true, json: async () => dataFor(params.get('programme'), params.get('year'), groups) };
};
const initialData = dataFor('rit', '2');
const initialTimetables = [{
  id: 'mine', programmeId: 'rit', year: '2', branches: 'all', label: 'Mine', color: '#198754',
  selectedGroups: { 'rit-2': ['G1', 'G2'] }, courses: ['rit-2'], courseGroups: initialData.courseGroups, events: initialData.events,
}];
const root = createRoot(document.getElementById('root'));
const originalLog = console.log;
console.log = () => {};
const buttons = () => [...document.querySelectorAll('button')];
const findButton = text => buttons().find(button => button.textContent.includes(text));
const selection = () => parseTimetablesParam(new URLSearchParams(window.location.search).get('timetables'));
async function click(button) {
  assert.ok(button, 'Expected button to exist');
  await act(async () => button.click());
}
async function change(select, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value').set.call(select, value);
    select.dispatchEvent(new window.Event('input', { bubbles: true }));
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

async function main() {
  await act(async () => root.render(React.createElement(ThemeProvider, null,
    React.createElement(TimetableClient, { programmes, initialTimetables, initialColorMode: 'course' }))));
  assert.ok(document.querySelector('.fc-timeGridWeek-view'), 'Real FullCalendar must render');
  const groupSummaries = () => [...document.querySelectorAll('[role="group"][aria-label^="Groups for "]')];
  assert.equal(groupSummaries().length, 1, 'A single timetable has its own group summary');
  assert.ok(![...document.querySelectorAll('button')].some(button => button.textContent === 'Highlight free time'), 'Free-time control is hidden for a single timetable');
  assert.ok(document.querySelector('.fc-timegrid-event-harness').style.cssText.includes('50%'), 'Two simultaneous blocks must share the day width without covering each other');
  // Plain HTTP exposes getRandomValues but not randomUUID.
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    getRandomValues: require('node:crypto').webcrypto.getRandomValues.bind(require('node:crypto').webcrypto),
  } });
  await click(findButton('Add timetable'));
  assert.ok(findButton('Highlight free time'), 'Free-time control appears when a second timetable is added');
  await click(findButton('Add timetable'));
  await click(findButton('Add timetable'));
  assert.equal(selection().length, 4);
  assert.equal(groupSummaries().length, 4, 'All four timetables show their groups, not only the active one');
  assert.ok(findButton('Add timetable').disabled, 'Maximum is four timetables');
  assert.equal(new Set(selection().map(entry => entry.color)).size, 4);

  const friendId = selection()[1].id;
  await change(document.getElementById(`programme-${friendId}`), 'ipt');
  const friendRow = document.getElementById(`programme-${friendId}`).closest('.border');
  await click([...friendRow.querySelectorAll('button')].find(button => button.textContent === '2'));
  assert.equal(selection()[0].programmeId, 'rit');
  assert.equal(selection()[0].year, '2');
  assert.equal(selection()[1].programmeId, 'ipt');
  assert.equal(selection()[1].year, '2');
  await click([...friendRow.querySelectorAll('button')].find(button => button.textContent.includes('Edit groups')));
  await click(document.querySelector('#groupsModal input[type="checkbox"]'));
  assert.deepEqual(selection()[1].selectedGroups, { 'ipt-2': ['G2'] });
  assert.deepEqual(selection()[0].selectedGroups, { 'rit-2': ['G1', 'G2'] });
  const mineRow = document.getElementById('programme-mine').closest('.border');
  assert.equal(mineRow.querySelector('[aria-label^="Groups for "] .badge').title, 'rit-2: G1, G2');
  assert.equal(friendRow.querySelector('[aria-label^="Groups for "] .badge').title, 'ipt-2: G2', 'Each summary shows only its own selected groups');
  await change(document.querySelector('[aria-label="Timetable 2 name"]'), 'Friend');
  assert.ok(friendRow.querySelector('[aria-label="Groups for Friend"]').textContent.includes('Groups for Friend:'));
  const colorMenuToggle = document.getElementById(`timetable-color-menu-${friendId}`);
  await click(colorMenuToggle);
  assert.equal(colorMenuToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(friendRow.querySelectorAll('[aria-label="Quick colors"] button').length, 9);
  const purple = friendRow.querySelector('[aria-label="Purple color for Friend"]');
  await click(purple);
  assert.equal(selection()[1].color, '#6f42c1', 'Quick pick updates the selected timetable and its share URL');
  assert.equal(selection()[0].color, '#198754', 'Other timetable colors are unchanged');
  assert.equal(purple.getAttribute('aria-pressed'), 'true');
  assert.equal(colorMenuToggle.getAttribute('aria-expanded'), 'false', 'Picking a preset closes the menu');
  assert.equal([...document.querySelectorAll('.fc-event')].find(event => event.textContent.includes('ipt-2')).style.backgroundColor, 'rgb(111, 66, 193)');
  await click(colorMenuToggle);
  await act(async () => colorMenuToggle.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(colorMenuToggle.getAttribute('aria-expanded'), 'false', 'Escape dismisses the color menu');
  await change(document.getElementById(`timetable-color-${friendId}`), '#ff0000');
  assert.equal(selection()[1].color, '#ff0000');
  assert.equal(selection()[0].color, '#198754');
  assert.equal(document.querySelector('.fc-event-timetable'), null, 'Programme names must not fill event blocks');
  const friendEvents = [...document.querySelectorAll('.fc-event')].filter(event => event.textContent.includes('ipt-2'));
  assert.equal(friendEvents.length, 1, 'Only the independently selected friend group is rendered');
  assert.equal(friendEvents[0].style.backgroundColor, 'rgb(255, 0, 0)');

  await change(document.getElementById('timetable-color-mode'), 'course');
  const savedCourseUrl = window.location.href;
  await change(document.getElementById('timetable-color-mode'), 'timetable');
  await act(async () => {
    window.history.replaceState(null, '', savedCourseUrl);
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  });
  assert.equal(document.getElementById('timetable-color-mode').value, 'course', 'Back/forward must restore course color mode');
  assert.equal(document.querySelector('.fc-event').style.backgroundColor, 'rgb(102, 51, 153)');
  await click(document.querySelector('[title="Share current selection"]'));
  const sharedUrl = new URL(document.querySelector('input[readonly]').value);
  assert.equal(sharedUrl.searchParams.get('colorMode'), 'course');
  assert.deepEqual(parseTimetablesParam(sharedUrl.searchParams.get('timetables'))[1].selectedGroups, { 'ipt-2': ['G2'] });
  let copiedUrl;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { copiedUrl = value; } } });
  await click(findButton('Subscribe to calendar'));
  assert.ok(document.getElementById('calendar-subscription').textContent.includes('not a file import'));
  await click(findButton('Copy subscription URL'));
  assert.equal(parseTimetablesParam(new URL(copiedUrl).searchParams.get('timetables')).length, 4);
  assert.equal(new URL(copiedUrl).searchParams.has('download'), false);
  assert.equal(document.getElementById('calendar-subscription-url').value, copiedUrl);
  assert.ok([...document.querySelectorAll('a')].find(link => link.textContent === 'Open in calendar app').href.startsWith('webcal:'));
  const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
  let downloadedUrl;
  window.HTMLAnchorElement.prototype.click = function () { downloadedUrl = this.href; };
  try { await click(findButton('Download ICS')); } finally { window.HTMLAnchorElement.prototype.click = originalAnchorClick; }
  assert.equal(new URL(downloadedUrl).searchParams.get('download'), '1');

  const savedSelection = selection();
  await click(document.querySelector('[aria-label="Hide Friend"]'));
  assert.ok(![...document.querySelectorAll('.fc-timegrid-event')].some(event => event.textContent.includes('ipt-2')));
  assert.deepEqual(selection(), savedSelection, 'Hiding keeps programmes, groups, colors, and shared URLs');
  assert.equal(friendRow.querySelector('[aria-label^="Groups for "] .badge').title, 'ipt-2: G2');
  await click(findButton('Copy subscription URL'));
  assert.equal(parseTimetablesParam(new URL(copiedUrl).searchParams.get('timetables')).length, 4, 'Subscriptions include temporarily hidden timetables');
  await click(document.querySelector('[aria-label="Show Friend"]'));
  assert.equal([...document.querySelectorAll('.fc-timegrid-event')].filter(event => event.textContent.includes('ipt-2')).length, 1);
  const foregroundCount = document.querySelectorAll('.fc-timegrid-event').length;
  await click(findButton('Highlight free time'));
  assert.equal(findButton('Highlight free time').getAttribute('aria-pressed'), 'true');
  assert.ok(document.querySelectorAll('.timetable-free-slot').length > 0, 'Shared free slots render as FullCalendar backgrounds');
  assert.equal(document.querySelectorAll('.fc-timegrid-event').length, foregroundCount, 'Availability does not add fake lecture blocks');
  const thisWeek = document.querySelector('.fc-timegrid-col[data-date]').getAttribute('data-date');
  await click(document.querySelector('.fc-next-button'));
  assert.notEqual(document.querySelector('.fc-timegrid-col[data-date]').getAttribute('data-date'), thisWeek);
  assert.equal(document.querySelectorAll('.timetable-free-slot').length, 5, 'An empty next week has one free interval per weekday');
  await click(document.querySelector('.fc-prev-button'));
  assert.equal(document.querySelectorAll('.fc-timegrid-event').length, foregroundCount);
  for (const entry of selection()) {
    await click(document.getElementById(`programme-${entry.id}`).closest('.border').querySelector('button[aria-label^="Hide "]'));
  }
  assert.ok(findButton('Highlight free time').disabled);
  assert.equal(document.querySelectorAll('.timetable-free-slot').length, 0, 'No visible timetables means no misleading free-time highlights');
  for (const entry of selection()) {
    await click(document.getElementById(`programme-${entry.id}`).closest('.border').querySelector('button[aria-label^="Show "]'));
  }
  assert.ok(document.querySelectorAll('.timetable-free-slot').length > 0);
  await click(findButton('Highlight free time'));
  assert.equal(document.querySelectorAll('.timetable-free-slot').length, 0);
  await click(document.querySelector('.fc-dayGridMonth-button'));
  assert.ok(document.querySelector('.fc-dayGridMonth-view'));
  await click(findButton('Highlight free time'));
  assert.ok(document.querySelector('.fc-timeGridWeek-view'), 'Enabling free time from month view switches to a time-grid view');
  assert.ok(document.querySelectorAll('.timetable-free-slot').length > 0);
  await click(findButton('Highlight free time'));

  failNextRequest = true;
  await change(document.getElementById(`programme-${friendId}`), 'rit');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('Test backend failure'));
  assert.ok(findButton('Highlight free time').disabled, 'A failed visible timetable must not look free');
  assert.equal(selection()[0].programmeId, 'rit');
  await click(findButton('Retry'));
  assert.equal(document.querySelector('[role="alert"]'), null);
  await click(document.querySelector('[aria-label="Remove Friend"]'));
  assert.equal(groupSummaries().length, 2);
  assert.equal(document.querySelector('[aria-label="Groups for Friend"]'), null, 'Removing a timetable removes its group summary');
  await click(findButton('Add timetable'));
  assert.equal(new Set(selection().map(entry => entry.color)).size, 3, 'Removing and readding must reuse an unused color');

  const sharedEntries = [initialTimetables[0], {
    ...initialTimetables[0], id: 'friend', programmeId: 'ipt', label: 'Friend', color: '#dc3545', selectedGroups: { 'ipt-2': ['G2'] },
  }];
  let failFriend = true;
  let lectureShift = 0;
  let cancelMineFirst = false;
  serverMocks = {
    '@/lib/timetable-server': { getProgrammes: async () => programmes },
    '@/lib/timetable-utils': { fetchTimetableData: async (programme, year) => {
      if (failFriend && programme === 'ipt') throw new Error('Failed loading timetables');
      return {
        allGroups: ['G1', 'G2'].map((name, index) => ({ id: index + 1, name, branchId: 'all' })),
        lectures: ['G1', 'G2'].map((name, index) => ({
          id: index + 1, course: `${programme}-${year}`, executionType: 'Lab',
          start_time: new Date(now.getTime() + lectureShift).toISOString(), end_time: new Date(now.getTime() + lectureShift + 3600000).toISOString(),
          groups: [{ name }], lecturers: [], rooms: [],
        })).filter(lecture => !(cancelMineFirst && programme === 'rit' && lecture.id === 1)),
      };
    } },
  };
  const { default: TimetablePage } = require('../src/app/timetable/page.tsx');
  const page = await TimetablePage({ searchParams: Promise.resolve({ timetables: JSON.stringify(sharedEntries), colorMode: 'course' }) });
  assert.equal(page.props.initialTimetables[0].events.length, 2, 'Healthy timetable survives another timetable failing on reload');
  assert.equal(page.props.initialTimetables[1].error, 'Failed loading timetables');
  assert.equal(page.props.initialColorMode, 'course');
  const { GET } = require('../src/app/api/timetable.ics/route.ts');
  const icsRequest = params => ({ nextUrl: new URL(`https://timetable.test/api/timetable.ics?${new URLSearchParams(params)}`) });
  const originalError = console.error;
  let failedExport;
  try {
    console.error = () => {};
    failedExport = await GET(icsRequest({ timetables: JSON.stringify(sharedEntries) }));
  } finally { console.error = originalError; }
  assert.equal(failedExport.status, 500, 'A backend failure must not return a partial export or a validation error');
  failFriend = false;
  const combinedExport = await GET(icsRequest({ timetables: JSON.stringify(sharedEntries) }));
  assert.equal(combinedExport.status, 200);
  assert.ok(combinedExport.headers.get('Content-Disposition').startsWith('inline'));
  assert.equal(combinedExport.headers.get('Cache-Control'), 'no-cache, max-age=0, must-revalidate');
  const ics = await combinedExport.text();
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(ics, /Timetable: Friend/);
  assert.match(ics, /Timetable: Mine/);
  const uidSet = text => [...text.replace(/\r\n[ \t]/g, '').matchAll(/UID:([^\r\n]+)/g)].map(match => match[1]).sort();
  lectureShift = 24 * 3600000;
  const movedFeed = await (await GET(icsRequest({ timetables: JSON.stringify(sharedEntries) }))).text();
  assert.deepEqual(uidSet(movedFeed), uidSet(ics), 'A subscription refresh recognizes rescheduled events by their stable UIDs');
  assert.notEqual(movedFeed.match(/DTSTART:[^\r\n]+/)[0], ics.match(/DTSTART:[^\r\n]+/)[0]);
  cancelMineFirst = true;
  const cancelledFeed = await (await GET(icsRequest({ timetables: JSON.stringify(sharedEntries) }))).text();
  assert.equal(uidSet(cancelledFeed).length, 2, 'The next snapshot removes a lecture deleted upstream');
  cancelMineFirst = false;
  lectureShift = 0;
  const downloadResponse = await GET(icsRequest({ timetables: JSON.stringify(sharedEntries), download: '1' }));
  assert.ok(downloadResponse.headers.get('Content-Disposition').startsWith('attachment'));
  assert.equal((await GET(icsRequest({ timetables: 'invalid' }))).status, 400);
  assert.equal((await GET(icsRequest({ programme: 'rit', year: '4' }))).status, 400);
  assert.equal((await GET(icsRequest({ programme: 'rit', year: '2' }))).status, 200, 'Legacy exports still work');
  const { buildCourseGroupMapping, filterLecturesByGroups, convertLecturesToEvents } = require('../src/lib/timetable-utils.ts');
  const transfer = {
    id: 'transfer', course: '', executionType: '', note: 'Prehod',
    start_time: now.toISOString(), end_time: new Date(now.getTime() + 3600000).toISOString(),
    groups: [{ name: 'G1' }], lecturers: [], rooms: [],
  };
  assert.deepEqual(buildCourseGroupMapping([transfer], [{ id: 1, name: 'G1', branchId: 'all' }]), {}, 'Breaks are not independent subjects');
  assert.equal(convertLecturesToEvents([transfer])[0].title, 'Prehod');
  assert.equal(convertLecturesToEvents([transfer])[0].extendedProps.course, 'Prehod');
  const subjects = [2, 3, 4].map(group => ({ ...transfer, id: `subject-${group}`, course: 'Programming', groups: [{ name: `R-IT 3 UN RV - ${group}. sk` }] }));
  const breaks = subjects.map(subject => ({ ...subject, id: `break-${subject.id}`, course: '', note: `Premor za prehod na daljavo - ${subject.groups[0].name}` }));
  const groups = { Programming: subjects.slice(0, 2).map(subject => subject.groups[0].name) };
  const filtered = filterLecturesByGroups([...subjects, ...breaks], {
    ...groups, [breaks[2].note]: [subjects[2].groups[0].name],
  });
  assert.deepEqual(filtered.map(lecture => lecture.id), [subjects[0].id, subjects[1].id, breaks[0].id, breaks[1].id], 'Only breaks for selected groups 2 and 3 are shown, even with an old selection for group 4');
  assert.equal(filterLecturesByGroups([...subjects, ...breaks], { Programming: [] }).length, 0);
  assert.deepEqual(filterLecturesByGroups([...subjects, ...breaks], { Programming: [subjects[2].groups[0].name] }).map(lecture => lecture.id), [subjects[2].id, breaks[2].id], 'Each timetable filters breaks independently');

  const sameLecture = initialData.events.slice(0, 1);
  await act(async () => root.render(React.createElement(ThemeProvider, null,
    React.createElement(TimetableClient, {
      programmes, initialTimetables: [
        { ...initialTimetables[0], events: sameLecture },
        { ...initialTimetables[0], id: 'friend', label: 'Friend', color: '#dc3545', events: sameLecture },
      ], initialColorMode: 'timetable',
    }))));
  assert.equal(document.querySelectorAll('.fc-timegrid-event').length, 1, 'A shared lecture renders only once');
  const indicator = document.querySelector('.fc-event-owner-stripes');
  assert.equal(indicator.children.length, 0, 'One gradient replaces independently rendered color strips');
  assert.equal(indicator.style.backgroundImage, 'linear-gradient(rgb(25, 135, 84) 0% 50%, rgb(220, 53, 69) 50% 100%)');
  assert.equal(indicator.getAttribute('aria-label'), 'Mine, Friend');
  // Isolate CSS checks: jsdom cannot cascade FullCalendar's variable-based border shorthands.
  const styledDom = new JSDOM(`<html data-bs-theme="dark"><head></head><body>${document.querySelector('.fc-timegrid-event').outerHTML}</body></html>`);
  const calendarStyles = styledDom.window.document.createElement('style');
  calendarStyles.textContent = fs.readFileSync(path.join(__dirname, '../src/app/globals.css'), 'utf8');
  styledDom.window.document.head.appendChild(calendarStyles);
  const indicatorStyle = styledDom.window.getComputedStyle(styledDom.window.document.querySelector('.fc-event-owner-stripes'));
  assert.equal(indicatorStyle.width, '8px', 'The existing indicator width is preserved');
  const darkStyles = styledDom.window.getComputedStyle(styledDom.window.document.documentElement);
  assert.equal(darkStyles.getPropertyValue('--timetable-shared-bg').trim(), '#3B4249');
  assert.equal(darkStyles.getPropertyValue('--timetable-shared-border').trim(), '#59636D');
  assert.equal(darkStyles.getPropertyValue('--timetable-shared-text').trim(), '#F1F3F5');
  assert.equal(darkStyles.getPropertyValue('--timetable-shared-secondary').trim(), '#C1C7CD');
  assert.equal(document.querySelector('.fc-timegrid-event').style.backgroundColor, 'var(--timetable-shared-bg, var(--bs-tertiary-bg))');
  assert.equal(styledDom.window.getComputedStyle(styledDom.window.document.querySelector('.fc-event-shared .fc-event-location')).opacity, '1');
  styledDom.window.close();
  await click(document.querySelector('.fc-timegrid-event'));
  assert.ok(document.getElementById('eventModal').textContent.includes('Mine'));
  assert.ok(document.getElementById('eventModal').textContent.includes('Friend'));
  await act(async () => root.render(React.createElement(ThemeProvider, null,
    React.createElement(TimetableClient, {
      programmes, initialTimetables: [
        { ...initialTimetables[0], events: sameLecture },
        { ...initialTimetables[0], id: 'friend', label: 'Friend', color: '#dc3545', events: sameLecture },
        { ...initialTimetables[0], id: 'third', label: 'Third', color: '#0d6efd', events: sameLecture },
      ], initialColorMode: 'timetable',
    }))));
  assert.equal(document.querySelectorAll('.fc-timegrid-event').length, 1);
  const threeOwnerIndicator = document.querySelector('.fc-event-owner-stripes');
  assert.equal(threeOwnerIndicator.style.backgroundImage, 'linear-gradient(rgb(25, 135, 84) 0% 33.333333333333336%, rgb(220, 53, 69) 33.333333333333336% 66.66666666666667%, rgb(13, 110, 253) 66.66666666666667% 100%)');
  assert.equal(threeOwnerIndicator.getAttribute('aria-label'), 'Mine, Friend, Third');
  assert.equal(document.querySelector('[aria-label="Timetable 1 name"]').value, 'Mine');
  await act(async () => root.render(React.createElement(ThemeProvider, null,
    React.createElement(TimetableClient, {
      programmes, initialTimetables: [
        { ...initialTimetables[0], color: '#808080', events: sameLecture },
        { ...initialTimetables[0], id: 'friend', label: 'Friend', color: '#ffff00', events: sameLecture },
      ], initialColorMode: 'timetable',
    }))));
  assert.equal(document.querySelector('.fc-event-owner-stripes').style.backgroundImage, 'linear-gradient(rgb(128, 128, 128) 0% 50%, rgb(255, 255, 0) 50% 100%)', 'Custom colors retain timetable order, regardless of intensity');
  function block(id, startHour, endHour, title) {
    const start = new Date(now);
    start.setHours(startHour);
    const end = new Date(now);
    end.setHours(endHour);
    return { ...sameLecture[0], id, title, start: start.toISOString(), end: end.toISOString(), extendedProps: { ...sameLecture[0].extendedProps, course: title } };
  }
  const morningBreak = block('morning-break', 8, 9, 'Premor za prehod na daljavo');
  const middayBreak = block('midday-break', 12, 13, 'Premor za prehod na daljavo');
  await act(async () => root.render(React.createElement(ThemeProvider, null,
    React.createElement(TimetableClient, {
      programmes, initialTimetables: [
        { ...initialTimetables[0], events: [morningBreak, block('remote', 9, 12, 'Remote class'), middayBreak] },
        { ...initialTimetables[0], id: 'friend', label: 'Friend', color: '#dc3545', events: [block('early', 7, 10, 'Early class'), morningBreak, block('late', 12, 15, 'Late class'), middayBreak] },
      ], initialColorMode: 'timetable',
    }))));
  const widths = () => [...document.querySelectorAll('.fc-timegrid-event-harness')].map(event =>
    100 - parseFloat(event.style.left) - parseFloat(event.style.right));
  assert.equal(widths().length, 5, 'Screenshot schedule contains five distinct blocks, not seven');
  assert.ok(widths().every(width => width === 50), 'Removing duplicate breaks gives both overlapping columns equal width');
  const individualEvents = [...document.querySelectorAll('.fc-timegrid-event')].filter(event => !event.querySelector('.fc-event-shared'));
  assert.deepEqual(new Set(individualEvents.map(event => event.style.backgroundColor)), new Set(['rgb(25, 135, 84)', 'rgb(220, 53, 69)']), 'Individual green/red styling is unchanged');
  await click(findButton('Highlight free time'));
  assert.ok(document.querySelector('.timetable-free-slot').textContent.includes('Free time'));
  await click(document.querySelector('[aria-label="Remove Friend"]'));
  assert.ok(![...document.querySelectorAll('button')].some(button => button.textContent === 'Highlight free time'), 'Removing the second timetable hides the control');
  assert.equal(document.querySelectorAll('.timetable-free-slot').length, 0, 'Returning to one timetable removes active free-time highlights');
  assert.ok(!document.getElementById('root').textContent.includes('Free time is highlighted'), 'Single-timetable mode hides the free-time helper text');
  const { TimetableCalendar } = require('../src/components/TimetableCalendar.tsx');
  const overlapping = [0, 1, 2].map(id => ({ ...initialData.events[0], id: String(id) }));
  await act(async () => root.render(React.createElement(ThemeProvider, null,
    React.createElement(TimetableCalendar, { events: overlapping }))));
  assert.equal(widths().length, 3);
  assert.ok(widths().every(width => Math.abs(width - 100 / 3) < 0.001), 'Three simultaneous blocks each get one third');
  await act(async () => root.render(React.createElement(ThemeProvider, null,
    React.createElement(TimetableCalendar, { events: overlapping.slice(0, 1) }))));
  assert.deepEqual(widths(), [100], 'A single block still fills the day width');
  await act(async () => root.unmount());
  console.log = originalLog;
  originalLog('Timetable checks passed: real calendar, three independent timetables, groups/colors, URL history, retries, partial failures, and combined/legacy ICS exports.');
  dom.window.close();
}
main().catch(async error => {
  await act(async () => root.unmount());
  console.log = originalLog;
  console.error(error);
  dom.window.close();
  process.exitCode = 1;
});
