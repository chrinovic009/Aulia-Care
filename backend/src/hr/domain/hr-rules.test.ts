import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, leaveEntitlement, lateMinutes, monthPeriod, netOf, payrollDueDate, payrollState, plannedWindows, proposePayroll, workingDaysBetween, DEFAULT_HR_RULES } from './hr-rules';

test('lateness is shown in hours and minutes beyond 60 minutes', () => {
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(226), '3 h 46 min');
});

test('a month and its pay date follow the clinic time', () => {
  const period = monthPeriod('2026-11', 'Africa/Lubumbashi');
  assert.equal(period.start.toISOString(), '2026-10-31T22:00:00.000Z');
  assert.equal(period.end.toISOString(), '2026-11-30T22:00:00.000Z');
  assert.equal(payrollDueDate(2026, 12, 5, 'Africa/Lubumbashi').toISOString(), '2027-01-05T21:59:00.000Z');
  assert.equal(payrollDueDate(2026, 1, 31, 'Africa/Lubumbashi').toISOString().slice(0, 10), '2026-02-28');
});

test('leave counts working days, Sundays excluded', () => {
  assert.equal(workingDaysBetween('2026-11-23', '2026-11-29'), 6);
  assert.equal(workingDaysBetween('2026-11-29', '2026-11-29'), 0);
  assert.throws(() => workingDaysBetween('2026-11-24', '2026-11-23'));
});

test('paid leave is acquired per complete month, with a seniority bonus', () => {
  const rules = { leaveDaysPerMonth: 1, seniorityBonusYears: 5 };
  assert.equal(leaveEntitlement({ hireDate: new Date('2026-03-10'), asOf: new Date('2026-11-23'), year: 2026, rules }).acquired, 8);
  const senior = leaveEntitlement({ hireDate: new Date('2015-01-01'), asOf: new Date('2027-01-01'), year: 2026, rules });
  assert.equal(senior.months, 12);
  assert.equal(senior.acquired, 14);
});

test('the proposed payroll deducts lateness, absences and unpaid leave, never below zero', () => {
  const rules = { monthlyWorkingHours: 200, workingDaysPerMonth: 25 };
  const proposal = proposePayroll({ monthlySalary: 1000, daysInMonth: 30, coveredDays: 30, lateMinutes: 226, absentDays: 2, unpaidLeaveDays: 1, rules });
  assert.equal(proposal.gross, 1000);
  assert.deepEqual(proposal.lines.map((line) => [line.kind, line.amount]), [['LATE', -18.83], ['ABSENCE', -80], ['UNPAID_LEAVE', -40]]);
  assert.match(proposal.lines[0].label, /3 h 46 min/);
  assert.equal(proposal.net, 861.17);
  const partial = proposePayroll({ monthlySalary: 900, daysInMonth: 30, coveredDays: 10, lateMinutes: 0, absentDays: 40, unpaidLeaveDays: 0, rules });
  assert.equal(partial.gross, 300);
  assert.equal(partial.net, 0);
  assert.equal(netOf(500, [{ amount: -20 }, { amount: 50 }]), 530);
});

test('an unpaid payroll past its pay date is late', () => {
  const now = new Date('2026-12-10T00:00:00Z');
  assert.equal(payrollState({ status: 'DRAFT', dueDate: new Date('2026-12-05T21:59:00Z') }, now), 'LATE');
  assert.equal(payrollState({ status: 'DRAFT', dueDate: new Date('2026-12-15T21:59:00Z') }, now), 'TO_PAY');
  assert.equal(payrollState({ status: 'PAID', dueDate: new Date('2026-12-05T21:59:00Z') }, now), 'PAID');
});

test('planned shifts follow the permanent day and the 3/3/3 rotation', () => {
  const clinic = { timezone: 'Africa/Lubumbashi', dayShiftStart: '07:30', dayShiftEnd: '17:30', nightShiftStart: '17:30', nightShiftEnd: '07:30' };
  const week = { from: new Date('2026-11-22T22:00:00Z'), to: new Date('2026-11-29T22:00:00Z') }; // Mon 23 → Sun 29
  const permanent = plannedWindows({ shiftPattern: 'PERMANENT_DAY', rotationAnchorAt: null, rotationDays: 3, permanentShiftEndTime: '16:00' }, clinic, DEFAULT_HR_RULES.workWeekDays, week.from, week.to);
  assert.equal(permanent.length, 6);
  assert.equal(permanent[0].startAt.toISOString(), '2026-11-23T05:30:00.000Z');
  assert.equal(permanent[0].endAt.toISOString(), '2026-11-23T14:00:00.000Z');
  const rotation = plannedWindows({ shiftPattern: 'THREE_DAY_THREE_NIGHT_THREE_REST', rotationAnchorAt: new Date('2026-11-23T08:00:00Z'), rotationDays: 3, permanentShiftEndTime: null }, clinic, [], week.from, week.to);
  assert.deepEqual(rotation.map((w) => w.startAt.toISOString()), ['2026-11-23T05:30:00.000Z', '2026-11-24T05:30:00.000Z', '2026-11-25T05:30:00.000Z', '2026-11-26T15:30:00.000Z', '2026-11-27T15:30:00.000Z', '2026-11-28T15:30:00.000Z']);
  assert.equal(plannedWindows({ shiftPattern: 'MANUAL', rotationAnchorAt: null, rotationDays: 3, permanentShiftEndTime: null }, clinic, [1], week.from, week.to).length, 0);
});

test('lateness counts from the planned start once past the tolerance', () => {
  const start = new Date('2026-11-23T05:30:00Z');
  assert.equal(lateMinutes(start, new Date('2026-11-23T05:34:00Z'), 5), 0);
  assert.equal(lateMinutes(start, new Date('2026-11-23T09:16:00Z'), 5), 226);
  assert.equal(lateMinutes(null, new Date(), 5), 0);
});
