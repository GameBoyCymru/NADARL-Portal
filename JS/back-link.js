document.addEventListener('DOMContentLoaded', () => {
    const link = document.querySelector('.back-link');
    if (!link || link.hasAttribute('data-back-custom')) return;

    const PAGE_TITLES = {
        'index.html': 'Home',
        'fixtures.html': 'Fixtures & Events',
        'teams.html': 'Teams',
        'table.html': 'Tables & Averages',
        'summer-league.html': 'Summer League',
        'rules.html': 'Rules',
        'gallery.html': 'Gallery',
        'history.html': 'History',
        'committee.html': 'Committee',
        'trophies.html': 'Trophies',
        'sales.html': 'For Sale',
        'join.html': 'Enquiries',
        'admin.html': 'Admin',
        'login.html': 'Login',
        'team.html': 'Team',
        'event.html': 'Event',
        'competition.html': 'Competition',
        'match.html': 'Match',
        'shooter.html': 'Shooter',
        'admin-season-manager.html': 'Season Manager',
        'admin-team-manager.html': 'Team Manager',
    };

    let target = null;
    let label = 'Home';

    if (document.referrer) {
        try {
            const ref = new URL(document.referrer);
            if (ref.origin === location.origin && ref.href !== location.href) {
                const file = ref.pathname.split('/').pop() || 'index.html';
                target = ref.href;
                label = PAGE_TITLES[file] || 'Previous Page';
            }
        } catch (e) {
            // malformed referrer, fall through to home
        }
    }

    if (target) {
        link.href = target;
        link.textContent = `← Back to ${label}`;

        // Use real browser history instead of following the href as a fresh
        // navigation. A fresh navigation mints a new history entry pointing
        // at the referrer, so going "back" repeatedly ping-pongs between two
        // pages instead of unwinding further. history.back() rewinds the
        // actual stack, so the second, third, etc. back-click keeps going
        // further back rather than bouncing between the last two pages.
        link.addEventListener('click', (event) => {
            if (window.history.length > 1) {
                event.preventDefault();
                window.history.back();
            }
        });
    }
});
