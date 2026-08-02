let seasons = [];
let seasonIndex = 0;

const STANDINGS_TABLES = [
    { half: 1, league: 'A', tbodyId: 'standingsA1' },
    { half: 1, league: 'B', tbodyId: 'standingsB1' },
    { half: 2, league: 'A', tbodyId: 'standingsA2' },
    { half: 2, league: 'B', tbodyId: 'standingsB2' }
];

function renderStats(stats) {
    const tbody = document.getElementById('leagueTable');

    if (!stats.length) {
        tbody.innerHTML = '<tr><td colspan="9">No statistics available for this season yet.</td></tr>';
        return;
    }

    let html = '';
    stats.forEach((shooter, index) => {
        html += `<tr data-team="${shooter.team_name}">
            <td>${index + 1}</td>
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

    label.textContent = (season ? season.name : 'Season') + ' Standings';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    const tbody = document.getElementById('leagueTable');
    tbody.innerHTML = '<tr><td colspan="9">Loading…</td></tr>';
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
        document.getElementById('seasonLabel').textContent = 'Season Standings';
        prevButton.disabled = true;
        nextButton.disabled = true;
        tbody.innerHTML = '<tr><td colspan="9">No statistics available yet.</td></tr>';
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
