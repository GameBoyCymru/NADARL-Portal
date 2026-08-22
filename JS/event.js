function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00')
        .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function venueMapsUrl(venue) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

async function initEventPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';

    const event = await NADARL.fetchEventById(id);
    if (!event) {
        document.querySelector('.container').innerHTML =
            '<section class="section"><p class="login-intro">Event not found. Please go back to <a href="fixtures.html">Fixtures</a>.</p></section>';
        return;
    }

    document.title = `${event.name} - Newport & District Air Rifle League`;
    document.getElementById('evName').textContent = event.name;
    document.getElementById('evMeta').innerHTML = escapeHtml(formatDate(event.date))
        + (event.venue ? ' · <a class="venue-map-link" href="' + venueMapsUrl(event.venue) + '" target="_blank" rel="noopener">' + escapeHtml(event.venue) + '</a>' : '');

    const hasAttire = !!(event.attire && event.attire.trim());
    const hasDescription = !!(event.description && event.description.trim());
    if (hasAttire || hasDescription) {
        document.getElementById('evDetailsSection').hidden = false;
        if (hasAttire) {
            document.getElementById('evAttireBlock').hidden = false;
            document.getElementById('evAttire').textContent = event.attire;
        }
        if (hasDescription) {
            document.getElementById('evDescriptionBlock').hidden = false;
            document.getElementById('evDescription').textContent = event.description;
        }
    }
}

document.addEventListener('DOMContentLoaded', initEventPage);

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
