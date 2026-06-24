const controls = document.querySelector('#controls');
const startInput = document.querySelector('#startDate');
const endInput = document.querySelector('#endDate');
const shiftMonthBackButton = document.querySelector('#shiftMonthBack');
const shiftMonthForwardButton = document.querySelector('#shiftMonthForward');
const shiftBackButton = document.querySelector('#shiftBack');
const shiftForwardButton = document.querySelector('#shiftForward');
const startHourInput = document.querySelector('#startHour');
const endHourInput = document.querySelector('#endHour');
const invertTideYInput = document.querySelector('#invertTideY');
const hideMoonBelowZeroInput = document.querySelector('#hideMoonBelowZero');
const absoluteMoonAltitudeInput = document.querySelector('#absoluteMoonAltitude');
const hideMoonAfterZenithInput = document.querySelector('#hideMoonAfterZenith');
const nightWindowOnlyInput = document.querySelector('#nightWindowOnly');
const statusEl = document.querySelector('#status');
const moonSvg = document.querySelector('#moonChart');
const tideSvg = document.querySelector('#tideChart');
const apiOrigin = window.location.protocol === 'file:' ? 'http://127.0.0.1:4173' : '';

const JST_FORMAT = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

controls.addEventListener('submit', (event) => {
    event.preventDefault();
    loadData();
});

shiftBackButton.addEventListener('click', () => {
    shiftDateRange(-1);
});

shiftForwardButton.addEventListener('click', () => {
    shiftDateRange(1);
});

shiftMonthBackButton.addEventListener('click', () => {
    shiftMonthRange(-1);
});

shiftMonthForwardButton.addEventListener('click', () => {
    shiftMonthRange(1);
});

invertTideYInput.addEventListener('change', () => {
    if (window.latestData) {
        render(window.latestData);
    }
});

hideMoonBelowZeroInput.addEventListener('change', () => {
    if (window.latestData) {
        render(window.latestData);
    }
});

absoluteMoonAltitudeInput.addEventListener('change', () => {
    if (window.latestData) {
        render(window.latestData);
    }
});

hideMoonAfterZenithInput.addEventListener('change', () => {
    if (window.latestData) {
        render(window.latestData);
    }
});

nightWindowOnlyInput.addEventListener('change', () => {
    if (window.latestData) {
        render(window.latestData);
    }
});

populateHourOptions(startHourInput, 23, 18);
populateHourOptions(endHourInput, 24, 6);

window.addEventListener('resize', debounce(() => {
    if (window.latestData) {
        render(window.latestData);
    }
}, 160));

loadData();

async function loadData() {
    setStatus('Loading JPL and JMA data...');
    controls.querySelector('button').disabled = true;

    try {
        const params = new URLSearchParams({
            start: startInput.value,
            end: endInput.value,
            startHour: startHourInput.value,
            endHour: endHourInput.value
        });
        const response = await fetch(`${apiOrigin}/api/data?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || 'Data request failed.');
        }

        window.latestData = payload;
        render(payload);
        setStatus(`${payload.range.location}, ${formatRangeHour(payload.range.startHour)} to ${formatRangeHour(payload.range.endHour)}, ${payload.range.start} - ${payload.range.end}, JST`);
    } catch (error) {
        clearSvg(moonSvg);
        clearSvg(tideSvg);
        setStatus(error.message, true);
    } finally {
        controls.querySelector('button').disabled = false;
    }
}

function populateHourOptions(select, maxHour, selectedHour) {
    for (let hour = 0; hour <= maxHour; hour += 1) {
        const option = document.createElement('option');
        option.value = String(hour);
        option.textContent = `${String(hour).padStart(2, '0')}:00`;
        option.selected = hour === selectedHour;
        select.appendChild(option);
    }
}

function shiftDateRange(days) {
    const nextStart = shiftDateString(startInput.value, days);
    const nextEnd = shiftDateString(endInput.value, days);
    if (!nextStart || !nextEnd) {
        return;
    }

    if (nextStart < startInput.min || nextEnd > endInput.max) {
        setStatus('Shift would move the range outside 2026-01-01 to 2027-12-31.', true);
        return;
    }

    startInput.value = nextStart;
    endInput.value = nextEnd;
    loadData();
}

function shiftMonthRange(months) {
    const nextStart = shiftMonthString(startInput.value, months);
    const nextEnd = shiftMonthString(endInput.value, months);
    if (!nextStart || !nextEnd) {
        return;
    }

    if (nextStart < startInput.min || nextEnd > endInput.max) {
        setStatus('Shift would move the range outside 2026-01-01 to 2027-12-31.', true);
        return;
    }

    startInput.value = nextStart;
    endInput.value = nextEnd;
    loadData();
}

function shiftDateString(value, days) {
    if (!value) {
        return '';
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
}

function shiftMonthString(value, months) {
    if (!value) {
        return '';
    }

    const [year, month, day] = value.split('-').map(Number);
    const targetMonthIndex = month - 1 + months;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0)).getUTCDate();
    const targetDay = Math.min(day, lastDay);

    return [
        targetYear,
        String(normalizedMonthIndex + 1).padStart(2, '0'),
        String(targetDay).padStart(2, '0')
    ].join('-');
}

function render(data) {
    const useAbsoluteMoon = absoluteMoonAltitudeInput.checked;
    const moonZenithEvents = data.events.moonZeniths.map((event) => ({
        time: Date.parse(event.time),
        value: useAbsoluteMoon ? Math.abs(event.altitudeDeg) : event.altitudeDeg,
        label: `Zenith ${formatTime(event.time)} ${(useAbsoluteMoon ? Math.abs(event.altitudeDeg) : event.altitudeDeg).toFixed(1)}°`,
        className: event.type
    }));
    const moonPoints = filterMoonAfterZenith(data.moon.map((point) => ({
        time: Date.parse(point.time),
        value: useAbsoluteMoon ? Math.abs(point.altitudeDeg) : point.altitudeDeg
    })), moonZenithEvents);
    const tidePoints = data.tide.map((point) => ({
        time: Date.parse(point.time),
        value: point.heightM
    }));

    if (moonPoints.length === 0 || tidePoints.length === 0) {
        clearSvg(moonSvg);
        clearSvg(tideSvg);
        setStatus('No data in selected 20:00-04:00 window.', true);
        return;
    }

    statusEl.classList.remove('error');

    const minTime = Math.min(moonPoints[0].time, tidePoints[0].time);
    const maxTime = Math.max(
        moonPoints[moonPoints.length - 1].time,
        tidePoints[tidePoints.length - 1].time
    );

    renderLineChart(moonSvg, {
        title: 'Moon altitude',
        unit: 'deg',
        showXTicks: false,
        hourlyXTicks: false,
        nightWindowOnly: nightWindowOnlyInput.checked,
        points: moonPoints,
        minTime,
        maxTime,
        yMin: Math.min(-20, floorTo(Math.min(...moonPoints.map((point) => point.value)), 10)),
        yMax: Math.max(80, ceilTo(Math.max(...moonPoints.map((point) => point.value)), 10)),
        pathClass: 'moon-path',
        fillClass: 'moon-fill',
        baseline: 0,
        hideBelow: hideMoonBelowZeroInput.checked ? 0 : null,
        dimOutsideNightWindow: nightWindowOnlyInput.checked,
        events: filterMoonEventsAfterZenith([
            ...data.events.moonRiseSet.map((event) => ({
                time: Date.parse(event.time),
                value: useAbsoluteMoon ? Math.abs(event.altitudeDeg) : event.altitudeDeg,
                label: event.type === 'rise' ? `Rise ${formatTime(event.time)}` : `Set ${formatTime(event.time)}`,
                className: event.type
            })),
            ...moonZenithEvents
        ])
    });

    renderLineChart(tideSvg, {
        title: 'Tide height',
        unit: 'm',
        showXTicks: true,
        xTickMode: 'day',
        rotateXTicks: true,
        nightWindowOnly: nightWindowOnlyInput.checked,
        points: tidePoints,
        minTime,
        maxTime,
        yMin: floorTo(Math.min(...tidePoints.map((point) => point.value)) - 0.1, 0.2),
        yMax: ceilTo(Math.max(...tidePoints.map((point) => point.value)) + 0.1, 0.2),
        pathClass: 'tide-path',
        fillClass: 'tide-fill',
        baseline: Math.min(...tidePoints.map((point) => point.value)),
        invertY: invertTideYInput.checked,
        dimOutsideNightWindow: nightWindowOnlyInput.checked,
        events: data.events.tideExtrema.map((event) => ({
            time: Date.parse(event.time),
            value: event.heightM,
            label: `${event.type === 'high' ? 'High' : 'Low'} ${formatTime(event.time)} ${event.heightM.toFixed(2)}m`,
            className: event.type
        }))
    });
}

function filterMoonEventsAfterZenith(events) {
    if (!hideMoonAfterZenithInput.checked) {
        return events;
    }

    return events.filter((event) => event.className !== 'set');
}

function filterMoonAfterZenith(points, zenithEvents) {
    if (!hideMoonAfterZenithInput.checked || zenithEvents.length === 0) {
        return points;
    }

    const zenithTimes = new Set(zenithEvents.map((event) => event.time));
    return points.filter((point, index) => {
        const previous = points[index - 1];
        const next = points[index + 1];
        if (zenithTimes.has(point.time)) {
            return true;
        }

        if (previous && point.time - previous.time > 90 * 60 * 1000) {
            return next ? next.value >= point.value : true;
        }

        if (next && next.time - point.time <= 90 * 60 * 1000) {
            return next.value >= point.value;
        }

        return previous ? point.value >= previous.value : true;
    });
}

function renderLineChart(svg, options) {
    clearSvg(svg);

    const width = Math.max(1, Math.floor(svg.getBoundingClientRect().width));
    const height = Math.floor(svg.getBoundingClientRect().height || 360);
    const margin = {
        top: 34,
        right: 28,
        bottom: options.rotateXTicks ? 112 : 46,
        left: 68
    };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const x = (time) => margin.left + ((time - options.minTime) / (options.maxTime - options.minTime)) * plotWidth;
    const y = (value) => {
        const ratio = (value - options.yMin) / (options.yMax - options.yMin);
        return margin.top + (options.invertY ? ratio : 1 - ratio) * plotHeight;
    };
    const baselineY = y(Math.max(options.yMin, Math.min(options.yMax, options.baseline)));

    appendText(svg, margin.left, 22, `${options.title} (${options.unit})`, 'axis-label');
    drawGrid(svg, width, height, margin, options, x, y);

    if (Number.isFinite(options.baseline)) {
        const className = options.baseline === 0 ? 'horizon' : 'grid';
        appendLine(svg, margin.left, baselineY, width - margin.right, baselineY, className);
    }

    const visibleSegments = makeVisibleSegments(options.points, options.hideBelow, options.dimOutsideNightWindow);
    for (const segment of visibleSegments) {
        const area = [
            `M ${x(segment.points[0].time)} ${baselineY}`,
            ...segment.points.map((point) => `L ${x(point.time)} ${y(point.value)}`),
            `L ${x(segment.points[segment.points.length - 1].time)} ${baselineY}`,
            'Z'
        ].join(' ');
        appendPath(svg, area, `${options.fillClass}${segment.dimmed ? ' dimmed-fill' : ''}`);

        const path = segment.points
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.time)} ${y(point.value)}`)
            .join(' ');
        appendPath(svg, path, `${options.pathClass}${segment.dimmed ? ' dimmed-path' : ''}`);
    }

    for (const event of options.events) {
        if (event.time < options.minTime || event.time > options.maxTime) {
            continue;
        }
        if (options.hideBelow !== null && event.value < options.hideBelow) {
            continue;
        }

        const cx = x(event.time);
        const cy = y(event.value);
        const dimmedEvent = options.dimOutsideNightWindow && !isNightWindowTime(event.time);
        const className = `${event.className}${dimmedEvent ? ' dimmed-event' : ''}`;
        appendCircle(svg, cx, cy, 5, className);
        const labelY = event.className === 'low' || event.className === 'set' ? cy - 12 : cy + 20;
        appendText(svg, clamp(cx - 42, margin.left, width - margin.right - 84), labelY, event.label, `event-label ${className}`);
    }

    appendLine(svg, margin.left, height - margin.bottom, width - margin.right, height - margin.bottom, 'axis');
    appendLine(svg, margin.left, margin.top, margin.left, height - margin.bottom, 'axis');
}

function makeVisibleSegments(points, hideBelow, dimOutsideNightWindow = false) {
    if (hideBelow === null || hideBelow === undefined) {
        return splitByTimeGapAndNightWindow(points, dimOutsideNightWindow);
    }

    const segments = [];
    let current = [];

    for (const point of points) {
        if (point.value >= hideBelow) {
            current.push(point);
        } else if (current.length > 0) {
            segments.push(current);
            current = [];
        }
    }

    if (current.length > 0) {
        segments.push(current);
    }

    return segments.flatMap((segment) => splitByTimeGapAndNightWindow(segment, dimOutsideNightWindow));
}

function splitByTimeGapAndNightWindow(points, dimOutsideNightWindow) {
    if (points.length === 0) {
        return [];
    }

    const segments = [];
    let current = [points[0]];
    let currentDimmed = dimOutsideNightWindow && !isNightWindowTime(points[0].time);

    for (let index = 1; index < points.length; index += 1) {
        const point = points[index];
        const previous = points[index - 1];
        const gapMs = point.time - previous.time;
        const dimmed = dimOutsideNightWindow && !isNightWindowTime(point.time);
        if (gapMs > 90 * 60 * 1000 || dimmed !== currentDimmed) {
            segments.push({
                points: current,
                dimmed: currentDimmed
            });
            current = [point];
            currentDimmed = dimmed;
        } else {
            current.push(point);
        }
    }

    segments.push({
        points: current,
        dimmed: currentDimmed
    });
    return segments;
}

function drawGrid(svg, width, height, margin, options, x, y) {
    const yTicks = makeYTicks(options.yMin, options.yMax, 5);
    for (const tick of yTicks) {
        const yPos = y(tick);
        appendLine(svg, margin.left, yPos, width - margin.right, yPos, 'grid');
        appendText(svg, 12, yPos + 4, tick.toFixed(options.unit === 'm' ? 1 : 0), 'tick');
    }

    if (options.showXTicks !== false) {
        const ticks = makeTimeTicks(options.minTime, options.maxTime, options.xTickMode);
        const includeYear = options.xTickMode === 'day' && jstYear(options.minTime) !== jstYear(options.maxTime);
        for (const tick of ticks) {
            const xPos = x(tick);
            appendLine(svg, xPos, margin.top, xPos, height - margin.bottom, 'grid');
            const tickClass = isWeekendTick(tick, options.xTickMode) ? 'tick vertical-tick weekend-tick' : 'tick vertical-tick';
            if (options.rotateXTicks) {
                appendText(svg, xPos + 4, height - margin.bottom + 12, formatTick(tick, options.xTickMode, includeYear), tickClass, `rotate(90 ${xPos + 4} ${height - margin.bottom + 12})`);
            } else {
                appendText(svg, clamp(xPos - 18, margin.left, width - margin.right - 52), height - 17, formatTick(tick, options.xTickMode, includeYear), tickClass);
            }
        }
    }
}

function makeYTicks(min, max, count) {
    const ticks = [];
    const step = (max - min) / (count - 1);
    for (let index = 0; index < count; index += 1) {
        ticks.push(min + step * index);
    }

    return ticks;
}

function makeTimeTicks(minTime, maxTime, mode = 'auto') {
    if (mode === 'hour') {
        const hour = 3600000;
        const firstHour = Math.ceil(minTime / hour) * hour;
        const ticks = [];
        for (let time = firstHour; time <= maxTime; time += hour) {
            ticks.push(time);
        }

        return ticks;
    }

    if (mode === 'day') {
        const day = 24 * 3600000;
        const firstDay = Math.ceil((minTime + 9 * 3600000) / day) * day - 9 * 3600000;
        const ticks = [];
        for (let time = firstDay; time <= maxTime; time += day) {
            ticks.push(time);
        }

        return ticks;
    }

    const spanHours = (maxTime - minTime) / 3600000;
    const stepHours = spanHours <= 24 ? 3 : spanHours <= 72 ? 6 : 12;
    const step = stepHours * 3600000;
    const first = Math.ceil(minTime / step) * step;
    const ticks = [];

    for (let time = first; time <= maxTime; time += step) {
        ticks.push(time);
    }

    return ticks;
}

function appendPath(svg, d, className) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    svg.appendChild(path);
}

function appendLine(svg, x1, y1, x2, y2, className) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', className);
    svg.appendChild(line);
}

function appendCircle(svg, cx, cy, r, className) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', r);
    circle.setAttribute('class', className);
    svg.appendChild(circle);
}

function appendText(svg, x, y, text, className, transform = '') {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    element.setAttribute('x', x);
    element.setAttribute('y', y);
    element.setAttribute('class', className);
    if (transform) {
        element.setAttribute('transform', transform);
    }

    element.textContent = text;
    svg.appendChild(element);
}

function formatTick(time, mode = 'auto', includeYear = false) {
    if (mode === 'day') {
        const date = new Date(time + 9 * 60 * 60 * 1000);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
        return includeYear ? `${year}/${month}/${day} ${weekday}` : `${month}/${day} ${weekday}`;
    }

    return JST_FORMAT.format(new Date(time)).replace(',', '');
}

function isWeekendTick(time, mode = 'auto') {
    if (mode !== 'day') {
        return false;
    }

    const weekday = new Date(time + 9 * 60 * 60 * 1000).getUTCDay();
    return weekday === 0 || weekday === 6;
}

function jstYear(time) {
    return new Date(time + 9 * 60 * 60 * 1000).getUTCFullYear();
}

function formatTime(time) {
    return JST_FORMAT.format(new Date(time)).slice(7);
}

function formatRangeHour(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
}

function isNightWindowTime(time) {
    const date = new Date(time + 9 * 60 * 60 * 1000);
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    return hour >= 20 || hour < 4 || (hour === 4 && minute === 0);
}

function clearSvg(svg) {
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
}

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
}

function floorTo(value, step) {
    return Math.floor(value / step) * step;
}

function ceilTo(value, step) {
    return Math.ceil(value / step) * step;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function debounce(callback, wait) {
    let timeout = null;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => callback(...args), wait);
    };
}
