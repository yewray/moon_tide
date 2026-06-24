import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const JMA_STATION = 'QL';
const JMA_LOCAL_FILES = {
    2026: fileURLToPath(new URL('../data/QL-2026.txt', import.meta.url)),
    2027: fileURLToPath(new URL('../data/QL-2027.txt', import.meta.url))
};
const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const MIN_DATE = '2026-01-01';
const MAX_DATE = '2027-12-31';
const MAX_DAYS = 93;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
];

export function validateDateRange(start, end, startHour = 18, endHour = 6) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        throw new Error('日期格式必须是 YYYY-MM-DD。');
    }

    const normalizedStartHour = normalizeHour(startHour, '开始小时', 0, 23);
    const normalizedEndHour = normalizeHour(endHour, '结束小时', 0, 24);
    const startParts = parseDateParts(start);
    const endParts = parseDateParts(end);
    if (!startParts || !endParts) {
        throw new Error('日期不存在，请检查开始日期和结束日期。');
    }

    if (start < MIN_DATE || end > MAX_DATE) {
        throw new Error('日期范围只能在 2026-01-01 到 2027-12-31 之间。');
    }

    if (end < start) {
        throw new Error('结束日期不能早于开始日期。');
    }

    const startMs = jstDateHourToUtcMs(start, normalizedStartHour);
    const endMs = jstDateHourToUtcMs(end, normalizedEndHour) +
        (end === start && normalizedEndHour < normalizedStartHour ? DAY_MS : 0);
    if (endMs < startMs) {
        throw new Error('结束时间不能早于开始时间。');
    }

    const spanDays = (endMs - startMs) / DAY_MS;
    if (spanDays > MAX_DAYS) {
        throw new Error(`日期跨度不能超过 3 个月/${MAX_DAYS} 天。`);
    }

    return {
        start,
        end,
        startHour: normalizedStartHour,
        endHour: normalizedEndHour,
        days: Math.max(1, Math.ceil(spanDays)),
        startMs,
        endMs,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString()
    };
}

export async function getMoonTideData(start, end, startHour = 18, endHour = 6, fetchImpl = fetch) {
    const range = validateDateRange(start, end, startHour, endHour);
    const [moon, tide] = await Promise.all([
        fetchMoonAltitude(range, fetchImpl),
        fetchTideHeights(range, fetchImpl)
    ]);

    return {
        range: {
            start,
            end,
            startHour: range.startHour,
            endHour: range.endHour,
            startTime: range.startTime,
            endTime: range.endTime,
            timezone: 'Asia/Tokyo',
            location: 'Chiba'
        },
        moon,
        tide,
        events: {
            moonRiseSet: findMoonRiseSet(moon),
            moonZeniths: findMoonZeniths(moon),
            tideExtrema: findTideExtrema(tide)
        }
    };
}

export async function fetchMoonAltitude(range, fetchImpl = fetch) {
    const start = formatHorizonsMs(range.startMs);
    const end = formatHorizonsMs(range.endMs);
    const params = new URLSearchParams({
        format: 'json',
        COMMAND: "'301'",
        OBJ_DATA: 'NO',
        MAKE_EPHEM: 'YES',
        EPHEM_TYPE: 'OBSERVER',
        CENTER: "'coord'",
        COORD_TYPE: 'GEODETIC',
        SITE_COORD: "'140.1063,35.6074,0'",
        START_TIME: `'${start}'`,
        STOP_TIME: `'${end}'`,
        STEP_SIZE: "'10 m'",
        TIME_TYPE: 'UT',
        TIME_ZONE: "'+09:00'",
        CSV_FORMAT: 'YES',
        QUANTITIES: "'4'",
        ANG_FORMAT: 'DEG',
        APPARENT: 'REFRACTED'
    });

    const response = await fetchImpl(`${HORIZONS_URL}?${params.toString()}`);
    if (!response.ok) {
        throw new Error(`JPL Horizons 请求失败：HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
        throw new Error(`JPL Horizons 错误：${payload.error}`);
    }

    return parseHorizonsCsv(payload.result || '');
}

export async function fetchTideHeights(range, fetchImpl = fetch) {
    const years = yearsInMsRange(range.startMs, range.endMs);
    const textParts = await Promise.all(years.map(async (year) => {
        const file = JMA_LOCAL_FILES[year];
        if (!file) {
            throw new Error(`${year} 年的本地 JMA 潮位文件不存在。`);
        }

        return readFile(file, 'utf8');
    }));
    const text = textParts.join('\n');
    return parseJmaTideText(text, range.start, range.end, range.startHour, range.endHour);
}

export function parseJmaTideText(text, start, end, startHour = 18, endHour = 6) {
    const range = validateDateRange(start, end, startHour, endHour);

    const selected = [];
    for (const rawLine of text.split(/\r?\n/)) {
        if (!rawLine.includes(JMA_STATION)) {
            continue;
        }

        const parsed = parseJmaTideLine(rawLine);
        if (!parsed) {
            continue;
        }

        for (let hour = 0; hour < parsed.hourlyCm.length; hour += 1) {
            const value = parsed.hourlyCm[hour];
            if (value === null) {
                continue;
            }

            selected.push({
                time: jstPartsToIso(parsed.year, parsed.month, parsed.day, hour, 0),
                heightM: value / 100
            });
        }
    }

    const deduped = new Map();
    for (const point of selected) {
        const timeMs = Date.parse(point.time);
        if (timeMs >= range.startMs && timeMs <= range.endMs) {
            deduped.set(point.time, point);
        }
    }

    selected.length = 0;
    selected.push(...deduped.values());
    selected.sort((a, b) => a.time.localeCompare(b.time));
    if (selected.length === 0) {
        throw new Error('没有解析到所选日期的 JMA 潮位数据。');
    }

    return selected;
}

export function parseJmaTideLine(line) {
    const stationIndex = line.indexOf(JMA_STATION);
    if (stationIndex < 0) {
        return null;
    }

    const dateParts = parseJmaDateField(line.slice(72, stationIndex));
    if (!dateParts) {
        return null;
    }

    const year = dateParts.year;
    const month = dateParts.month;
    const day = dateParts.day;
    const date = makeDateString(year, month, day);
    if (!parseDateParts(date)) {
        return null;
    }

    const hourlyPart = line.slice(0, 72).padEnd(72, ' ');
    const hourlyCm = [];
    for (let index = 0; index < 24; index += 1) {
        const chunk = hourlyPart.slice(index * 3, index * 3 + 3);
        const trimmed = chunk.trim();
        if (!trimmed || trimmed === '999') {
            hourlyCm.push(null);
            continue;
        }

        const value = Number(trimmed);
        hourlyCm.push(Number.isFinite(value) ? value : null);
    }

    return {
        year,
        month,
        day,
        date,
        hourlyCm
    };
}

function parseJmaDateField(field) {
    const digits = field.replace(/\D/g, '');
    if (digits.length < 4) {
        return null;
    }

    const year = 2000 + Number(digits.slice(0, 2));
    const rest = digits.slice(2);
    const candidates = [];

    for (let split = 1; split < rest.length; split += 1) {
        const month = Number(rest.slice(0, split));
        const day = Number(rest.slice(split));
        const date = makeDateString(year, month, day);
        if (parseDateParts(date)) {
            candidates.push({
                year,
                month,
                day
            });
        }
    }

    if (candidates.length === 1) {
        return candidates[0];
    }

    const spaced = field.match(/(\d{2})\s+(\d{1,2})\s+(\d{1,2})/);
    if (spaced) {
        return {
            year: 2000 + Number(spaced[1]),
            month: Number(spaced[2]),
            day: Number(spaced[3])
        };
    }

    return candidates.find((candidate) => candidate.month <= 12 && candidate.day <= 31) || null;
}

export function parseHorizonsCsv(result) {
    const table = result.match(/\$\$SOE\s*([\s\S]*?)\s*\$\$EOE/);
    if (!table) {
        throw new Error('JPL Horizons 响应中没有找到星历表。');
    }

    const rows = table[1]
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const points = [];
    for (const row of rows) {
        const columns = parseCsvRow(row);
        if (columns.length < 4) {
            continue;
        }

        const time = parseHorizonsTime(columns[0]);
        const altitudeDeg = lastFiniteNumber(columns.slice(2));
        if (!time || altitudeDeg === null) {
            continue;
        }

        points.push({
            time,
            altitudeDeg
        });
    }

    if (points.length === 0) {
        throw new Error('没有解析到 JPL Horizons 月亮高度数据。');
    }

    return points;
}

export function findMoonRiseSet(points) {
    const events = [];
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous.altitudeDeg === current.altitudeDeg) {
            continue;
        }

        const crossesUp = previous.altitudeDeg < 0 && current.altitudeDeg >= 0;
        const crossesDown = previous.altitudeDeg >= 0 && current.altitudeDeg < 0;
        if (!crossesUp && !crossesDown) {
            continue;
        }

        const ratio = (0 - previous.altitudeDeg) / (current.altitudeDeg - previous.altitudeDeg);
        const timeMs = Date.parse(previous.time) + ratio * (Date.parse(current.time) - Date.parse(previous.time));
        events.push({
            type: crossesUp ? 'rise' : 'set',
            time: new Date(timeMs).toISOString(),
            altitudeDeg: 0
        });
    }

    return events;
}

export function findMoonZeniths(points) {
    const events = [];
    for (let index = 1; index < points.length - 1; index += 1) {
        const previous = points[index - 1].altitudeDeg;
        const current = points[index].altitudeDeg;
        const next = points[index + 1].altitudeDeg;

        if (current > previous && current > next) {
            events.push({
                type: 'zenith',
                time: points[index].time,
                altitudeDeg: current
            });
        }
    }

    return events;
}

export function findTideExtrema(points) {
    const events = [];
    for (let index = 1; index < points.length - 1; index += 1) {
        const previous = points[index - 1].heightM;
        const current = points[index].heightM;
        const next = points[index + 1].heightM;

        if (current >= previous && current > next) {
            events.push({
                type: 'high',
                time: points[index].time,
                heightM: current
            });
        } else if (current <= previous && current < next) {
            events.push({
                type: 'low',
                time: points[index].time,
                heightM: current
            });
        }
    }

    return events;
}

function parseDateParts(value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return {
        year,
        month,
        day
    };
}

function parseHorizonsTime(value) {
    const match = value.match(/(?:A\.D\.\s+)?(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = MONTH_NAMES.indexOf(match[2]) + 1;
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    if (month < 1) {
        return null;
    }

    return jstPartsToIso(year, month, day, hour, minute);
}

function parseCsvRow(row) {
    const columns = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < row.length; index += 1) {
        const char = row[index];
        if (char === '"') {
            quoted = !quoted;
        } else if (char === ',' && !quoted) {
            columns.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    columns.push(current.trim());
    return columns;
}

function lastFiniteNumber(values) {
    for (const value of values.toReversed()) {
        if (value === '') {
            continue;
        }

        const number = Number(value);
        if (Number.isFinite(number)) {
            return number;
        }
    }

    return null;
}

function jstDateToUtcMs(date) {
    const parts = parseDateParts(date);
    return Date.UTC(parts.year, parts.month - 1, parts.day) - JST_OFFSET_MS;
}

function jstDateHourToUtcMs(date, hour) {
    return jstDateToUtcMs(date) + hour * 60 * 60 * 1000;
}

function jstPartsToIso(year, month, day, hour, minute) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS).toISOString();
}

function formatHorizonsMs(ms) {
    const date = new Date(ms + JST_OFFSET_MS);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();

    return `${year}-${MONTH_NAMES[month - 1]}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function makeDateString(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeHour(value, label, min, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
        throw new Error(`${label}必须是 ${min} 到 ${max} 之间的整数。`);
    }

    return number;
}

function yearsInMsRange(startMs, endMs) {
    const startYear = new Date(startMs + JST_OFFSET_MS).getUTCFullYear();
    const endYear = new Date(endMs + JST_OFFSET_MS).getUTCFullYear();
    const years = [];

    for (let year = startYear; year <= endYear; year += 1) {
        years.push(year);
    }

    return years;
}
