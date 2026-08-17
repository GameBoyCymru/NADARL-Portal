let fixtures = [];        // fixtures for the browsed season - drives both the
                           // Season Fixtures table and the Today's/Next
                           // Fixtures card, so both always agree with
                           // whichever season is currently browsed
let seasons = [];
let seasonIndex = 0;
let isAdmin = false;
let slugMap = {};
let highlightDate = null;   // date shown in "Today's Fixtures" (today's, or the next upcoming, within the browsed season)

function teamBadgeHtml(teamName) {
    const slug = slugMap[teamName];
    if (!slug) return `<div class="team-badge">\uD83C\uDFAF</div>`;
    return `<div class="team-badge"><img src="../Images/teams/${slug}.png" alt="${escapeHtml(teamName)} logo" onerror="this.parentElement.textContent='\uD83C\uDFAF'"></div>`;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function matchUrl(fixture) {
    return `match.html?home=${encodeURIComponent(fixture.homeTeam)}&away=${encodeURIComponent(fixture.awayTeam)}&date=${encodeURIComponent(fixture.date)}&venue=${encodeURIComponent(fixture.venue)}`;
}

// Competitions/events link out to their own info page instead of match.html.
function fixtureUrl(fixture) {
    if (fixture.isCompetition) return `competition.html?id=${encodeURIComponent(fixture.id)}`;
    if (fixture.isEvent) return `event.html?id=${encodeURIComponent(fixture.id)}`;
    return matchUrl(fixture);
}

function typeBadge(fixture) {
    if (fixture.isCompetition) {
        return '<span class="type-badge type-competition" title="Competition">Competition</span>';
    }
    if (fixture.isEvent) {
        return '<span class="type-badge type-event" title="Event">Event</span>';
    }
    if (fixture.half === 2) {
        return '<span class="type-badge type-hc" title="Handicap">HC</span>';
    }
    return '<span class="type-badge type-wohc" title="Without handicap">League</span>';
}

// 'blocked' (exclusion), 'competition', 'event' or 'match' (league/HC/bye) -
// a date is "Mixed" when it has more than one of these (admins can now add
// a match/competition/event onto a date that already has something else,
// past a confirm() warning rather than a hard block).
function fixtureType(fixture) {
    if (fixture.isBlocked) return 'blocked';
    if (fixture.isCompetition) return 'competition';
    if (fixture.isEvent) return 'event';
    return 'match';
}

function isMixedGroup(group) {
    return new Set(group.map(fixtureType)).size > 1;
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

// Same date, split into day/month/year so it can be laid out on 3 lines on
// narrow screens instead of wrapping mid-word.
function dateStackHtml(dateStr) {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString('en-GB', { day: 'numeric' });
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    const year = date.toLocaleDateString('en-GB', { year: 'numeric' });
    return `<span class="fixture-date-stack"><span class="fd-day">${day}</span><span class="fd-month">${month}</span><span class="fd-year">${year}</span></span>`;
}

function isToday(dateStr) {
    return dateStr === getTodayDate();
}

function getNextFixtures() {
    const today = getTodayDate();
    const futureFixtures = fixtures.filter(f => f.date > today);
    const dates = [...new Set(futureFixtures.map(f => f.date))].sort().slice(0, 1);
    const dateSet = new Set(dates);
    return futureFixtures.filter(f => dateSet.has(f.date));
}

// The date shown in the "Today's Fixtures" card - today's date if the
// browsed season has fixtures today, otherwise its next upcoming date (or
// null if it has none). Also used to highlight the matching row(s) in the
// Season Fixtures table below.
function computeHighlightDate() {
    const today = getTodayDate();
    if (fixtures.some(f => f.date === today)) return today;
    const next = getNextFixtures();
    return next.length ? next[0].date : null;
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
    const section = document.getElementById('todayFixturesSection');
    const title = document.getElementById('todayFixturesTitle');
    const container = document.getElementById('todayFixtures');
    container.innerHTML = '';
    const todaysFixtures = fixtures.filter(f => isToday(f.date));

    if (todaysFixtures.length === 0) {
        const nextFixtures = getNextFixtures();
        if (nextFixtures.length > 0) {
            section.hidden = false;
            title.textContent = 'Next Fixtures';
            const groupedFixtures = groupFixturesByDate(nextFixtures);
            Object.keys(groupedFixtures).forEach(date => {
                container.innerHTML += createFixtureCardGroup(date, groupedFixtures[date], true);
            });
        } else {
            // No fixtures today and none upcoming (nothing scheduled yet, or
            // the season's fixtures have all been played) - nothing useful
            // to show, so hide the whole card rather than an empty one.
            section.hidden = true;
        }
    } else {
        section.hidden = false;
        title.textContent = "Today's Fixtures";
        const groupedFixtures = groupFixturesByDate(todaysFixtures);
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
    if (fixture.isCompetition || fixture.isEvent) {
        const cardClass = fixture.isCompetition ? 'fixture-competition-item' : 'fixture-event-item';
        return `
            <div class="fixture-item ${cardClass}" onclick="window.location.href='${fixtureUrl(fixture)}'" style="cursor:pointer;">
                <div class="fixture-teams">
                    <div class="team-name">${escapeHtml(fixture.name)}</div>
                </div>
                ${fixture.venue ? `<div class="fixture-venue">${escapeHtml(fixture.venue)}</div>` : ''}
            </div>
        `;
    }
    if (fixture.isBye) {
        return `
            <div class="fixture-item fixture-bye">
                <div class="team">
                    ${teamBadgeHtml(fixture.homeTeam)}
                    <div class="team-name">${fixture.homeTeam}</div>
                    <span class="bye-badge">BYE</span>
                </div>
            </div>
        `;
    }
    const clickAttr = `onclick="window.location.href='${matchUrl(fixture)}'" style="cursor:pointer;"`;
    return `
        <div class="fixture-item" ${clickAttr}>
            <div class="fixture-teams">
                <div class="team">
                    ${teamBadgeHtml(fixture.homeTeam)}
                    <div class="team-name">${fixture.homeTeam}</div>
                    <div class="venue-cell">Home</div>
                </div>
                <div class="vs">VS</div>
                <div class="team">
                    ${teamBadgeHtml(fixture.awayTeam)}
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
                <span class="fixture-date">${formatDate(date)} | 8:00pm</span>
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
    tbody.innerHTML = '';
    const groupedFixtures = groupFixturesByDate(fixtures);

    if (!fixtures.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-fixtures">No fixtures for this season.</td></tr>';
        return;
    }

    const today = getTodayDate();

    Object.keys(groupedFixtures).sort().forEach((date, dateIndex) => {
        const formattedDate = formatDate(date);
        const group = groupedFixtures[date];
        const altClass = dateIndex % 2 === 1 ? ' fixture-row-alt' : '';
        const highlightClass = date === highlightDate ? ' fixture-current-row' : '';
        const mixed = isMixedGroup(group);

        // A date with nothing but an exclusion (no match/competition/event
        // sharing it) stays the simple single-row "no matches" rendering.
        if (!mixed && group[0] && group[0].isBlocked) {
            const headerRow = document.createElement('tr');
            headerRow.className = 'fixture-row fixture-date-row fixture-excluded-row' + altClass + highlightClass + (highlightClass ? ' fixture-current-row-end' : '');
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

        const typeBadgeHtml = mixed
            ? '<span class="type-badge type-mixed" title="Mixed">Mixed</span>'
            : typeBadge(group[0]);
        const typeRowClass = mixed ? ' fixture-mixed-row'
            : group[0].isCompetition ? ' fixture-competition-row'
            : group[0].isEvent ? ' fixture-event-row' : '';

        const headerRow = document.createElement('tr');
        headerRow.className = 'fixture-row fixture-date-row' + typeRowClass + altClass + highlightClass;
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
            const isLastInGroup = index === group.length - 1;
            const mixedClass = mixed ? ' fixture-mixed-row' : '';
            const row = document.createElement('tr');

            if (fixture.isBlocked) {
                // A mixed date's exclusion shows as its own info row rather
                // than owning the whole date the way a pure blocked day does.
                row.className = 'fixture-row fixture-detail-row fixture-excluded-row' + mixedClass
                    + (isLastInGroup ? ' fixture-group-end' : '') + altClass + highlightClass
                    + (highlightClass && isLastInGroup ? ' fixture-current-row-end' : '');
                row.innerHTML = `
                    <td class="teams-cell" colspan="2">No matches</td>
                    <td class="venue-cell"><span class="fixture-blocked-reason">${escapeHtml(fixture.reason)}</span></td>
                `;
                tbody.appendChild(row);
                return;
            }

            if (fixture.isCompetition || fixture.isEvent) {
                const typeRowClass = fixture.isCompetition ? ' fixture-competition-row' : ' fixture-event-row';
                row.className = 'fixture-row fixture-detail-row fixture-clickable' + typeRowClass + mixedClass
                    + (isLastInGroup ? ' fixture-group-end' : '') + altClass + highlightClass
                    + (highlightClass && isLastInGroup ? ' fixture-current-row-end' : '');
                row.addEventListener('click', () => { window.location.href = fixtureUrl(fixture); });
                row.innerHTML = `
                    <td class="teams-cell" colspan="2">${escapeHtml(fixture.name)}</td>
                    <td class="venue-cell">${fixture.venue ? escapeHtml(fixture.venue) : '-'}</td>
                `;
                tbody.appendChild(row);
                return;
            }

            const awayTeamDisplay = fixture.isBye ? '<span class="bye-badge">BYE</span>' : fixture.awayTeam;
            const venueDisplay = fixture.isBye ? '-' : fixture.venue;
            const vsLabel = fixture.isBye ? '' : '<span class="vs-label">vs</span>';

            row.className = 'fixture-row fixture-detail-row' + mixedClass + (isLastInGroup ? ' fixture-group-end' : '')
                + altClass + highlightClass + (highlightClass && isLastInGroup ? ' fixture-current-row-end' : '');
            // Everyone can open past/today's fixtures (to see the completed
            // match); admins can also open future ones to set up scoring.
            if (!fixture.isBye && (isAdmin || fixture.date <= today)) {
                row.classList.add('fixture-clickable');
                row.addEventListener('click', () => { window.location.href = matchUrl(fixture); });
            }
            // Home/away/vs live in one flex cell (colspan 2, like the
            // competition/event rows above) rather than two separate <td>s -
            // with the table at width:100% and no fixed column widths, the
            // browser's auto layout stretched the first column far past its
            // content, so "vs" (anchored to the second column) sat much
            // closer to the away team than the home team. A shared flex
            // container sidesteps table column sizing entirely.
            row.innerHTML = `
                <td class="teams-cell" colspan="2">
                    <span class="match-teams">
                        <span class="home-team">${fixture.homeTeam}</span>
                        ${vsLabel}
                        <span class="away-team">${awayTeamDisplay}</span>
                    </span>
                </td>
                <td class="venue-cell">${venueDisplay}</td>
            `;
            tbody.appendChild(row);
        });
    });
}

function renderMobileSeasonFixtures() {
    const container = document.getElementById('mobileSeasonFixtures');

    if (!fixtures.length) {
        container.innerHTML = '<div class="no-fixtures">No fixtures for this season.</div>';
        return;
    }

    const groupedFixtures = groupFixturesByDate(fixtures);
    const today = getTodayDate();
    let html = '';

    Object.keys(groupedFixtures).sort().forEach((date, dateIndex) => {
        const altClass = dateIndex % 2 === 1 ? ' mobile-fixture-group-alt' : '';
        const highlightClass = date === highlightDate ? ' mobile-fixture-current' : '';
        const group = groupedFixtures[date];

        const mixed = isMixedGroup(group);

        // blocked (no-match) day: show the reason only, not interactive -
        // unless it shares the date with a match/competition/event, in
        // which case it's rendered as its own item below instead.
        if (!mixed && group[0] && group[0].isBlocked) {
            html += `<div class="mobile-fixture-group mobile-fixture-blocked${altClass}${highlightClass}">`;
            html += `<div class="mobile-fixture-summary">${dateStackHtml(date)} <span class="mobile-fixture-count">${escapeHtml(group[0].reason)}</span></div>`;
            html += `</div>`;
            return;
        }

        const typeGroupClass = mixed ? ' mobile-fixture-mixed-group'
            : group[0].isCompetition ? ' mobile-fixture-competition-group'
            : group[0].isEvent ? ' mobile-fixture-event-group' : '';
        const typeBadgeHtml = mixed
            ? '<span class="type-badge type-mixed" title="Mixed">Mixed</span>'
            : typeBadge(group[0]);
        html += `<details class="mobile-fixture-group${typeGroupClass}${altClass}${highlightClass}"${highlightClass ? ' open' : ''}>`;
        html += `<summary class="mobile-fixture-summary">${dateStackHtml(date)} <span class="mobile-fixture-count">(${group.length} fixture${group.length > 1 ? 's' : ''})</span> ${typeBadgeHtml}</summary>`;
        html += `<div class="mobile-fixture-content">`;

        group.forEach(fixture => {
            if (fixture.isBlocked) {
                html += `
                    <div class="mobile-fixture-item">
                        <div class="mobile-fixture-teams">
                            <span class="mobile-team">No matches</span>
                        </div>
                        <div class="mobile-fixture-venue"><span class="fixture-blocked-reason">${escapeHtml(fixture.reason)}</span></div>
                    </div>
                `;
            } else if (fixture.isCompetition || fixture.isEvent) {
                const typeClass = fixture.isCompetition ? 'mobile-fixture-competition' : 'mobile-fixture-event';
                html += `
                    <div class="mobile-fixture-item fixture-clickable ${typeClass}" onclick="window.location.href='${fixtureUrl(fixture)}'">
                        <div class="mobile-fixture-teams">
                            <span class="mobile-team">${escapeHtml(fixture.name)}</span>
                        </div>
                        ${fixture.venue ? `<div class="mobile-fixture-venue">${escapeHtml(fixture.venue)}</div>` : ''}
                    </div>
                `;
            } else if (fixture.isBye) {
                html += `
                    <div class="mobile-fixture-item fixture-bye">
                        <div class="mobile-fixture-teams">
                            <span class="mobile-team">${fixture.homeTeam}</span>
                            <span class="bye-badge">BYE</span>
                        </div>
                    </div>
                `;
            } else {
                // Everyone can open past/today's fixtures (to see the completed
                // match); admins can also open future ones to set up scoring.
                const canOpen = isAdmin || fixture.date <= today;
                const clickAttrs = canOpen
                    ? `class="mobile-fixture-item fixture-clickable" onclick="window.location.href='${matchUrl(fixture)}'"`
                    : `class="mobile-fixture-item"`;
                html += `
                    <div ${clickAttrs}>
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

function setupAuthButton(profile) {
    const authButton = document.getElementById('authButton');
    if (!authButton) return;

    if (profile && profile.role === 'admin') {
        authButton.textContent = 'Admin Panel';
        authButton.onclick = () => {
            window.location.href = 'admin.html';
        };
    } else if (profile) {
        authButton.textContent = 'Sign Out';
        authButton.onclick = async () => {
            authButton.disabled = true;
            await window.db.auth.signOut();
            window.location.reload();
        };
    } else {
        authButton.textContent = 'Match Day Login';
        authButton.onclick = () => {
            window.location.href = 'login.html';
        };
    }
}

// Fetches one season's fixtures + its exclusions/competitions/events merged
// in as calendar entries, sorted by date. Shared by the "today" (fixed to
// the actual current season) and "browsed" (season-switcher-driven) loads.
async function loadSeasonFixtures(season) {
    const seasonId = season && season.id;
    const [seasonFixtures, exclusions, competitions, events] = await Promise.all([
        NADARL.fetchFixtures(seasonId),
        NADARL.fetchExclusions(),
        NADARL.fetchCompetitions(seasonId),
        NADARL.fetchEvents(seasonId)
    ]);
    exclusions
        .filter(e => !season || e.season_id === season.id)
        .forEach(e => {
            seasonFixtures.push({ date: e.date, isBlocked: true, reason: e.reason });
        });
    competitions.forEach(c => {
        seasonFixtures.push({ date: c.date, isCompetition: true, id: c.id, name: c.name, venue: c.venue });
    });
    events.forEach(e => {
        seasonFixtures.push({ date: e.date, isEvent: true, id: e.id, name: e.name, venue: e.venue });
    });
    seasonFixtures.sort((a, b) => a.date.localeCompare(b.date));
    return seasonFixtures;
}

async function loadBrowsedSeason() {
    const season = seasons[seasonIndex];
    const label = document.getElementById('seasonLabel');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    label.textContent = (season ? season.name : 'Season') + ' Fixtures';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    fixtures = season ? await loadSeasonFixtures(season) : [];
    highlightDate = computeHighlightDate();
    renderTodayFixtures();
    renderSeasonFixtures();
    renderMobileSeasonFixtures();
}

document.addEventListener('DOMContentLoaded', async () => {
    seasons = await NADARL.fetchSeasons();
    const currentSeason = NADARL.pickCurrentSeason(seasons);
    seasonIndex = currentSeason ? seasons.indexOf(currentSeason) : seasons.length - 1;

    slugMap = await NADARL.fetchTeamSlugMap();
    const profile = await NADARL.fetchMyProfile();
    isAdmin = !!(profile && profile.role === 'admin');
    setupAuthButton(profile);

    document.getElementById('seasonPrev').addEventListener('click', () => {
        if (seasonIndex > 0) { seasonIndex--; loadBrowsedSeason(); }
    });
    document.getElementById('seasonNext').addEventListener('click', () => {
        if (seasonIndex < seasons.length - 1) { seasonIndex++; loadBrowsedSeason(); }
    });

    await loadBrowsedSeason();
});
