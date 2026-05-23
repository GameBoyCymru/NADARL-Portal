// Sample fixture data based on the league information
const fixtures = [
    {
        date: '2026-05-20',
        homeTeam: 'Belle Vue Rifles',
        awayTeam: 'Pantmawr Rifles',
        venue: 'Belle Vue'
    },
    {
        date: '2026-05-20',
        homeTeam: 'Rumney Rifles',
        awayTeam: 'Newport Eagles',
        venue: 'Rumney'
    },
    {
        date: '2026-05-20',
        homeTeam: 'Isca Rifles',
        awayTeam: 'BYE',
        venue: 'BYE'
    },
    {
        date: '2026-05-26',
        homeTeam: 'Isca Rifles',
        awayTeam: 'Belle Vue Rifles',
        venue: 'Isca'
    },
    {
        date: '2026-05-26',
        homeTeam: 'Pantmawr Rifles',
        awayTeam: 'Rumney Rifles',
        venue: 'Pantmawr'
    },
    {
        date: '2026-05-26',
        homeTeam: 'Newport Eagles',
        awayTeam: 'BYE',
        venue: 'BYE'
    },
    {
        date: '2026-06-02',
        homeTeam: 'Newport Eagles',
        awayTeam: 'Isca Rifles',
        venue: 'Newport'
    },
    {
        date: '2026-06-02',
        homeTeam: 'Belle Vue Rifles',
        awayTeam: 'Rumney Rifles',
        venue: 'Belle Vue'
    },
    {
        date: '2026-06-02',
        homeTeam: 'Pantmawr Rifles',
        awayTeam: 'BYE',
        venue: 'BYE'
    },
    {
        date: '2026-06-09',
        homeTeam: 'Pantmawr Rifles',
        awayTeam: 'Newport Eagles',
        venue: 'Pantmawr'
    },
    {
        date: '2026-06-09',
        homeTeam: 'Isca Rifles',
        awayTeam: 'Rumney Rifles',
        venue: 'Isca'
    },
    {
        date: '2026-06-09',
        homeTeam: 'Belle Vue Rifles',
        awayTeam: 'BYE',
        venue: 'BYE'
    },
    {
        date: '2026-06-16',
        homeTeam: 'Belle Vue Rifles',
        awayTeam: 'Newport Eagles',
        venue: 'Belle Vue'
    },
    {
        date: '2026-06-16',
        homeTeam: 'Rumney Rifles',
        awayTeam: 'Isca Rifles',
        venue: 'Rumney'
    },
    {
        date: '2026-06-16',
        homeTeam: 'Pantmawr Rifles',
        awayTeam: 'BYE',
        venue: 'BYE'
    },
    {
        date: '2026-06-23',
        homeTeam: 'Pantmawr Rifles',
        awayTeam: 'Isca Rifles',
        venue: 'Pantmawr'
    },
    {
        date: '2026-06-23',
        homeTeam: 'Newport Eagles',
        awayTeam: 'Rumney Rifles',
        venue: 'Newport'
    },
    {
        date: '2026-06-23',
        homeTeam: 'Belle Vue Rifles',
        awayTeam: 'BYE',
        venue: 'BYE'
    }
];

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Format date for display
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

// Check if a date is today
function isToday(dateStr) {
    return dateStr === getTodayDate();
}

// Find next fixtures if none today
function getNextFixtures() {
    const today = getTodayDate();
    const futureFixtures = fixtures.filter(f => f.date > today);
    return futureFixtures.slice(0, 2);
}

// Group fixtures by date
function groupFixturesByDate(fixtureList) {
    const grouped = {};
    fixtureList.forEach(fixture => {
        if (!grouped[fixture.date]) {
            grouped[fixture.date] = [];
        }
        grouped[fixture.date].push(fixture);
    });
    return grouped;
}

// Render today's fixtures
function renderTodayFixtures() {
    const container = document.getElementById('todayFixtures');
    const todayFixtures = fixtures.filter(f => isToday(f.date));

    if (todayFixtures.length === 0) {
        const nextFixtures = getNextFixtures();
        if (nextFixtures.length > 0) {
            document.querySelector('.section-title').textContent = 'Next Fixtures';
            const groupedFixtures = groupFixturesByDate(nextFixtures);
            Object.keys(groupedFixtures).forEach(date => {
                container.innerHTML += createFixtureCardGroup(date, groupedFixtures[date], true);
            });
        } else {
            container.innerHTML = '<div class="no-fixtures">No upcoming fixtures scheduled</div>';
        }
    } else {
        const groupedFixtures = groupFixturesByDate(todayFixtures);
        Object.keys(groupedFixtures).forEach(date => {
            container.innerHTML += createFixtureCardGroup(date, groupedFixtures[date], true);
        });
    }
}

// Create fixture card HTML (individual fixture)
function createFixtureCard(fixture) {
    const isBye = fixture.awayTeam === 'BYE';
    if (isBye) {
        return `
            <div class="fixture-item fixture-bye">
                <div class="team">
                    <div class="team-badge">🎯</div>
                    <div class="team-name">${fixture.homeTeam}</div>
                    <div class="venue-cell">BYE Week</div>
                </div>
            </div>
        `;
    }
    return `
        <div class="fixture-item">
            <div class="fixture-teams">
                <div class="team">
                    <div class="team-badge">🎯</div>
                    <div class="team-name">${fixture.homeTeam}</div>
                    <div class="venue-cell">Home</div>
                </div>
                <div class="vs">VS</div>
                <div class="team">
                    <div class="team-badge">🎯</div>
                    <div class="team-name">${fixture.awayTeam}</div>
                    <div class="venue-cell">Away</div>
                </div>
            </div>
            <div class="fixture-venue">${fixture.venue}</div>
        </div>
    `;
}

// Create fixture card group HTML (grouped by date)
function createFixtureCardGroup(date, fixtureList, alwaysExpanded = false) {
    const fixtureItems = fixtureList.map(f => createFixtureCard(f)).join('');
    const clickableClass = alwaysExpanded ? '' : 'clickable';
    const onClickAttr = alwaysExpanded ? '' : 'onclick="toggleFixtureGroup(this)"';
    const expandIcon = alwaysExpanded ? '' : '<span class="expand-icon">▼</span>';
    const contentClass = alwaysExpanded ? 'fixture-content always-expanded' : 'fixture-content';
    
    return `
        <div class="fixture-card">
            <div class="fixture-header ${clickableClass}" ${onClickAttr}>
                <span class="fixture-date">${formatDate(date)}</span>
                ${expandIcon}
            </div>
            <div class="${contentClass}">
                ${fixtureItems}
            </div>
        </div>
    `;
}

// Toggle fixture group expansion
function toggleFixtureGroup(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.expand-icon');
    
    content.classList.toggle('expanded');
    icon.classList.toggle('rotated');
}

// Render season fixtures
function renderSeasonFixtures() {
    const tbody = document.getElementById('seasonFixtures');
    const groupedFixtures = groupFixturesByDate(fixtures);
    
    Object.keys(groupedFixtures).sort().forEach((date, dateIndex) => {
        const formattedDate = formatDate(date);
        const rowClass = dateIndex % 2 === 0 ? 'fixture-row' : 'fixture-row fixture-row-alt';
        
        groupedFixtures[date].forEach((fixture, index) => {
            const isBye = fixture.awayTeam === 'BYE';
            const awayTeamDisplay = isBye ? '<span class="bye-badge">BYE</span>' : fixture.awayTeam;
            const venueDisplay = isBye ? '-' : fixture.venue;
            
            const row = document.createElement('tr');
            row.className = rowClass;
            
            if (index === 0) {
                row.innerHTML = `
                    <td class="date-cell" rowspan="${groupedFixtures[date].length}">${formattedDate}</td>
                    <td class="teams-cell">${fixture.homeTeam}</td>
                    <td class="teams-cell">${awayTeamDisplay}</td>
                    <td class="venue-cell">${venueDisplay}</td>
                `;
            } else {
                row.innerHTML = `
                    <td class="teams-cell">${fixture.homeTeam}</td>
                    <td class="teams-cell">${awayTeamDisplay}</td>
                    <td class="venue-cell">${venueDisplay}</td>
                `;
            }
            
            tbody.appendChild(row);
        });
    });
}

function renderMobileSeasonFixtures() {
    const container = document.getElementById('mobileSeasonFixtures');
    const groupedFixtures = groupFixturesByDate(fixtures);
    let html = '';

    Object.keys(groupedFixtures).sort().forEach((date, dateIndex) => {
        const altClass = dateIndex % 2 === 1 ? ' mobile-fixture-group-alt' : '';
        html += `<details class="mobile-fixture-group${altClass}">`;
        html += `<summary class="mobile-fixture-summary">${formatDate(date)} <span class="mobile-fixture-count">(${groupedFixtures[date].length} fixture${groupedFixtures[date].length > 1 ? 's' : ''})</span></summary>`;
        html += `<div class="mobile-fixture-content">`;

        groupedFixtures[date].forEach(fixture => {
            const isBye = fixture.awayTeam === 'BYE';
            if (isBye) {
                html += `
                    <div class="mobile-fixture-item fixture-bye">
                        <div class="mobile-fixture-teams">
                            <span class="mobile-team">${fixture.homeTeam}</span>
                            <span class="bye-badge">BYE</span>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="mobile-fixture-item">
                        <div class="mobile-fixture-teams">
                            <span class="mobile-team">${fixture.homeTeam}</span>
                        </div>
                        <div class="mobile-vs">vs</div>
                        <div class="mobile-fixture-teams">
                            <span class="mobile-team">${fixture.awayTeam}</span>
                        </div>
                        <div class="mobile-fixture-venue">${fixture.venue}</div>
                    </div>
                `;
            }
        });

        html += `</div></details>`;
    });

    container.innerHTML = html;
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    renderTodayFixtures();
    renderSeasonFixtures();
    renderMobileSeasonFixtures();
});
