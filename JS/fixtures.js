let fixtures = [];

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function typeBadge(fixture) {
    if (fixture.half === 2) {
        return '<span class="type-badge type-hc" title="Handicap">HC</span>';
    }
    return '<span class="type-badge type-wohc" title="Without handicap">Wo/HC</span>';
}

function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function isToday(dateStr) {
    return dateStr === getTodayDate();
}

function getNextFixtures() {
    const today = getTodayDate();
    const futureFixtures = fixtures.filter(f => f.date > today);
    return futureFixtures.slice(0, 2);
}

function groupFixturesByDate(fixtureList) {
    const grouped = {};
    fixtureList.forEach(fixture => {
        if (!grouped[fixture.date]) {
            grouped[fixture.date] = [];
        }
        grouped[fixture.date].push(fixture);
    });
    Object.values(grouped).forEach(group => {
        group.sort((a, b) => (a.isBye === b.isBye) ? 0 : (a.isBye ? 1 : -1));
    });
    return grouped;
}

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

function createFixtureCard(fixture) {
    if (fixture.isBlocked) {
        return `
            <div class="fixture-item fixture-blocked">
                <div class="fixture-blocked-reason">No matches &mdash; ${escapeHtml(fixture.reason)}</div>
            </div>
        `;
    }
    if (fixture.isBye) {
        return `
            <div class="fixture-item fixture-bye">
                <div class="team">
                    <div class="team-badge">🎯</div>
                    <div class="team-name">${fixture.homeTeam}</div>
                    <span class="bye-badge">BYE</span>
                </div>
            </div>
        `;
    }
    const isTodayFixture = isToday(fixture.date);
    const clickAttr = isTodayFixture
        ? `onclick="window.location.href='match.html?home=${encodeURIComponent(fixture.homeTeam)}&away=${encodeURIComponent(fixture.awayTeam)}&date=${encodeURIComponent(fixture.date)}&venue=${encodeURIComponent(fixture.venue)}'" style="cursor:pointer;"`
        : '';
    return `
        <div class="fixture-item" ${clickAttr}>
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

function toggleFixtureGroup(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.expand-icon');

    content.classList.toggle('expanded');
    icon.classList.toggle('rotated');
}

function renderSeasonFixtures() {
    const tbody = document.getElementById('seasonFixtures');
    const groupedFixtures = groupFixturesByDate(fixtures);

    Object.keys(groupedFixtures).sort().forEach((date, dateIndex) => {
        const formattedDate = formatDate(date);
        const group = groupedFixtures[date];
        const altClass = dateIndex % 2 === 1 ? ' fixture-row-alt' : '';

        if (group[0] && group[0].isBlocked) {
            const headerRow = document.createElement('tr');
            headerRow.className = 'fixture-row fixture-date-row fixture-excluded-row' + altClass;
            headerRow.innerHTML = `
                <td class="date-cell fixture-date-header" colspan="3">
                    <div class="fixture-date-inner">
                        <span class="fixture-date">${formattedDate}</span>
                        <span class="fixture-blocked-reason">${escapeHtml(group[0].reason)}</span>
                    </div>
                </td>
            `;
            tbody.appendChild(headerRow);
            return;
        }

        const typeBadgeHtml = typeBadge(group[0]);

        const headerRow = document.createElement('tr');
        headerRow.className = 'fixture-row fixture-date-row' + altClass;
        headerRow.innerHTML = `
            <td class="date-cell fixture-date-header" colspan="3">
                <div class="fixture-date-inner">
                    <span class="fixture-date">${formattedDate}</span>
                    <span class="date-type-badge">${typeBadgeHtml}</span>
                </div>
            </td>
        `;
        tbody.appendChild(headerRow);

        group.forEach((fixture, index) => {
            const awayTeamDisplay = fixture.isBye ? '<span class="bye-badge">BYE</span>' : fixture.awayTeam;
            const venueDisplay = fixture.isBye ? '-' : fixture.venue;

            const row = document.createElement('tr');
            row.className = 'fixture-row fixture-detail-row' + altClass;
            row.innerHTML = `
                <td class="teams-cell">${fixture.homeTeam}</td>
                <td class="teams-cell">${awayTeamDisplay}</td>
                <td class="venue-cell">${venueDisplay}</td>
            `;
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
        const group = groupedFixtures[date];

        // blocked (no-match) day: show the reason only, not interactive
        if (group[0] && group[0].isBlocked) {
            html += `<div class="mobile-fixture-group mobile-fixture-blocked${altClass}">`;
            html += `<div class="mobile-fixture-summary">${formatDate(date)} <span class="mobile-fixture-count">${escapeHtml(group[0].reason)}</span></div>`;
            html += `</div>`;
            return;
        }

        html += `<details class="mobile-fixture-group${altClass}">`;
        html += `<summary class="mobile-fixture-summary">${formatDate(date)} <span class="mobile-fixture-count">(${group.length} fixture${group.length > 1 ? 's' : ''})</span> ${typeBadge(group[0])}</summary>`;
        html += `<div class="mobile-fixture-content">`;

        group.forEach(fixture => {
            if (fixture.isBye) {
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

document.addEventListener('DOMContentLoaded', async () => {
    fixtures = await NADARL.fetchFixtures();
    // merge in saved exclusions as blocked (no-match) days
    const exclusions = await NADARL.fetchExclusions();
    exclusions.forEach(e => {
        fixtures.push({ date: e.date, isBlocked: true, reason: e.reason });
    });
    fixtures.sort((a, b) => a.date.localeCompare(b.date));
    renderTodayFixtures();
    renderSeasonFixtures();
    renderMobileSeasonFixtures();
});
