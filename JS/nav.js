document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMobile');
    const topnav = document.querySelector('.topnav');
    const brand = topnav ? topnav.querySelector('.nav-brand') : null;
    const links = topnav ? topnav.querySelector('.nav-links') : null;
    const pageTitle = document.getElementById('navPageTitle');

    const getPageName = () => {
        const current = topnav ? topnav.querySelector('.nav-links a.current') : null;
        if (current) return current.textContent.trim();

        return document.title
            .replace(/Newport & District Air Rifle League/i, '')
            .replace(/^\s*[-–—]\s*/, '')
            .replace(/\s*[-–—]\s*$/, '')
            .trim();
    };
    let pageName = getPageName();

    if (topnav && links) {
        const measure = links.cloneNode(true);
        measure.style.position = 'absolute';
        measure.style.visibility = 'hidden';
        measure.style.left = '-9999px';
        measure.style.top = '0';
        measure.style.display = 'flex';
        document.body.appendChild(measure);

        const TOPNAV_GAP = 10;
        const SAFETY_MARGIN = 8;
        const TITLE_BASE_SIZE = 0.85;
        const TITLE_MIN_SIZE = 0.6;
        const TITLE_STEP = 0.05;

        const updateNavLayout = () => {
            if (pageTitle) {
                pageTitle.style.display = 'none';
                pageTitle.style.fontSize = '';
                pageTitle.textContent = '';
            }

            const available = topnav.clientWidth - brand.offsetWidth - TOPNAV_GAP - SAFETY_MARGIN;
            const fits = measure.scrollWidth <= available;
            topnav.classList.toggle('nav-fit', fits);
            if (fits && menu) {
                menu.classList.remove('open');
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }

            // Only fill the empty space next to the hamburger button with the
            // page name. When the full link list already fits (desktop),
            // there's no empty space to fill, so leave it hidden.
            if (!fits && pageName && pageTitle) {
                pageTitle.textContent = pageName;
                pageTitle.style.display = 'block';

                // The title is centred over the whole bar, independent of
                // flex flow, so check for actual overlap with its neighbours
                // rather than overall bar overflow.
                const overlaps = () => {
                    const titleRect = pageTitle.getBoundingClientRect();
                    const brandRect = brand.getBoundingClientRect();
                    const toggleRect = toggle ? toggle.getBoundingClientRect() : null;
                    return titleRect.left < brandRect.right + SAFETY_MARGIN
                        || (toggleRect && titleRect.right > toggleRect.left - SAFETY_MARGIN);
                };

                let size = TITLE_BASE_SIZE;
                pageTitle.style.fontSize = `${size}rem`;
                while (overlaps() && size > TITLE_MIN_SIZE) {
                    size = Math.round((size - TITLE_STEP) * 100) / 100;
                    pageTitle.style.fontSize = `${size}rem`;
                }

                if (overlaps()) {
                    pageTitle.style.display = 'none';
                    pageTitle.style.fontSize = '';
                    pageTitle.textContent = '';
                }
            }
        };

        updateNavLayout();

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(updateNavLayout, 100);
        });

        // Dynamic pages (team, match, shooter, event, competition) set
        // document.title asynchronously once their data has loaded, well
        // after DOMContentLoaded. Watch for that so the navbar title
        // updates from the generic fallback to the real page name.
        const titleEl = document.querySelector('title');
        if (titleEl) {
            const titleObserver = new MutationObserver(() => {
                pageName = getPageName();
                updateNavLayout();
            });
            titleObserver.observe(titleEl, { childList: true });
        }
    }

    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => {
        const open = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
        if (!menu.classList.contains('open')) return;
        if (menu.contains(event.target) || toggle.contains(event.target)) return;
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    });
});
