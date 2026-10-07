import assert from 'node:assert/strict';
import {
  decorateTimetableEvents,
  mergeTimetableEvents,
  getCommonFreeSlots,
  parseTimetablesParam,
  serializeTimetables,
  validateTimetableSelections,
} from '../src/lib/timetable-selection.ts';
import { generateICS } from '../src/lib/timetable-ics.ts';

const mine = {
  id: 'mine', programmeId: 'RIT-UN', year: '2', branches: 'all',
  selectedGroups: { Mathematics: ['A'], Programming: ['B'] },
  label: 'Mine', color: '#198754',
};
const friend = {
  id: 'friend', programmeId: 'RIT-UN', year: '2', branches: 'all',
  selectedGroups: { Mathematics: ['C'], Programming: ['D'] },
  label: 'Friend', color: '#dc3545',
};

const params = new URLSearchParams();
params.set('timetables', serializeTimetables([mine, friend]));
assert.deepEqual(parseTimetablesParam(params.get('timetables')), [mine, friend]);
assert.notDeepEqual(
  parseTimetablesParam(params.get('timetables'))[0].selectedGroups,
  parseTimetablesParam(params.get('timetables'))[1].selectedGroups,
);
assert.throws(() => parseTimetablesParam('not-json'));
assert.throws(() => parseTimetablesParam(serializeTimetables([mine, friend, { ...friend, id: 'third' }, { ...friend, id: 'fourth' }])));
assert.throws(() => parseTimetablesParam(JSON.stringify([{ ...mine, color: 'red' }])));
assert.throws(() => validateTimetableSelections([mine], [{ id: 'RIT-UN', name: 'RIT UN', year: '1' }]));

const event = {
  id: 'course-1', title: 'Programming', start: '2026-10-07T08:00:00', end: '2026-10-07T10:00:00',
  backgroundColor: '#123456', borderColor: '#123456', textColor: '#ffffff',
  extendedProps: { course: 'Programming', type: 'Lecture', group: 'A' },
};
const mineEvent = decorateTimetableEvents([event], mine, 'Mine', 'timetable')[0];
const friendEvent = decorateTimetableEvents([event], friend, 'Friend', 'timetable')[0];
assert.notEqual(mineEvent.id, friendEvent.id);
assert.equal(mineEvent.backgroundColor, mine.color);
assert.equal(friendEvent.backgroundColor, friend.color);
assert.equal(mineEvent.extendedProps.timetableLabel, 'Mine');
assert.equal(decorateTimetableEvents([event], mine, 'Mine', 'course')[0].backgroundColor, event.backgroundColor);

const shared = mergeTimetableEvents([mineEvent, friendEvent], 'timetable');
assert.equal(shared.length, 1, 'The same lecture in two timetables is one block');
assert.deepEqual(shared[0].extendedProps.timetables.map(owner => owner.label), ['Mine', 'Friend']);
assert.equal(mineEvent.extendedProps.timetables.length, 1, 'Merging must not mutate source events');
assert.equal(mergeTimetableEvents([mineEvent, friendEvent, friendEvent], 'timetable')[0].extendedProps.timetables.length, 2);
const third = decorateTimetableEvents([event], { ...friend, id: 'third', color: '#0d6efd' }, 'Third', 'timetable')[0];
assert.equal(mergeTimetableEvents([mineEvent, friendEvent, third], 'timetable')[0].extendedProps.timetables.length, 3);
for (const field of ['type', 'group', 'location', 'persons']) {
  const different = { ...friendEvent, extendedProps: { ...friendEvent.extendedProps, [field]: 'Different' } };
  assert.equal(mergeTimetableEvents([mineEvent, different], 'timetable').length, 2, `Different ${field} must stay separate`);
}
assert.equal(mergeTimetableEvents([mineEvent, { ...friendEvent, end: '2026-10-07T11:00:00' }], 'timetable').length, 2);
assert.equal(mergeTimetableEvents([
  decorateTimetableEvents([event], mine, 'Mine', 'course')[0],
  decorateTimetableEvents([event], friend, 'Friend', 'course')[0],
], 'course')[0].backgroundColor, event.backgroundColor);

const lecture = {
  id: 10,
  start_time: '2026-10-07T08:00:00Z',
  end_time: '2026-10-07T09:00:00Z',
  course: 'Programming',
  executionType: 'Lecture',
  groups: [{ name: 'A' }],
  lecturers: [],
  rooms: [],
};
const ics = generateICS([
  { selection: mine, label: 'Mine', lectures: [lecture] },
  { selection: friend, label: 'Friend', lectures: [lecture] },
]);
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
assert.match(ics, /DESCRIPTION:Timetable: Mine\\nGroups: A/);
assert.match(ics, /DESCRIPTION:Timetable: Friend\\nGroups: A/);
assert.equal(new Set([...ics.matchAll(/UID:([^\r\n]+)/g)].map(match => match[1])).size, 2);
assert.match(generateICS([{ selection: mine, label: 'Mine', lectures: [{ ...lecture, course: ' ', executionType: '', note: 'Prehod' }] }]), /SUMMARY:Prehod/);

const exportOne = (data = lecture, selection = mine) => generateICS([{ selection, label: 'Mine', lectures: [data] }]);
const uidOf = text => text.replace(/\r\n[ \t]/g, '').match(/UID:([^\r\n]+)/)[1];
const moved = exportOne({ ...lecture, start_time: '2026-10-08T08:00:00Z', end_time: '2026-10-08T09:00:00Z', rooms: [{ name: 'New room' }] });
assert.equal(uidOf(moved), uidOf(exportOne()), 'Moving a lecture and changing its room preserves event identity');
assert.match(moved, /DTSTART:20261008T080000Z/);
assert.notEqual(uidOf(exportOne()), uidOf(exportOne(lecture, { ...mine, programmeId: 'IPT' })), 'Programmes namespace backend event IDs');
assert.notEqual(uidOf(exportOne()), uidOf(exportOne({ ...lecture, id: 11 })), 'Distinct occurrences keep distinct UIDs');
assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT30M/);
assert.ok(!generateICS([{ selection: mine, label: 'Mine', lectures: [] }]).includes('BEGIN:VEVENT'), 'A removed lecture disappears from the next full feed');
const longTitle = 'Računalništvo 😀 '.repeat(20);
const unicodeExport = exportOne({ ...lecture, course: longTitle });
assert.ok(unicodeExport.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75), 'Fold ICS lines by UTF-8 octets');
assert.ok(unicodeExport.replace(/\r\n[ \t]/g, '').includes(longTitle.trim()), 'Folding preserves Unicode titles');

const monday = new Date(2026, 9, 12);
const tuesday = new Date(2026, 9, 13);
const at = (hour, minute = 0) => new Date(2026, 9, 12, hour, minute).toISOString();
const busy = (start, end) => ({ ...event, start, end });
assert.deepEqual(getCommonFreeSlots([
  busy(at(8), at(10)), busy(at(9), at(12)), busy(at(12), at(13)), busy(at(15), at(16)),
], monday, tuesday), [
  { start: at(7), end: at(8) }, { start: at(13), end: at(15) }, { start: at(16), end: at(21) },
], 'Free time is the complement of all busy intervals, including overlaps and touching events');
assert.deepEqual(getCommonFreeSlots([busy(at(0), at(23))], monday, tuesday), [], 'Fully booked days have no free slots');
assert.deepEqual(getCommonFreeSlots([], monday, tuesday), [{ start: at(7), end: at(21) }]);
assert.deepEqual(getCommonFreeSlots([], new Date(2026, 9, 10), monday), [], 'Weekend days are excluded');
assert.deepEqual(getCommonFreeSlots([busy(new Date(2026, 9, 11, 22).toISOString(), at(9))], monday, tuesday), [{ start: at(9), end: at(21) }], 'Overnight events block the next morning');
assert.deepEqual(getCommonFreeSlots([busy('bad date', at(9))], monday, tuesday), [], 'Invalid busy data must not advertise availability');
assert.deepEqual(getCommonFreeSlots([busy(at(10), at(11))], new Date(at(9)), new Date(at(12))), [
  { start: at(9), end: at(10) }, { start: at(11), end: at(12) },
], 'Free slots stay within the requested view range');

process.stdout.write('Timetable selection checks passed.\n');
