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

const teamShooters = {
    'Belle Vue Rifles': ['J. Thompson', 'M. Richards', 'D. Williams', 'A. Davies', 'R. Evans', 'S. Morgan', 'K. Hughes', 'P. Jones', 'L. Clarke'],
    'Pantmawr Rifles': ['G. Hopkins', 'L. Bennett', 'C. Griffiths', 'T. Edwards', 'N. Powell', 'H. Morris', 'B. Clarke', 'W. Rees', 'F. Owen'],
    'Rumney Rifles': ['F. Webb', 'O. Perry', 'E. Cox', 'I. Kelly', 'J. Russell', 'M. Grant', 'D. Wallace', 'R. Spencer', 'A. Blake'],
    'Newport Eagles': ['A. Adams', 'C. Baker', 'E. Carter', 'G. Dixon', 'K. Ellis', 'M. Fox', 'P. Green', 'S. Hart', 'T. James'],
    'Isca Rifles': ['T. Idris', 'V. Jones', 'W. King', 'X. Lloyd', 'Y. Miles', 'Z. Newman', 'A. Owens', 'B. Price', 'C. Ross']
};

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function generateScores(homeTeam, awayTeam, date) {
    const seed = hashCode(homeTeam + awayTeam + date);

    function seededRandom(s) {
        let x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    }

    const result = {};

    ['home', 'away'].forEach(side => {
        const teamName = side === 'home' ? homeTeam : awayTeam;
        const shooters = teamShooters[teamName] || generateDefaultShooters(teamName);
        const teamSeed = seed + (side === 'away' ? 1000 : 0);

        result[side] = shooters.map((name, i) => {
            const scores = [];
            for (let r = 0; r < 7; r++) {
                const rng = seededRandom(teamSeed + i * 100 + r);
                const score = Math.floor(7 + rng * 4);
                scores.push(score);
            }
            const total = scores.reduce((sum, s) => sum + s, 0);
            return { name, scores, total };
        });
    });

    return result;
}

function generateDefaultShooters(teamName) {
    const shooters = [];
    for (let i = 0; i < 9; i++) {
        shooters.push(`Shooter ${i + 1}`);
    }
    return shooters;
}

function calculateTeamScores(shooters) {
    const indexed = shooters.map((s, i) => ({ ...s, originalIndex: i }));
    const sorted = indexed.sort((a, b) => b.total - a.total);
    const aTeam = sorted.slice(0, 5).reduce((sum, s) => sum + s.total, 0);
    const bTeam = sorted.slice(4, 7).reduce((sum, s) => sum + s.total, 0);

    const ranks = new Array(shooters.length).fill('dropped');
    sorted.forEach((s, pos) => {
        const isA = pos < 5;
        const isB = pos >= 4 && pos < 7;
        if (isA && isB) ranks[s.originalIndex] = 'both';
        else if (isA) ranks[s.originalIndex] = 'a-team';
        else if (isB) ranks[s.originalIndex] = 'b-team';
    });

    const aTeamShooters = sorted.slice(0, 5).map(s => ({ name: s.name, total: s.total }));
    const bTeamShooters = sorted.slice(4, 7).map(s => ({ name: s.name, total: s.total }));

    return { aTeam, bTeam, ranks, aTeamShooters, bTeamShooters };
}

function renderShooterTable(tbodyId, shooters) {
    const tbody = document.getElementById(tbodyId);
    const { aTeam, bTeam, ranks, aTeamShooters, bTeamShooters } = calculateTeamScores(shooters);
    let html = '';

    shooters.forEach((shooter, index) => {
        const rank = ranks[index];
        const totalClass = `total-cell ${rank}`;
        html += `<tr class="shooter-${rank}">`;
        html += `<td class="shooter-cell">${shooter.name}</td>`;
        shooter.scores.forEach(score => {
            html += `<td class="score-cell">${score}</td>`;
        });
        html += `<td class="${totalClass}">${shooter.total}</td>`;
        html += '</tr>';
    });

    tbody.innerHTML = html;
    return { aTeam, bTeam, aTeamShooters, bTeamShooters };
}

function renderTeamSummary(tbodyId, teamName, scores) {
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

    html += `<tr class="summary-total-row"><td>Total</td><td class="score-cell">${scores.aTeam}</td><td class="score-cell">${scores.bTeam}</td></tr>`;

    tbody.innerHTML = html;
}

function renderMatchSummary(homeTeam, homeScores, awayTeam, awayScores) {
    document.getElementById('homeSummaryTitle').textContent = homeTeam;
    document.getElementById('awaySummaryTitle').textContent = awayTeam;
    renderTeamSummary('homeSummary', homeTeam, homeScores);
    renderTeamSummary('awaySummary', awayTeam, awayScores);
}

function renderMatchResult(homeTeam, homeScores, awayTeam, awayScores) {
    const container = document.getElementById('matchResult');
    const getResult = (home, away, teamH, teamA) => {
        if (home > away) return `${teamH} win`;
        if (away > home) return `${teamA} win`;
        return 'Draw';
    };

    container.innerHTML = `
        <div class="result-row">
            <span class="result-label">A-Team</span>
            <span class="result-value">${getResult(homeScores.aTeam, awayScores.aTeam, homeTeam, awayTeam)}</span>
            <span class="result-score">${homeScores.aTeam} - ${awayScores.aTeam}</span>
        </div>
        <div class="result-row">
            <span class="result-label">B-Team</span>
            <span class="result-value">${getResult(homeScores.bTeam, awayScores.bTeam, homeTeam, awayTeam)}</span>
            <span class="result-score">${homeScores.bTeam} - ${awayScores.bTeam}</span>
        </div>
    `;
}

function initMatchPage() {
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

    const matchData = generateScores(params.home, params.away, params.date);

    const homeScores = renderShooterTable('homeShooters', matchData.home);
    const awayScores = renderShooterTable('awayShooters', matchData.away);

    document.getElementById('homeATeam').textContent = homeScores.aTeam;
    document.getElementById('homeBTeam').textContent = homeScores.bTeam;
    document.getElementById('awayATeam').textContent = awayScores.aTeam;
    document.getElementById('awayBTeam').textContent = awayScores.bTeam;

    renderMatchSummary(params.home, homeScores, params.away, awayScores);

    renderMatchResult(params.home, homeScores, params.away, awayScores);
}

document.addEventListener('DOMContentLoaded', initMatchPage);
