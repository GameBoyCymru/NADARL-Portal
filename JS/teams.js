function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
                        <img class="team-badge-img" src="../Images/teams/${team.slug}.png" alt="${escapeHtml(team.name)} logo">
                        <span class="badge-fallback" style="display:none;">${escapeHtml(team.name.split(' ').map(w => w[0]).join(''))}</span>
                    </div>
                    <p class="team-name">${escapeHtml(team.name)}</p>
                    <p class="team-venue">${escapeHtml(team.venue)}</p>
                </div>
            </a>
        `;
    });

    grid.innerHTML = html;
    grid.querySelectorAll('.team-badge-img').forEach(img => {
        img.onerror = () => {
            img.style.display = 'none';
            img.nextElementSibling.style.display = 'flex';
        };
    });
    equalizeCardHeights(grid);
}

// Grid rows only equalize heights within the same row, so a team with a
// longer venue only stretches the cards next to it. Measure the tallest
// card and apply it to all of them so every box matches regardless of row.
function equalizeCardHeights(grid) {
    const cards = grid.querySelectorAll('.team-card');
    if (!cards.length) return;

    const sync = () => {
        cards.forEach(card => { card.style.minHeight = ''; });
        const max = Math.max(...Array.from(cards).map(card => card.offsetHeight));
        cards.forEach(card => { card.style.minHeight = `${max}px`; });
    };

    requestAnimationFrame(sync);

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(sync, 150);
    });
}

document.addEventListener('DOMContentLoaded', renderTeamCards);
