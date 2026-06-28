function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        home: params.get('home') || '',
        away: params.get('away') || '',
        date: params.get('date') || '',
        venue: params.get('venue') || ''
    };
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Sort shooters by total desc, then derive A-team (top 5) and B-team (pos 5-7).
function calculateTeamScores(shooters) {
    const indexed = shooters.map((s, i) => ({ ...s, originalIndex: i }));
    const sorted = indexed.sort((a, b) => b.total - a.total);
    const aTeam = sorted.slice(0, 5).reduce((sum, s) => sum + s.total, 0);
    const bTeam = sorted.slice(4, 7).reduce((sum, s) => sum + s.total, 0);

    const aTeamShooters = sorted.slice(0, 5).map(s => ({ name: s.name, total: s.total }));
    const bTeamShooters = sorted.slice(4, 7).map(s => ({ name: s.name, total: s.total }));

    return { aTeam, bTeam, aTeamShooters, bTeamShooters };
}

function renderShooterTable(tbodyId, shooters) {
    const tbody = document.getElementById(tbodyId);
    const totals = shooters.map(s => s.total);
    const maxTotal = totals.length ? Math.max(...totals) : 0;
    const minTotal = totals.length ? Math.min(...totals) : 0;
    let html = '';

    shooters.forEach((shooter) => {
        let totalClass = 'total-cell';
        if (shooters.length && shooter.total === maxTotal) totalClass += ' total-highest';
        else if (shooters.length && shooter.total === minTotal) totalClass += ' total-lowest';
        html += `<tr>`;
        html += `<td class="shooter-cell">${shooter.name}</td>`;
        shooter.scores.forEach(score => {
            html += `<td class="score-cell">${score}</td>`;
        });
        html += `<td class="${totalClass}">${shooter.total}</td>`;
        html += '</tr>';
    });

    tbody.innerHTML = html;
    return calculateTeamScores(shooters);
}

function renderTeamSummary(tbodyId, scores, opponentScores) {
    const tbody = document.getElementById(tbodyId);
    let html = '';

    scores.aTeamShooters.forEach((s, i) => {
        const bScore = (i === 4 && scores.bTeamShooters[0] && scores.bTeamShooters[0].name === s.name) ? s.total : '';
        html += `<tr><td class="summary-shooter">${s.name}</td><td class="score-cell">${s.total}</td><td class="score-cell">${bScore}</td></tr>`;
    });

    scores.bTeamShooters.forEach((s, i) => {
        if (i === 0) return;
        html += `<tr><td class="summary-shooter">${s.name}</td><td class="score-cell"></td><td class="score-cell">${s.total}</td></tr>`;
    });

    const aClass = scores.aTeam > opponentScores.aTeam ? ' score-winner' : '';
    const bClass = scores.bTeam > opponentScores.bTeam ? ' score-winner' : '';
    html += `<tr class="summary-total-row"><td>Total</td><td class="score-cell${aClass}">${scores.aTeam}</td><td class="score-cell${bClass}">${scores.bTeam}</td></tr>`;

    tbody.innerHTML = html;
}

function renderMatchSummary(homeTeam, homeScores, awayTeam, awayScores) {
    document.getElementById('homeSummaryTitle').textContent = homeTeam;
    document.getElementById('awaySummaryTitle').textContent = awayTeam;
    renderTeamSummary('homeSummary', homeScores, awayScores);
    renderTeamSummary('awaySummary', awayScores, homeScores);
}

async function initMatchPage() {
    const params = getQueryParams();

    if (!params.home || !params.away) {
        document.querySelector('.container').innerHTML = '<div class="no-match">No match data found. Please go back to <a href="fixtures.html">Fixtures</a>.</div>';
        return;
    }

    document.title = `${params.home} vs ${params.away} - Newport & District Air Rifle League`;
    document.getElementById('matchDate').textContent = formatDate(params.date);
    document.getElementById('homeTeamName').textContent = params.home;
    document.getElementById('awayTeamName').textContent = params.away;
    document.getElementById('matchVenue').textContent = `Venue: ${params.venue}`;
    document.getElementById('homeTeamTableTitle').textContent = params.home;
    document.getElementById('awayTeamTableTitle').textContent = params.away;

    const rows = await NADARL.fetchMatchScorecard(params.date, params.home, params.away);

    const homeShooters = rows.filter(r => r.team_name === params.home)
        .map(r => ({ name: r.shooter_name, scores: r.shots || [], total: r.total }));
    const awayShooters = rows.filter(r => r.team_name === params.away)
        .map(r => ({ name: r.shooter_name, scores: r.shots || [], total: r.total }));

    if (!homeShooters.length && !awayShooters.length) {
        document.querySelector('.score-tables-wrapper').innerHTML =
            '<div class="no-fixtures">Scores for this match have not been entered yet.</div>';
        return;
    }

    const homeScores = renderShooterTable('homeShooters', homeShooters);
    const awayScores = renderShooterTable('awayShooters', awayShooters);

    const homeAEl = document.getElementById('homeATeam');
    const homeBEl = document.getElementById('homeBTeam');
    const awayAEl = document.getElementById('awayATeam');
    const awayBEl = document.getElementById('awayBTeam');

    homeAEl.textContent = homeScores.aTeam;
    homeBEl.textContent = homeScores.bTeam;
    awayAEl.textContent = awayScores.aTeam;
    awayBEl.textContent = awayScores.bTeam;

    if (homeScores.aTeam > awayScores.aTeam) homeAEl.classList.add('score-winner');
    else if (awayScores.aTeam > homeScores.aTeam) awayAEl.classList.add('score-winner');
    if (homeScores.bTeam > awayScores.bTeam) homeBEl.classList.add('score-winner');
    else if (awayScores.bTeam > homeScores.bTeam) awayBEl.classList.add('score-winner');

    renderMatchSummary(params.home, homeScores, params.away, awayScores);
}

document.addEventListener('DOMContentLoaded', initMatchPage);

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
