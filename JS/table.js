let seasons = [];
let seasonIndex = 0;

// TODO: bump back up to 50 once the league has enough shooters to test paging properly.
const STATS_PAGE_SIZE = 30;
let statsRows = [];
let statsPage = 0;
let statsSortKey = null;
let statsSortDir = 1;

const STANDINGS_TABLES = [
    { half: 1, league: 'A', tbodyId: 'standingsA1' },
    { half: 1, league: 'B', tbodyId: 'standingsB1' },
    { half: 2, league: 'A', tbodyId: 'standingsA2' },
    { half: 2, league: 'B', tbodyId: 'standingsB2' }
];

function renderStats(stats) {
    statsRows = stats;
    assignStatsRanks();
    statsPage = 0;
    if (statsSortKey) {
        sortStatsRows();
    }
    renderStatsPage();
}

// Pos always reflects the shooter's rank by average (highest first),
// independent of whatever column the table is currently sorted by.
function assignStatsRanks() {
    const byAverage = statsRows.slice().sort((a, b) => Number(b.average) - Number(a.average));
    byAverage.forEach((shooter, index) => {
        shooter.rank = index + 1;
    });
}

function sortStatsRows() {
    if (statsSortKey === 'pos') {
        statsRows.sort((a, b) => (a.rank - b.rank) * statsSortDir);
        return;
    }

    statsRows.sort((a, b) => {
        const aVal = a[statsSortKey];
        const bVal = b[statsSortKey];

        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        let result;
        if (typeof aVal === 'string' || typeof bVal === 'string') {
            result = String(aVal).localeCompare(String(bVal));
        } else {
            result = Number(aVal) - Number(bVal);
        }
        return result * statsSortDir;
    });
}

function updateStatsSortIndicators() {
    document.querySelectorAll('#leagueTableHead th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === statsSortKey) {
            th.classList.add(statsSortDir === 1 ? 'sort-asc' : 'sort-desc');
        }
    });
}

function setStatsPaginationVisible(visible) {
    document.getElementById('statsPaginationTop').style.display = visible ? 'flex' : 'none';
    document.getElementById('statsPaginationBottom').style.display = visible ? 'flex' : 'none';
}

function renderStatsPage() {
    const tbody = document.getElementById('leagueTable');

    if (!statsRows.length) {
        tbody.innerHTML = '<tr><td colspan="9">No statistics available for this season yet.</td></tr>';
        setStatsPaginationVisible(false);
        return;
    }

    const pageCount = Math.ceil(statsRows.length / STATS_PAGE_SIZE);
    const start = statsPage * STATS_PAGE_SIZE;
    const pageRows = statsRows.slice(start, start + STATS_PAGE_SIZE);

    let html = '';
    pageRows.forEach((shooter) => {
        html += `<tr data-team="${shooter.team_name}">
            <td>${shooter.rank}</td>
            <td class="shooter-name">${shooter.name}</td>
            <td class="team-cell">${shooter.team_name}</td>
            <td class="score-cell">${shooter.matches_played}</td>
            <td class="score-cell">${shooter.best}</td>
            <td class="score-cell">${shooter.season_best}</td>
            <td class="score-cell">${shooter.tens}</td>
            <td class="score-cell">${Number(shooter.average).toFixed(1)}</td>
            <td class="score-cell">${shooter.handicap == null ? 'N/A' : shooter.handicap}</td>
        </tr>`;
    });

    tbody.innerHTML = html;

    setStatsPaginationVisible(pageCount > 1);
    document.querySelectorAll('.stats-page-label').forEach(label => {
        label.textContent = `Page ${statsPage + 1} of ${pageCount}`;
    });
    document.querySelectorAll('.stats-prev').forEach(button => {
        button.disabled = statsPage <= 0;
    });
    document.querySelectorAll('.stats-next').forEach(button => {
        button.disabled = statsPage >= pageCount - 1;
    });
}

// Sorted by points desc, then average desc, then team name - standard
// league-table tie-break order.
function sortStandings(rows) {
    return rows.sort((a, b) =>
        Number(b.points) - Number(a.points) ||
        Number(b.average) - Number(a.average) ||
        String(a.team_name).localeCompare(String(b.team_name))
    );
}

function renderStandingsTable(tbodyId, rows) {
    const tbody = document.getElementById(tbodyId);

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7">No results for this season yet.</td></tr>';
        return;
    }

    let html = '';
    sortStandings(rows).forEach(team => {
        html += `<tr>
            <td class="team-cell">${team.team_name}</td>
            <td class="score-cell">${team.matches_played}</td>
            <td class="score-cell">${team.wins}</td>
            <td class="score-cell">${team.draws}</td>
            <td class="score-cell">${team.losses}</td>
            <td class="score-cell">${Number(team.average).toFixed(1)}</td>
            <td class="score-cell">${team.points}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

function renderTeamStandings(rows) {
    STANDINGS_TABLES.forEach(({ half, league, tbodyId }) => {
        renderStandingsTable(tbodyId, rows.filter(r => r.half === half && r.league === league));
    });
}

async function loadSeason() {
    const season = seasons[seasonIndex];
    const label = document.getElementById('seasonLabel');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    label.textContent = season ? season.name : 'Season';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    const tbody = document.getElementById('leagueTable');
    tbody.innerHTML = '<tr><td colspan="9">Loading…</td></tr>';
    setStatsPaginationVisible(false);
    STANDINGS_TABLES.forEach(({ tbodyId }) => {
        document.getElementById(tbodyId).innerHTML = '<tr><td colspan="7">Loading…</td></tr>';
    });

    const [stats, standings] = await Promise.all([
        season ? NADARL.fetchShooterStatsForSeason(season.id) : Promise.resolve([]),
        season ? NADARL.fetchTeamStandingsForSeason(season.id) : Promise.resolve([])
    ]);
    renderStats(stats);
    renderTeamStandings(standings);
}

async function initTablePage() {
    const tbody = document.getElementById('leagueTable');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    seasons = await NADARL.fetchSeasons();

    if (!seasons.length) {
        document.getElementById('seasonLabel').textContent = '';
        prevButton.disabled = true;
        nextButton.disabled = true;
        tbody.innerHTML = '<tr><td colspan="9">No statistics available yet.</td></tr>';
        setStatsPaginationVisible(false);
        STANDINGS_TABLES.forEach(({ tbodyId }) => {
            document.getElementById(tbodyId).innerHTML = '<tr><td colspan="7">No results available yet.</td></tr>';
        });
        return;
    }

    const currentSeason = NADARL.pickCurrentSeason(seasons);
    seasonIndex = currentSeason ? seasons.indexOf(currentSeason) : seasons.length - 1;

    prevButton.addEventListener('click', () => {
        if (seasonIndex > 0) { seasonIndex--; loadSeason(); }
    });
    nextButton.addEventListener('click', () => {
        if (seasonIndex < seasons.length - 1) { seasonIndex++; loadSeason(); }
    });

    document.querySelectorAll('.stats-prev').forEach(button => {
        button.addEventListener('click', () => {
            if (statsPage > 0) { statsPage--; renderStatsPage(); }
        });
    });
    document.querySelectorAll('.stats-next').forEach(button => {
        button.addEventListener('click', () => {
            if (statsPage < Math.ceil(statsRows.length / STATS_PAGE_SIZE) - 1) { statsPage++; renderStatsPage(); }
        });
    });

    document.getElementById('leagueTableHead').addEventListener('click', function (e) {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        const key = th.dataset.sort;
        if (statsSortKey === key) {
            statsSortDir *= -1;
        } else {
            statsSortKey = key;
            // Text columns feel natural sorting A-Z first; numeric stat
            // columns feel natural sorting highest-first.
            statsSortDir = (key === 'name' || key === 'team_name') ? 1 : -1;
        }
        sortStatsRows();
        updateStatsSortIndicators();
        statsPage = 0;
        renderStatsPage();
    });

    tbody.addEventListener('click', function (e) {
        const cell = e.target.closest('.team-cell');
        if (!cell) return;
        const team = cell.closest('tr').dataset.team;
        const highlighted = tbody.querySelectorAll('tr.team-highlight');
        const isAlreadyHighlighted = cell.closest('tr').classList.contains('team-highlight');
        highlighted.forEach(row => row.classList.remove('team-highlight'));
        if (!isAlreadyHighlighted) {
            tbody.querySelectorAll('tr').forEach(row => {
                if (row.dataset.team === team) row.classList.add('team-highlight');
            });
        }
    });

    await loadSeason();
}

document.addEventListener('DOMContentLoaded', initTablePage);

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
