// =====================================================================
//  Shared admin page gate: every admin-*.html page has its own
//  accessPanel/adminPanel pair (same markup as login.html's pattern) and
//  its own #authButton in the header. This is the one place that decides
//  whether the visitor is an admin and toggles between them - each
//  page's own script (admin-teams.js etc.) only owns its panel's content
//  and re-checks the role itself before touching the database.
// =====================================================================

document.addEventListener('DOMContentLoaded', async () => {
    const accessPanel = document.getElementById('accessPanel');
    const adminPanel = document.getElementById('adminPanel');
    if (!accessPanel || !adminPanel) return;

    if (!window.db) {
        accessPanel.hidden = false;
        adminPanel.hidden = true;
        return;
    }

    const me = await NADARL.fetchMyProfile();
    if (!me || me.role !== 'admin') {
        accessPanel.hidden = false;
        adminPanel.hidden = true;
        return;
    }

    accessPanel.hidden = true;
    adminPanel.hidden = false;

    const authButton = document.getElementById('authButton');
    if (authButton) {
        authButton.hidden = false;
        authButton.onclick = async () => {
            authButton.disabled = true;
            await window.db.auth.signOut();
            window.location.href = 'fixtures.html';
        };
    }
});
