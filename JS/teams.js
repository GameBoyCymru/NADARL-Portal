async function renderTeamCards() {
    const grid = document.getElementById('teamsGrid');
    if (!grid) return;

    const teams = await NADARL.fetchTeams();

    if (!teams.length) {
        grid.innerHTML = '<p class="no-fixtures">No teams found.</p>';
        return;
    }

    let html = '';
    teams.forEach(team => {
        html += `
            <a href="team.html?team=${encodeURIComponent(team.name)}" class="team-card-link">
                <div class="team-card">
                    <div class="team-badge-placeholder">
                        <img src="../Images/teams/${team.slug}.png" alt="${team.name} logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <span class="badge-fallback" style="display:none;">${team.name.split(' ').map(w => w[0]).join('')}</span>
                    </div>
                    <p class="team-venue">${team.venue}</p>
                </div>
            </a>
        `;
    });

    grid.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', renderTeamCards);
