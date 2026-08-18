let currentShooter = null;
let seasons = [];
let seasonIndex = 0;

let historyRows = [];
let sortKey = null;
let sortDir = 1;

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

function sortedHistory() {
    if (!sortKey) return historyRows;
    return historyRows.slice().sort((a, b) => compareValues(a[sortKey], b[sortKey]) * sortDir);
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

function renderHistoryTable() {
    const tbody = document.getElementById('matchHistoryTable');
    const rows = sortedHistory();

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6">No results for this season yet.</td></tr>';
        return;
    }

    let html = '';
    rows.forEach(row => {
        html += `<tr>
            <td>${formatDate(row.date)}</td>
            <td class="team-cell">${row.opponent_name}</td>
            <td class="score-cell">${row.is_home ? 'Home' : 'Away'}</td>
            <td class="score-cell">${row.total}</td>
            <td class="score-cell">${row.tens}</td>
            <td class="shots-cell">${(row.shots || []).join(', ')}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

const shotPatternCharts = {};

function renderShotPatternChart(canvasId, emptyId, rows) {
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);

    const shotCount = rows.reduce((max, r) => Math.max(max, (r.shots || []).length), 0);
    const averages = [];
    for (let i = 0; i < shotCount; i++) {
        const values = rows.map(r => (r.shots || [])[i]).filter(v => v != null);
        averages.push(values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
    }

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

    shotPatternCharts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: averages.map((_, i) => `Shot ${i + 1}`),
            datasets: [{
                data: averages,
                borderColor: '#d4a017',
                backgroundColor: '#d4a017',
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: '#d4a017',
                pointBorderColor: '#d4a017',
                tension: 0,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `Average: ${ctx.parsed.y.toFixed(2)}`
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

function renderRunningAverageChart(canvasId, emptyId, rows) {
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);

    if (shotPatternCharts[canvasId]) {
        shotPatternCharts[canvasId].destroy();
        delete shotPatternCharts[canvasId];
    }

    if (!rows.length) {
        canvas.hidden = true;
        empty.hidden = false;
        return;
    }
    canvas.hidden = false;
    empty.hidden = true;

    let runningTotal = 0;
    const runningAverages = rows.map((row, i) => {
        runningTotal += row.total;
        return runningTotal / (i + 1);
    });

    shotPatternCharts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: rows.map(row => formatDate(row.date)),
            datasets: [{
                data: runningAverages,
                borderColor: '#d4a017',
                backgroundColor: '#d4a017',
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#d4a017',
                pointBorderColor: '#d4a017',
                tension: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `Average: ${ctx.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#a0a0a0', maxRotation: 0, autoSkip: true },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' }
                },
                y: {
                    min: 0,
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' }
                }
            }
        }
    });
}

function renderStatTiles(stats) {
    const container = document.getElementById('statTiles');
    const tiles = [
        { label: 'Matches Played', value: stats ? stats.matches_played : 0 },
        { label: 'Personal Best', value: stats ? stats.best : 0 },
        { label: 'Season Best', value: stats ? stats.season_best : 0 },
        { label: "10's", value: stats ? stats.tens : 0 },
        { label: 'Average', value: stats ? Number(stats.average).toFixed(1) : '0.0' },
        { label: 'Handicap', value: stats && stats.handicap != null ? stats.handicap : 'N/A' }
    ];
    container.innerHTML = tiles.map(t => `
        <div class="stat-tile">
            <div class="stat-tile-value">${t.value}</div>
            <div class="stat-tile-label">${t.label}</div>
        </div>
    `).join('');
}

async function loadSeason() {
    const season = seasons[seasonIndex];
    const label = document.getElementById('seasonLabel');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    label.textContent = (season ? season.name : 'Season') + ' Results';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    document.getElementById('matchHistoryTable').innerHTML = '<tr><td colspan="6">Loading&hellip;</td></tr>';
    renderStatTiles(null);

    if (!season) {
        historyRows = [];
        document.getElementById('matchHistoryTable').innerHTML = '<tr><td colspan="6">No results available.</td></tr>';
        renderShotPatternChart('shotPatternChart', 'shotPatternEmpty', []);
        renderRunningAverageChart('averageChartSeason', 'averageEmptySeason', []);
        return;
    }

    const [seasonStatsRows, history] = await Promise.all([
        NADARL.fetchShooterStatsForSeason(season.id),
        NADARL.fetchShooterMatchHistory(currentShooter.id, season.id)
    ]);

    const stats = seasonStatsRows.find(s => s.shooter_id === currentShooter.id) || null;
    renderStatTiles(stats);

    historyRows = history;
    sortKey = null;
    sortDir = 1;
    updateSortIndicators();
    renderHistoryTable();
    renderShotPatternChart('shotPatternChart', 'shotPatternEmpty', historyRows);
    renderRunningAverageChart('averageChartSeason', 'averageEmptySeason', historyRows);
}

async function loadAllTimeCharts() {
    const allTimeHistory = await NADARL.fetchShooterMatchHistoryAllTime(currentShooter.id);
    renderShotPatternChart('shotPatternChartAllTime', 'shotPatternEmptyAllTime', allTimeHistory);
    renderRunningAverageChart('averageChartAllTime', 'averageEmptyAllTime', allTimeHistory);
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
