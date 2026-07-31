let seasons = [];
let seasonIndex = 0;

function renderStats(stats) {
    const tbody = document.getElementById('leagueTable');

    if (!stats.length) {
        tbody.innerHTML = '<tr><td colspan="7">No statistics available for this season yet.</td></tr>';
        return;
    }

    let html = '';
    stats.forEach((shooter, index) => {
        html += `<tr data-team="${shooter.team_name}">
            <td>${index + 1}</td>
            <td class="shooter-name">${shooter.name}</td>
            <td class="team-cell">${shooter.team_name}</td>
            <td class="score-cell">${shooter.best}</td>
            <td class="score-cell">${shooter.season_best}</td>
            <td class="score-cell">${shooter.tens}</td>
            <td class="score-cell">${Number(shooter.average).toFixed(1)}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

async function loadSeason() {
    const season = seasons[seasonIndex];
    const label = document.getElementById('seasonLabel');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    label.textContent = (season ? season.name : 'Season') + ' Averages';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    const tbody = document.getElementById('leagueTable');
    tbody.innerHTML = '<tr><td colspan="7">Loading…</td></tr>';

    const stats = season ? await NADARL.fetchShooterStatsForSeason(season.id) : [];
    renderStats(stats);
}

async function initTablePage() {
    const tbody = document.getElementById('leagueTable');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    seasons = await NADARL.fetchSeasons();

    if (!seasons.length) {
        document.getElementById('seasonLabel').textContent = 'Season Averages';
        prevButton.disabled = true;
        nextButton.disabled = true;
        tbody.innerHTML = '<tr><td colspan="7">No statistics available yet.</td></tr>';
        return;
    }

    const currentSeason = seasons.find(s => s.is_current);
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
