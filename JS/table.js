async function initTablePage() {
    const stats = await NADARL.fetchAllShooterStats();
    const tbody = document.getElementById('leagueTable');

    if (!stats.length) {
        tbody.innerHTML = '<tr><td colspan="7">No statistics available yet.</td></tr>';
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
}

document.addEventListener('DOMContentLoaded', initTablePage);
