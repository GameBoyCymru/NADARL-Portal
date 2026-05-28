const teamShooters = {
    'Belle Vue Rifles': ['J. Thompson', 'M. Richards', 'D. Williams', 'A. Davies', 'R. Evans', 'S. Morgan', 'K. Hughes', 'P. Jones', 'L. Clarke'],
    'Pantmawr Rifles': ['G. Hopkins', 'L. Bennett', 'C. Griffiths', 'T. Edwards', 'N. Powell', 'H. Morris', 'B. Clarke', 'W. Rees', 'F. Owen'],
    'Rumney Rifles': ['F. Webb', 'O. Perry', 'E. Cox', 'I. Kelly', 'J. Russell', 'M. Grant', 'D. Wallace', 'R. Spencer', 'A. Blake'],
    'Newport Eagles': ['A. Adams', 'C. Baker', 'E. Carter', 'G. Dixon', 'K. Ellis', 'M. Fox', 'P. Green', 'S. Hart', 'T. James'],
    'Isca Rifles': ['T. Idris', 'V. Jones', 'W. King', 'X. Lloyd', 'Y. Miles', 'Z. Newman', 'A. Owens', 'B. Price', 'C. Ross']
};

const teamInfo = {
    'Belle Vue Rifles': { venue: 'Belle Vue', slug: 'belle-vue-rifles' },
    'Isca Rifles': { venue: 'Isca', slug: 'isca-rifles' },
    'Newport Eagles': { venue: 'Newport', slug: 'newport-eagles' },
    'Pantmawr Rifles': { venue: 'Pantmawr', slug: 'pantmawr-rifles' },
    'Rumney Rifles': { venue: 'Rumney', slug: 'rumney-rifles' }
};

const teamRoles = {
    'Belle Vue Rifles': { captain: 'J. Thompson', secretary: 'M. Richards', treasurer: 'D. Williams' },
    'Pantmawr Rifles': { captain: 'G. Hopkins', secretary: 'L. Bennett', treasurer: 'C. Griffiths' },
    'Rumney Rifles': { captain: 'F. Webb', secretary: 'O. Perry', treasurer: 'E. Cox' },
    'Newport Eagles': { captain: 'A. Adams', secretary: 'C. Baker', treasurer: 'E. Carter' },
    'Isca Rifles': { captain: 'T. Idris', secretary: 'V. Jones', treasurer: 'W. King' }
};

const roleOrder = { captain: 0, secretary: 1, treasurer: 2 };

const fixtures = [
    { date: '2026-05-28', homeTeam: 'Belle Vue Rifles', awayTeam: 'Pantmawr Rifles', venue: 'Belle Vue' },
    { date: '2026-05-28', homeTeam: 'Rumney Rifles', awayTeam: 'Newport Eagles', venue: 'Rumney' },
    { date: '2026-05-27', homeTeam: 'Isca Rifles', awayTeam: 'Belle Vue Rifles', venue: 'Isca' },
    { date: '2026-05-27', homeTeam: 'Pantmawr Rifles', awayTeam: 'Rumney Rifles', venue: 'Pantmawr' },
    { date: '2026-06-02', homeTeam: 'Newport Eagles', awayTeam: 'Isca Rifles', venue: 'Newport' },
    { date: '2026-06-02', homeTeam: 'Belle Vue Rifles', awayTeam: 'Rumney Rifles', venue: 'Belle Vue' },
    { date: '2026-06-09', homeTeam: 'Pantmawr Rifles', awayTeam: 'Newport Eagles', venue: 'Pantmawr' },
    { date: '2026-06-09', homeTeam: 'Isca Rifles', awayTeam: 'Rumney Rifles', venue: 'Isca' },
    { date: '2026-06-16', homeTeam: 'Belle Vue Rifles', awayTeam: 'Newport Eagles', venue: 'Belle Vue' },
    { date: '2026-06-16', homeTeam: 'Rumney Rifles', awayTeam: 'Isca Rifles', venue: 'Rumney' },
    { date: '2026-06-23', homeTeam: 'Pantmawr Rifles', awayTeam: 'Isca Rifles', venue: 'Pantmawr' },
    { date: '2026-06-23', homeTeam: 'Newport Eagles', awayTeam: 'Rumney Rifles', venue: 'Newport' }
];

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function seededRandom(s) {
    let x = Math.sin(s) * 10000;
    return x - Math.floor(x);
}

function generateMatchTotals(teamName, opponent, date, isHome) {
    const shooters = teamShooters[teamName];
    if (!shooters) return [];

    const seed = hashCode(teamName + opponent + date);
    const teamSeed = seed + (isHome ? 0 : 1000);

    return shooters.map((name, i) => {
        const scores = [];
        for (let r = 0; r < 7; r++) {
            const rng = seededRandom(teamSeed + i * 100 + r);
            scores.push(Math.floor(7 + rng * 4));
        }
        const total = scores.reduce((sum, s) => sum + s, 0);
        const tens = scores.filter(s => s === 10).length;
        return { name, total, tens };
    });
}

function getTeamStats(teamName) {
    const teamFixtures = fixtures.filter(f =>
        (f.homeTeam === teamName || f.awayTeam === teamName) && f.awayTeam !== 'BYE'
    );

    const shooterMatchTotals = {};
    const shooterTens = {};
    const shooters = teamShooters[teamName] || [];
    shooters.forEach(s => {
        shooterMatchTotals[s] = [];
        shooterTens[s] = 0;
    });

    teamFixtures.forEach(fixture => {
        const isHome = fixture.homeTeam === teamName;
        const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
        const matchTotals = generateMatchTotals(teamName, opponent, fixture.date, isHome);
        matchTotals.forEach(({ name, total, tens }) => {
            if (shooterMatchTotals[name]) {
                shooterMatchTotals[name].push(total);
                shooterTens[name] += tens;
            }
        });
    });

    const stats = shooters.map(name => {
        const totals = shooterMatchTotals[name];
        const best = totals.length > 0 ? Math.max(...totals) : 0;
        const seasonBest = best;
        const average = totals.length > 0
            ? (totals.reduce((sum, t) => sum + t, 0) / totals.length).toFixed(1)
            : '0.0';

        const roles = teamRoles[teamName] || {};
        let role = '';
        if (roles.captain === name) role = 'Captain';
        else if (roles.secretary === name) role = 'Secretary';
        else if (roles.treasurer === name) role = 'Treasurer';

        return {
            name,
            best,
            seasonBest,
            average,
            matchesPlayed: totals.length,
            tens: shooterTens[name],
            role
        };
    });

    stats.sort((a, b) => {
        const aRoleIdx = a.role ? roleOrder[a.role.toLowerCase()] : 3;
        const bRoleIdx = b.role ? roleOrder[b.role.toLowerCase()] : 3;
        if (aRoleIdx !== bRoleIdx) return aRoleIdx - bRoleIdx;
        return a.name.localeCompare(b.name);
    });
    return stats;
}

function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        team: params.get('team') || ''
    };
}

function initTeamPage() {
    const params = getQueryParams();
    const teamName = params.team;

    if (!teamName || !teamShooters[teamName]) {
        document.querySelector('.container').innerHTML = '<div class="no-team">Team not found. Please go back to <a href="teams.html">Teams</a>.</div>';
        return;
    }

    const info = teamInfo[teamName];
    const stats = getTeamStats(teamName);

    document.title = `${teamName} - Newport & District Air Rifle League`;
    document.getElementById('teamName').textContent = teamName;
    document.getElementById('teamVenue').textContent = `Venue: ${info.venue}`;
    document.getElementById('teamSubtitle').textContent = teamName;

    const logoImg = document.getElementById('teamLogo');
    const fallback = document.getElementById('logoFallback');
    logoImg.src = `../Images/teams/${info.slug}.png`;
    logoImg.alt = `${teamName} logo`;
    logoImg.onerror = function () {
        this.style.display = 'none';
        fallback.style.display = 'flex';
        fallback.textContent = teamName.split(' ').map(w => w[0]).join('');
    };

    const tbody = document.getElementById('shootersTable');
    let html = '';
    stats.forEach(shooter => {
        const roleAttr = shooter.role ? `<span class="shooter-role">${shooter.role}</span>` : '';
        html += `<tr>
            <td class="shooter-name">${shooter.name}${roleAttr}</td>
            <td class="score-cell">${shooter.best}</td>
            <td class="score-cell">${shooter.seasonBest}</td>
            <td class="score-cell">${shooter.tens}</td>
            <td class="score-cell">${shooter.average}</td>
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
