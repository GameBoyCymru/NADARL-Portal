const teamShooters = {
    'Belle Vue Rifles': ['J. Thompson', 'M. Richards', 'D. Williams', 'A. Davies', 'R. Evans', 'S. Morgan', 'K. Hughes', 'P. Jones', 'L. Clarke'],
    'Pantmawr Rifles': ['G. Hopkins', 'L. Bennett', 'C. Griffiths', 'T. Edwards', 'N. Powell', 'H. Morris', 'B. Clarke', 'W. Rees', 'F. Owen'],
    'Rumney Rifles': ['F. Webb', 'O. Perry', 'E. Cox', 'I. Kelly', 'J. Russell', 'M. Grant', 'D. Wallace', 'R. Spencer', 'A. Blake'],
    'Newport Eagles': ['A. Adams', 'C. Baker', 'E. Carter', 'G. Dixon', 'K. Ellis', 'M. Fox', 'P. Green', 'S. Hart', 'T. James'],
    'Isca Rifles': ['T. Idris', 'V. Jones', 'W. King', 'X. Lloyd', 'Y. Miles', 'Z. Newman', 'A. Owens', 'B. Price', 'C. Ross']
};

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

function getAllShooterStats() {
    const allStats = [];

    Object.keys(teamShooters).forEach(teamName => {
        const shooters = teamShooters[teamName];
        const shooterMatchTotals = {};
        const shooterTens = {};

        shooters.forEach(s => {
            shooterMatchTotals[s] = [];
            shooterTens[s] = 0;
        });

        const teamFixtures = fixtures.filter(f =>
            (f.homeTeam === teamName || f.awayTeam === teamName) && f.awayTeam !== 'BYE'
        );

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

        shooters.forEach(name => {
            const totals = shooterMatchTotals[name];
            const best = totals.length > 0 ? Math.max(...totals) : 0;
            const seasonBest = best;
            const average = totals.length > 0
                ? parseFloat((totals.reduce((sum, t) => sum + t, 0) / totals.length).toFixed(1))
                : 0;

            allStats.push({
                name,
                team: teamName,
                best,
                seasonBest,
                tens: shooterTens[name],
                average
            });
        });
    });

    allStats.sort((a, b) => b.average - a.average);
    return allStats;
}

function initTablePage() {
    const stats = getAllShooterStats();
    const tbody = document.getElementById('leagueTable');

    let html = '';
    stats.forEach((shooter, index) => {
        html += `<tr>
            <td>${index + 1}</td>
            <td class="shooter-name">${shooter.name}</td>
            <td class="team-cell">${shooter.team}</td>
            <td class="score-cell">${shooter.best}</td>
            <td class="score-cell">${shooter.seasonBest}</td>
            <td class="score-cell">${shooter.tens}</td>
            <td class="score-cell">${shooter.average}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', initTablePage);
