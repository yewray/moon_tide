import test from 'node:test';
import assert from 'node:assert/strict';
import {
    findMoonRiseSet,
    findMoonZeniths,
    findTideExtrema,
    parseHorizonsCsv,
    parseJmaTideLine,
    parseJmaTideText,
    validateDateRange
} from '../src/data.js';

test('parseJmaTideLine reads fixed-width hourly centimeter values', () => {
    const values = [
        ' 88',
        '119',
        '144',
        '161',
        '167',
        '163',
        '152',
        '137',
        '126',
        '122',
        '127',
        '140',
        '155',
        '168',
        '175',
        '172',
        '157',
        '129',
        ' 92',
        ' 53',
        ' 20',
        '  0',
        '  0',
        ' 17'
    ];
    const line = `${values.join('')}26 1 1QL 4 51671413175`;
    const parsed = parseJmaTideLine(line);

    assert.equal(parsed.date, '2026-01-01');
    assert.equal(parsed.hourlyCm.length, 24);
    assert.equal(parsed.hourlyCm[0], 88);
    assert.equal(parsed.hourlyCm[21], 0);
    assert.equal(parsed.hourlyCm[23], 17);
});

test('parseJmaTideLine treats 999 as missing', () => {
    const values = Array.from({ length: 24 }, (_, index) => String(index).padStart(3, ' '));
    values[5] = '999';
    const parsed = parseJmaTideLine(`${values.join('')}26 7 3QL`);

    assert.equal(parsed.date, '2026-07-03');
    assert.equal(parsed.hourlyCm[5], null);
});

test('parseJmaTideText filters date range and converts centimeters to meters', () => {
    const day1 = `${Array.from({ length: 24 }, () => '100').join('')}26 7 1QL`;
    const day2 = `${Array.from({ length: 24 }, () => '150').join('')}26 7 2QL`;
    const points = parseJmaTideText(`${day1}\n${day2}`, '2026-07-02', '2026-07-02', 0, 23);

    assert.equal(points.length, 24);
    assert.equal(points[0].heightM, 1.5);
    assert.equal(points[0].time, '2026-07-01T15:00:00.000Z');
});

test('parseJmaTideText includes next-day 00:00 by default', () => {
    const text = [
        `${Array.from({ length: 24 }, () => '100').join('')}26 729QL`,
        `${Array.from({ length: 24 }, () => '110').join('')}26 730QL`,
        `${Array.from({ length: 24 }, () => '120').join('')}26 731QL`,
        `${Array.from({ length: 24 }, () => '130').join('')}26 8 1QL`
    ].join('\n');
    const points = parseJmaTideText(text, '2026-07-29', '2026-07-31', 0, 24);

    assert.equal(points.length, 73);
    assert.equal(points[0].time, '2026-07-28T15:00:00.000Z');
    assert.equal(points.at(-1).time, '2026-07-31T15:00:00.000Z');
    assert.equal(points.at(-1).heightM, 1.3);
});

test('parseJmaTideText supports explicit hour bounds', () => {
    const text = `${Array.from({ length: 24 }, (_, index) => String(index).padStart(3, ' ')).join('')}26 7 2QL`;
    const points = parseJmaTideText(text, '2026-07-02', '2026-07-02', 0, 23);

    assert.equal(points.length, 24);
    assert.equal(points[0].heightM, 0);
    assert.equal(points.at(-1).heightM, 0.23);
});

test('parseJmaTideLine reads compact month and day fields like July 29', () => {
    const values = Array.from({ length: 24 }, () => '123');
    const parsed = parseJmaTideLine(`${values.join('')}26 729QL`);

    assert.equal(parsed.date, '2026-07-29');
});

test('validateDateRange rejects invalid date ranges', () => {
    assert.throws(() => validateDateRange('2025-12-31', '2026-01-01'), /2026-01-01/);
    assert.throws(() => validateDateRange('2026-02-02', '2026-02-01'), /終了|结束/);
    assert.throws(() => validateDateRange('2026-01-01', '2026-04-05'), /93/);
    assert.throws(() => validateDateRange('2026-02-30', '2026-03-01'), /不存在/);
});

test('validateDateRange accepts about three months', () => {
    assert.equal(validateDateRange('2026-01-01', '2026-04-01', 0, 24).days, 91);
});

test('validateDateRange accepts 2027 and short cross-year ranges', () => {
    assert.equal(validateDateRange('2027-07-01', '2027-07-03', 0, 24).days, 3);
    assert.equal(validateDateRange('2026-12-31', '2027-01-02', 0, 24).days, 3);
    assert.throws(() => validateDateRange('2027-12-31', '2028-01-01'), /2027-12-31/);
});

test('validateDateRange returns default 18:00 to 06:00 time range', () => {
    const range = validateDateRange('2026-07-29', '2026-07-31');

    assert.equal(range.startHour, 18);
    assert.equal(range.endHour, 6);
    assert.equal(range.startTime, '2026-07-29T09:00:00.000Z');
    assert.equal(range.endTime, '2026-07-30T21:00:00.000Z');
});

test('validateDateRange accepts explicit hour bounds', () => {
    const range = validateDateRange('2026-07-29', '2026-07-31', 6, 18);

    assert.equal(range.startTime, '2026-07-28T21:00:00.000Z');
    assert.equal(range.endTime, '2026-07-31T09:00:00.000Z');
    assert.throws(() => validateDateRange('2026-07-29', '2026-07-29', 24, 24), /开始小时/);
    assert.throws(() => validateDateRange('2026-07-29', '2026-07-29', 0, 25), /结束小时/);
});

test('parseHorizonsCsv reads altitude from observer CSV rows', () => {
    const result = `
$$SOE
 2026-Jul-01 00:00, ,m, 120.1, -12.5,
 2026-Jul-01 00:10, ,m, 121.2, -10.0,
$$EOE
`;
    const points = parseHorizonsCsv(result);

    assert.deepEqual(points, [
        {
            time: '2026-06-30T15:00:00.000Z',
            altitudeDeg: -12.5
        },
        {
            time: '2026-06-30T15:10:00.000Z',
            altitudeDeg: -10
        }
    ]);
});

test('event helpers find crossings and tide extrema', () => {
    const moon = [
        {
            time: '2026-01-01T00:00:00.000Z',
            altitudeDeg: -1
        },
        {
            time: '2026-01-01T01:00:00.000Z',
            altitudeDeg: 1
        },
        {
            time: '2026-01-01T02:00:00.000Z',
            altitudeDeg: -1
        }
    ];
    const tide = [
        {
            time: '2026-01-01T00:00:00.000Z',
            heightM: 0
        },
        {
            time: '2026-01-01T01:00:00.000Z',
            heightM: 2
        },
        {
            time: '2026-01-01T02:00:00.000Z',
            heightM: 1
        }
    ];

    assert.equal(findMoonRiseSet(moon).length, 2);
    assert.deepEqual(findTideExtrema(tide), [
        {
            type: 'high',
            time: '2026-01-01T01:00:00.000Z',
            heightM: 2
        }
    ]);
});

test('findMoonZeniths finds local moon altitude maxima', () => {
    const points = [
        {
            time: '2026-01-01T00:00:00.000Z',
            altitudeDeg: -1
        },
        {
            time: '2026-01-01T01:00:00.000Z',
            altitudeDeg: 5
        },
        {
            time: '2026-01-01T02:00:00.000Z',
            altitudeDeg: 2
        },
        {
            time: '2026-01-01T03:00:00.000Z',
            altitudeDeg: 7
        },
        {
            time: '2026-01-01T04:00:00.000Z',
            altitudeDeg: 3
        }
    ];

    assert.deepEqual(findMoonZeniths(points), [
        {
            type: 'zenith',
            time: '2026-01-01T01:00:00.000Z',
            altitudeDeg: 5
        },
        {
            type: 'zenith',
            time: '2026-01-01T03:00:00.000Z',
            altitudeDeg: 7
        }
    ]);
});

test('findMoonZeniths ignores flat and descending sequences', () => {
    assert.deepEqual(findMoonZeniths([
        {
            time: '2026-01-01T00:00:00.000Z',
            altitudeDeg: 5
        },
        {
            time: '2026-01-01T01:00:00.000Z',
            altitudeDeg: 5
        },
        {
            time: '2026-01-01T02:00:00.000Z',
            altitudeDeg: 5
        },
        {
            time: '2026-01-01T03:00:00.000Z',
            altitudeDeg: 4
        }
    ]), []);
});
