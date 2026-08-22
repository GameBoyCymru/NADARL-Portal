let currentShooter = null;
let seasons = [];
let seasonIndex = 0;

let compareRoster = [];
let compareShooter = null;
let currentSeasonStatsRows = [];
let compareHistoryRows = [];
let compareAllTimeHistory = [];

let previousSeasonHistoryRows = [];
let comparePreviousSeasonHistoryRows = [];
let showPreviousSeason = false;

const COMPARE_PRIMARY_COLOR = '#d4a017';
const COMPARE_SECONDARY_COLOR = '#4fc3f7';
const PREVIOUS_SEASON_COLOR = 'rgba(212, 160, 23, 0.35)';
const COMPARE_PREVIOUS_SEASON_COLOR = 'rgba(79, 195, 247, 0.35)';

function padArray(arr, length) {
    const padded = arr.slice();
    while (padded.length < length) padded.push(null);
    return padded;
}

let historyRows = [];
let sortKey = null;
let sortDir = 1;

const AVERAGE_ALL_TIME_PAGE_SIZE = 20;
let allTimeAverageRows = [];
let allTimeAveragePage = 0;

// Same comparator convention as the league table / team page: strings
// compare case-insensitively, numbers numerically, booleans true-first
// (so "Home" sorts before "Away"), nulls last.
function compareValues(aVal, bVal) {
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'boolean') return aVal === bVal ? 0 : (aVal ? -1 : 1);
    if (typeof aVal === 'string' || typeof bVal === 'string') {
        return String(aVal).localeCompare(String(bVal));
    }
    return Number(aVal) - Number(bVal);
}

// Combines the current shooter's matches with the compare shooter's (if
// any) into one list, each row tagged with which shooter it belongs to.
function combinedHistoryRows() {
    if (!compareShooter) return historyRows;
    const primary = historyRows.map(r => ({ ...r, shooter_name: currentShooter.name, is_compare_row: false }));
    const compare = compareHistoryRows.map(r => ({ ...r, shooter_name: compareShooter.name, is_compare_row: true }));
    return primary.concat(compare);
}

function sortedHistory() {
    const rows = combinedHistoryRows();
    if (!sortKey) {
        // With two shooters merged, default to chronological order so their
        // matches interleave sensibly instead of listing one shooter's
        // whole season then the other's.
        return compareShooter ? rows.slice().sort((a, b) => compareValues(a.date, b.date)) : rows;
    }
    return rows.slice().sort((a, b) => compareValues(a[sortKey], b[sortKey]) * sortDir);
}

function updateSortIndicators() {
    document.querySelectorAll('#matchHistoryHead th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === sortKey) {
            th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
        }
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Chart.js renders an array tick label as stacked lines, so the average
// charts' x-axis can show day/month/year on their own lines instead of one
// cramped "22 Aug 2026" string per point.
function formatDateStack(dateStr) {
    if (!dateStr) return [''];
    const d = new Date(dateStr + 'T00:00:00');
    return [
        d.toLocaleDateString('en-GB', { day: '2-digit' }),
        d.toLocaleDateString('en-GB', { month: 'short' }),
        d.toLocaleDateString('en-GB', { year: 'numeric' })
    ];
}

function matchTableColCount() {
    return compareShooter ? 7 : 6;
}

function renderHistoryTable() {
    const tbody = document.getElementById('matchHistoryTable');
    const rows = sortedHistory();
    const comparing = !!compareShooter;

    document.getElementById('shooterColumnHead').hidden = !comparing;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${matchTableColCount()}">No results for this season yet.</td></tr>`;
        return;
    }

    let html = '';
    rows.forEach(row => {
        html += `<tr class="${row.is_compare_row ? 'compare-row' : ''}">
            <td>${formatDate(row.date)}</td>
            <td class="team-cell">${row.opponent_name}</td>
            ${comparing ? `<td class="team-cell">${escapeHtml(row.shooter_name)}</td>` : ''}
            <td class="score-cell">${row.is_home ? 'Home' : 'Away'}</td>
            <td class="score-cell">${row.total}</td>
            <td class="score-cell">${row.tens}</td>
            <td class="shots-cell">${(row.shots || []).join(', ')}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

const shotPatternCharts = {};

function shotAveragesFor(rows, shotCount) {
    const averages = [];
    for (let i = 0; i < shotCount; i++) {
        const values = rows.map(r => (r.shots || [])[i]).filter(v => v != null);
        averages.push(values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
    }
    return averages;
}

// seriesList: [{ rows, label, color, dashed }, ...] - the first entry is
// always the primary (current) shooter and is always drawn even if empty;
// later entries (compare shooter, previous season, ...) are skipped when
// they have no rows.
function renderShotPatternChart(canvasId, emptyId, seriesList) {
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);

    const shotCount = seriesList.reduce((max, s) =>
        Math.max(max, (s.rows || []).reduce((m, r) => Math.max(m, (r.shots || []).length), 0)), 0);

    if (shotPatternCharts[canvasId]) {
        shotPatternCharts[canvasId].destroy();
        delete shotPatternCharts[canvasId];
    }

    if (!shotCount) {
        canvas.hidden = true;
        empty.hidden = false;
        return;
    }
    canvas.hidden = false;
    empty.hidden = true;

    const datasets = seriesList
        .filter((s, i) => i === 0 || (s.rows && s.rows.length))
        .map(s => ({ data: shotAveragesFor(s.rows || [], shotCount), label: s.label, color: s.color, dashed: s.dashed }));
    const showLegend = datasets.filter(d => d.label).length > 1;

    shotPatternCharts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array.from({ length: shotCount }, (_, i) => `Shot ${i + 1}`),
            datasets: datasets.map(ds => ({
                label: ds.label,
                data: ds.data,
                borderColor: ds.color,
                backgroundColor: ds.color,
                borderWidth: 2,
                borderDash: ds.dashed ? [6, 4] : undefined,
                pointRadius: ds.dashed ? 0 : 4,
                pointBackgroundColor: ds.color,
                pointBorderColor: ds.color,
                tension: 0,
                spanGaps: true,
                clip: false
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 6, bottom: 6 }
            },
            plugins: {
                legend: { display: showLegend, labels: { color: '#e0d6c8' } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${showLegend ? ctx.dataset.label + ': ' : ''}${ctx.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' }
                },
                y: {
                    min: 0,
                    max: 10,
                    ticks: { color: '#a0a0a0', stepSize: 2 },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' }
                }
            }
        }
    });
}

function computeRunningAverages(rows) {
    let runningTotal = 0;
    return rows.map((row, i) => {
        runningTotal += row.total;
        return runningTotal / (i + 1);
    });
}

function drawRunningAverageLine(canvasId, emptyId, labels, datasets) {
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);

    if (shotPatternCharts[canvasId]) {
        shotPatternCharts[canvasId].destroy();
        delete shotPatternCharts[canvasId];
    }

    const allValues = datasets.flatMap(ds => ds.data).filter(v => v != null);
    if (!labels.length || !allValues.length) {
        canvas.hidden = true;
        empty.hidden = false;
        return;
    }
    canvas.hidden = false;
    empty.hidden = true;

    const showLegend = datasets.length > 1;

    shotPatternCharts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets.map(ds => ({
                label: ds.label,
                data: ds.data,
                borderColor: ds.color,
                backgroundColor: ds.color,
                borderWidth: 2,
                borderDash: ds.dashed ? [6, 4] : undefined,
                pointRadius: ds.dashed ? 0 : 3,
                pointBackgroundColor: ds.color,
                pointBorderColor: ds.color,
                tension: 0,
                spanGaps: true,
                clip: false
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 6, bottom: 6 }
            },
            plugins: {
                legend: { display: showLegend, labels: { color: '#e0d6c8' } },
                tooltip: {
                    callbacks: {
                        // Stacked date labels are [day, month, year] arrays for the
                        // axis; join them back into one line for the tooltip title.
                        title: ctx => {
                            const label = ctx[0] && ctx[0].label;
                            return Array.isArray(label) ? label.join(' ') : label;
                        },
                        label: ctx => `${showLegend ? ctx.dataset.label + ': ' : ''}${ctx.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#a0a0a0', maxRotation: 0, autoSkip: true },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' }
                },
                y: {
                    min: Math.max(0, Math.min(...allValues) - 5),
                    max: Math.min(70, Math.max(...allValues) + 5),
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' }
                }
            }
        }
    });
}

// seriesList: [{ rows, label, color, dashed }, ...] - the first entry is
// the primary (current) shooter, always drawn even if empty. When any
// other entry has rows (compare shooter, previous season, ...), their
// matches fall on different dates than the primary's, so a shared
// date-based x-axis can't align the lines meaningfully - fall back to
// "Match N" (progression index) labels instead.
function renderRunningAverageChart(canvasId, emptyId, seriesList) {
    const primary = seriesList[0];
    const primaryValues = computeRunningAverages(primary.rows || []);
    const others = seriesList.slice(1).filter(s => s.rows && s.rows.length);

    if (others.length) {
        const maxLen = Math.max((primary.rows || []).length, ...others.map(s => s.rows.length));
        const labels = Array.from({ length: maxLen }, (_, i) => `Match ${i + 1}`);
        const datasets = [{ data: padArray(primaryValues, maxLen), label: primary.label, color: primary.color, dashed: primary.dashed }];
        others.forEach(s => datasets.push({ data: padArray(computeRunningAverages(s.rows), maxLen), label: s.label, color: s.color, dashed: s.dashed }));
        drawRunningAverageLine(canvasId, emptyId, labels, datasets);
        return;
    }

    drawRunningAverageLine(canvasId, emptyId, (primary.rows || []).map(row => formatDateStack(row.date)), [
        { data: primaryValues, label: primary.label, color: primary.color, dashed: primary.dashed }
    ]);
}

// The all-time average chart grows one point per match played, so unlike the
// season chart (naturally capped at a season's worth of matches) it's paged
// to keep the number of rendered points/markers bounded as history grows.
function renderAverageAllTimePage() {
    const nav = document.getElementById('averageAllTimePageNav');
    const total = allTimeAverageRows.length;
    const hasCompare = !!(compareShooter && compareAllTimeHistory.length);
    const pagedTotal = Math.max(total, hasCompare ? compareAllTimeHistory.length : 0);

    if (!pagedTotal) {
        nav.hidden = true;
        drawRunningAverageLine('averageChartAllTime', 'averageEmptyAllTime', [], []);
        return;
    }

    const totalPages = Math.max(1, Math.ceil(pagedTotal / AVERAGE_ALL_TIME_PAGE_SIZE));
    allTimeAveragePage = Math.min(Math.max(allTimeAveragePage, 0), totalPages - 1);

    const start = allTimeAveragePage * AVERAGE_ALL_TIME_PAGE_SIZE;
    const end = Math.min(start + AVERAGE_ALL_TIME_PAGE_SIZE, pagedTotal);
    const windowLen = end - start;

    // Running average at each point still reflects the shooter's whole
    // history - only the window of points drawn on screen is paged. When
    // comparing, both shooters' windows are aligned by match index (not
    // calendar date), same as the season running-average chart.
    const fullAverages = computeRunningAverages(allTimeAverageRows);
    const pageRows = allTimeAverageRows.slice(start, end);
    const pageAverages = fullAverages.slice(start, end);

    const datasets = [{ data: padArray(pageAverages, windowLen), label: currentShooter.name, color: COMPARE_PRIMARY_COLOR }];
    let labels;

    if (hasCompare) {
        const compareFullAverages = computeRunningAverages(compareAllTimeHistory);
        const comparePageAverages = compareFullAverages.slice(start, end);
        labels = Array.from({ length: windowLen }, (_, i) => `Match ${start + i + 1}`);
        datasets.push({ data: padArray(comparePageAverages, windowLen), label: compareShooter.name, color: COMPARE_SECONDARY_COLOR });
    } else {
        labels = pageRows.map(row => formatDateStack(row.date));
    }

    drawRunningAverageLine('averageChartAllTime', 'averageEmptyAllTime', labels, datasets);

    nav.hidden = totalPages <= 1;
    document.getElementById('averageAllTimePagePrev').disabled = allTimeAveragePage <= 0;
    document.getElementById('averageAllTimePageNext').disabled = allTimeAveragePage >= totalPages - 1;
    document.getElementById('averageAllTimePageLabel').textContent = `${start + 1}–${end} of ${pagedTotal}`;
}

function renderStatTiles(containerId, stats) {
    const container = document.getElementById(containerId);
    const tiles = [
        { label: 'Matches Played', value: stats ? stats.matches_played : 0 },
        { label: 'Personal Best', value: stats ? stats.best : 0 },
        { label: 'Season Best', value: stats ? stats.season_best : 0 },
        { label: "10's", value: stats ? stats.tens : 0 },
        { label: 'Average', value: stats ? Number(stats.average).toFixed(1) : '0.0' },
        { label: 'Handicap', value: stats && stats.handicap != null ? Number(stats.handicap).toFixed(1) : 'N/A' }
    ];
    container.innerHTML = tiles.map(t => `
        <div class="stat-tile">
            <div class="stat-tile-value">${t.value}</div>
            <div class="stat-tile-label">${t.label}</div>
        </div>
    `).join('');
}

// ----------------------------------------------------------------------------
// Compare with another shooter
// ----------------------------------------------------------------------------

function renderCompareResults(query) {
    const resultsBox = document.getElementById('compareResults');
    const q = query.trim().toLowerCase();

    if (!q) {
        resultsBox.hidden = true;
        resultsBox.innerHTML = '';
        return;
    }

    const matches = compareRoster
        .filter(s => s.shooter_id !== currentShooter.id)
        .filter(s => s.name.toLowerCase().includes(q) || String(s.shooter_no).includes(q))
        .slice(0, 8);

    resultsBox.hidden = false;
    resultsBox.innerHTML = matches.length
        ? matches.map(s => `
            <button type="button" class="compare-result" data-id="${s.shooter_id}">
                <span class="compare-result-no">#${s.shooter_no}</span>
                <span class="compare-result-name">${escapeHtml(s.name)}</span>
                <span class="compare-result-team">${escapeHtml(s.team_name || '')}</span>
            </button>
        `).join('')
        : '<p class="compare-empty">No shooters found.</p>';
}

function renderCompareStats() {
    const section = document.getElementById('compareSection');
    if (!compareShooter) {
        section.hidden = true;
        return;
    }

    section.hidden = false;
    document.getElementById('compareShooterName').textContent = compareShooter.name;

    const stats = currentSeasonStatsRows.find(s => s.shooter_id === compareShooter.shooter_id) || null;
    renderStatTiles('compareStatTiles', stats);
}

async function selectCompareShooter(shooterId) {
    const shooter = compareRoster.find(s => s.shooter_id === shooterId);
    if (!shooter) return;
    compareShooter = shooter;

    document.getElementById('compareSearchInput').value = '';
    document.getElementById('compareResults').hidden = true;
    document.getElementById('compareResults').innerHTML = '';
    document.getElementById('compareSearch').hidden = true;

    renderCompareStats();
    await Promise.all([loadSeason(), loadAllTimeCharts()]);
}

async function clearCompareShooter() {
    compareShooter = null;
    compareHistoryRows = [];
    compareAllTimeHistory = [];
    renderCompareStats();
    await Promise.all([loadSeason(), loadAllTimeCharts()]);
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wireCompare() {
    document.getElementById('compareToggle').addEventListener('click', () => {
        const search = document.getElementById('compareSearch');
        search.hidden = !search.hidden;
        if (!search.hidden) document.getElementById('compareSearchInput').focus();
    });

    document.getElementById('compareSearchInput').addEventListener('input', (e) => {
        renderCompareResults(e.target.value);
    });

    document.getElementById('compareResults').addEventListener('click', (e) => {
        const btn = e.target.closest('.compare-result');
        if (!btn) return;
        selectCompareShooter(btn.dataset.id);
    });

    document.getElementById('compareClear').addEventListener('click', clearCompareShooter);

    document.getElementById('previousSeasonToggle').addEventListener('click', async (e) => {
        showPreviousSeason = !showPreviousSeason;
        e.currentTarget.setAttribute('aria-pressed', String(showPreviousSeason));
        await loadSeason();
    });
}

async function loadSeason() {
    const season = seasons[seasonIndex];
    const label = document.getElementById('seasonLabel');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    label.textContent = (season ? season.name : 'Season') + ' Results';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    document.getElementById('matchHistoryTable').innerHTML = `<tr><td colspan="${matchTableColCount()}">Loading&hellip;</td></tr>`;
    renderStatTiles('statTiles', null);

    const previousSeason = showPreviousSeason ? (seasons[seasonIndex - 1] || null) : null;

    if (!season) {
        historyRows = [];
        compareHistoryRows = [];
        previousSeasonHistoryRows = [];
        comparePreviousSeasonHistoryRows = [];
        currentSeasonStatsRows = [];
        renderCompareStats();
        document.getElementById('shooterColumnHead').hidden = !compareShooter;
        document.getElementById('matchHistoryTable').innerHTML = `<tr><td colspan="${matchTableColCount()}">No results available.</td></tr>`;
        renderShotPatternChart('shotPatternChart', 'shotPatternEmpty', [{ rows: [], label: currentShooter.name, color: COMPARE_PRIMARY_COLOR }]);
        renderRunningAverageChart('averageChartSeason', 'averageEmptySeason', [{ rows: [], label: currentShooter.name, color: COMPARE_PRIMARY_COLOR }]);
        return;
    }

    const [seasonStatsRows, history, compareHistory, previousSeasonHistory, comparePreviousSeasonHistory] = await Promise.all([
        NADARL.fetchShooterStatsForSeason(season.id),
        NADARL.fetchShooterMatchHistory(currentShooter.id, season.id),
        compareShooter ? NADARL.fetchShooterMatchHistory(compareShooter.shooter_id, season.id) : Promise.resolve([]),
        previousSeason ? NADARL.fetchShooterMatchHistory(currentShooter.id, previousSeason.id) : Promise.resolve([]),
        (compareShooter && previousSeason) ? NADARL.fetchShooterMatchHistory(compareShooter.shooter_id, previousSeason.id) : Promise.resolve([])
    ]);

    currentSeasonStatsRows = seasonStatsRows;
    const stats = seasonStatsRows.find(s => s.shooter_id === currentShooter.id) || null;
    renderStatTiles('statTiles', stats);
    renderCompareStats();

    historyRows = history;
    compareHistoryRows = compareHistory;
    previousSeasonHistoryRows = previousSeasonHistory;
    comparePreviousSeasonHistoryRows = comparePreviousSeasonHistory;
    sortKey = null;
    sortDir = 1;
    updateSortIndicators();
    renderHistoryTable();

    const seasonSeries = [
        { rows: historyRows, label: currentShooter.name, color: COMPARE_PRIMARY_COLOR },
        ...(compareShooter ? [{ rows: compareHistoryRows, label: compareShooter.name, color: COMPARE_SECONDARY_COLOR }] : []),
        ...(previousSeason ? [{ rows: previousSeasonHistoryRows, label: `${currentShooter.name} (${previousSeason.name})`, color: PREVIOUS_SEASON_COLOR, dashed: true }] : []),
        ...(compareShooter && previousSeason ? [{ rows: comparePreviousSeasonHistoryRows, label: `${compareShooter.name} (${previousSeason.name})`, color: COMPARE_PREVIOUS_SEASON_COLOR, dashed: true }] : [])
    ];
    renderShotPatternChart('shotPatternChart', 'shotPatternEmpty', seasonSeries);
    renderRunningAverageChart('averageChartSeason', 'averageEmptySeason', seasonSeries);
}

async function loadAllTimeCharts() {
    const [allTimeHistory, compareAllTime] = await Promise.all([
        NADARL.fetchShooterMatchHistoryAllTime(currentShooter.id),
        compareShooter ? NADARL.fetchShooterMatchHistoryAllTime(compareShooter.shooter_id) : Promise.resolve([])
    ]);
    compareAllTimeHistory = compareAllTime;

    const allTimeSeries = [
        { rows: allTimeHistory, label: currentShooter.name, color: COMPARE_PRIMARY_COLOR },
        ...(compareShooter ? [{ rows: compareAllTimeHistory, label: compareShooter.name, color: COMPARE_SECONDARY_COLOR }] : [])
    ];
    renderShotPatternChart('shotPatternChartAllTime', 'shotPatternEmptyAllTime', allTimeSeries);

    allTimeAverageRows = allTimeHistory;
    allTimeAveragePage = Math.max(0, Math.ceil(allTimeHistory.length / AVERAGE_ALL_TIME_PAGE_SIZE) - 1);
    renderAverageAllTimePage();
}

async function initShooterPage() {
    const params = new URLSearchParams(window.location.search);
    const shooterId = params.get('id') || '';

    const shooter = await NADARL.fetchShooterById(shooterId);
    if (!shooter) {
        document.querySelector('.container').innerHTML =
            '<div class="no-team">Shooter not found. Please go back to <a href="table.html">League Table</a>.</div>';
        return;
    }
    currentShooter = shooter;

    document.title = `${shooter.name} - Newport & District Air Rifle League`;
    document.getElementById('shooterName').textContent = shooter.name;

    const roleEl = document.getElementById('shooterRole');
    if (shooter.role) {
        roleEl.hidden = false;
        roleEl.textContent = shooter.role.charAt(0).toUpperCase() + shooter.role.slice(1);
    }

    const team = shooter.team;
    const teamLink = document.getElementById('shooterTeamLink');
    const backLink = document.getElementById('backLink');
    if (team) {
        teamLink.textContent = team.name;
        teamLink.href = `team.html?team=${encodeURIComponent(team.name)}`;
        backLink.href = teamLink.href;
        backLink.textContent = `← Back to ${team.name}`;
    }

    const logoImg = document.getElementById('teamLogo');
    const fallback = document.getElementById('logoFallback');
    if (team) {
        logoImg.alt = `${team.name} logo`;
        logoImg.onerror = function () {
            this.hidden = true;
            fallback.style.display = 'flex';
            fallback.textContent = team.name.split(' ').map(w => w[0]).join('');
        };
        logoImg.hidden = false;
        logoImg.src = `../Images/teams/${team.slug}.png`;
    }

    seasons = await NADARL.fetchSeasons();
    const currentSeason = NADARL.pickCurrentSeason(seasons);
    seasonIndex = currentSeason ? seasons.indexOf(currentSeason) : seasons.length - 1;

    document.getElementById('seasonPrev').addEventListener('click', () => {
        if (seasonIndex > 0) { seasonIndex--; loadSeason(); }
    });
    document.getElementById('seasonNext').addEventListener('click', () => {
        if (seasonIndex < seasons.length - 1) { seasonIndex++; loadSeason(); }
    });

    document.getElementById('matchHistoryHead').addEventListener('click', function (e) {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        const key = th.dataset.sort;
        if (sortKey === key) {
            sortDir *= -1;
        } else {
            sortKey = key;
            sortDir = key === 'opponent_name' ? 1 : -1;
        }
        updateSortIndicators();
        renderHistoryTable();
    });

    document.getElementById('averageAllTimePagePrev').addEventListener('click', () => {
        allTimeAveragePage--;
        renderAverageAllTimePage();
    });
    document.getElementById('averageAllTimePageNext').addEventListener('click', () => {
        allTimeAveragePage++;
        renderAverageAllTimePage();
    });

    wireCompare();
    NADARL.fetchAllShooterStats().then(rows => { compareRoster = rows; });

    await Promise.all([loadSeason(), loadAllTimeCharts()]);
}

document.addEventListener('DOMContentLoaded', initShooterPage);

function checkViewportWidth() {
    const overlay = document.getElementById('rotateOverlay');
    if (!overlay) return;
    if (window.innerWidth < 768) {
        overlay.classList.add('visible');
        document.body.style.overflow = 'hidden';
    }
}

function dismissRotateOverlay() {
    const overlay = document.getElementById('rotateOverlay');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', function () {
    checkViewportWidth();
    document.getElementById('rotateDismiss').addEventListener('click', dismissRotateOverlay);
});
