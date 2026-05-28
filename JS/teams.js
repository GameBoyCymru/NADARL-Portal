const teamsData = [
    {
        name: 'Belle Vue Rifles',
        venue: 'Belle Vue',
        slug: 'belle-vue-rifles'
    },
    {
        name: 'Isca Rifles',
        venue: 'Isca',
        slug: 'isca-rifles'
    },
    {
        name: 'Newport Eagles',
        venue: 'Newport',
        slug: 'newport-eagles'
    },
    {
        name: 'Pantmawr Rifles',
        venue: 'Pantmawr',
        slug: 'pantmawr-rifles'
    },
    {
        name: 'Rumney Rifles',
        venue: 'Rumney',
        slug: 'rumney-rifles'
    }
];

function renderTeamCards() {
    const grid = document.getElementById('teamsGrid');
    if (!grid) return;

    let html = '';
    teamsData.forEach(team => {
        html += `
            <a href="team.html?team=${encodeURIComponent(team.name)}" class="team-card-link">
                <div class="team-card">
                    <div class="team-badge-placeholder">
                        <img src="../Images/teams/${team.slug}.png" alt="${team.name} logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <span class="badge-fallback" style="display:none;">${team.name.split(' ').map(w => w[0]).join('')}</span>
                    </div>
                    <h3 class="team-name">${team.name}</h3>
                    <p class="team-venue">${team.venue}</p>
                </div>
            </a>
        `;
    });

    grid.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', renderTeamCards);
