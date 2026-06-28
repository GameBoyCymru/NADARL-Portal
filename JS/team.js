async function initTeamPage() {
    const params = new URLSearchParams(window.location.search);
    const teamName = params.get('team') || '';

    const team = await NADARL.fetchTeamByName(teamName);

    if (!team) {
        document.querySelector('.container').innerHTML = '<div class="no-team">Team not found. Please go back to <a href="teams.html">Teams</a>.</div>';
        return;
    }

    const stats = await NADARL.fetchTeamShootersStats(team.id);

    document.title = `${team.name} - Newport & District Air Rifle League`;
    document.getElementById('teamName').textContent = team.name;
    document.getElementById('teamVenue').textContent = `Venue: ${team.venue}`;
    document.getElementById('teamSubtitle').textContent = team.name;

    const logoImg = document.getElementById('teamLogo');
    const fallback = document.getElementById('logoFallback');
    logoImg.src = `../Images/teams/${team.slug}.png`;
    logoImg.alt = `${team.name} logo`;
    logoImg.onerror = function () {
        this.style.display = 'none';
        fallback.style.display = 'flex';
        fallback.textContent = team.name.split(' ').map(w => w[0]).join('');
    };

    const tbody = document.getElementById('shootersTable');
    if (!stats.length) {
        tbody.innerHTML = '<tr><td colspan="5">No shooter statistics available yet.</td></tr>';
        return;
    }

    let html = '';
    stats.forEach(shooter => {
        const roleAttr = shooter.role ? `<span class="shooter-role">${shooter.role.charAt(0).toUpperCase() + shooter.role.slice(1)}</span>` : '';
        html += `<tr>
            <td class="shooter-name">${shooter.name}${roleAttr}</td>
            <td class="score-cell">${shooter.best}</td>
            <td class="score-cell">${shooter.best}</td>
            <td class="score-cell">${shooter.tens}</td>
            <td class="score-cell">${Number(shooter.average).toFixed(1)}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', initTeamPage);

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
