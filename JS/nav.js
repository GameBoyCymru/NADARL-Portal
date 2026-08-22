document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMobile');
    const topnav = document.querySelector('.topnav');
    const brand = topnav ? topnav.querySelector('.nav-brand') : null;
    const links = topnav ? topnav.querySelector('.nav-links') : null;

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

        const updateNavMode = () => {
            const available = topnav.clientWidth - brand.offsetWidth - TOPNAV_GAP - SAFETY_MARGIN;
            const fits = measure.scrollWidth <= available;
            topnav.classList.toggle('nav-fit', fits);
            if (fits && menu) {
                menu.classList.remove('open');
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }
        };

        updateNavMode();

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(updateNavMode, 100);
        });
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
