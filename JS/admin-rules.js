document.addEventListener('DOMContentLoaded', async () => {
    const panel = document.getElementById('rulesPanel');
    const filenameInput = document.getElementById('rulesFilename');
    const saveBtn = document.getElementById('rulesSave');
    const message = document.getElementById('rulesMessage');
    if (!panel) return;

    const me = await NADARL.fetchMyProfile();
    if (!me || me.role !== 'admin') {
        panel.hidden = true;
        return;
    }

    const doc = await NADARL.fetchRulesDocument();
    filenameInput.value = doc.filename || '';

    saveBtn.addEventListener('click', async () => {
        const filename = filenameInput.value.trim();
        saveBtn.disabled = true;
        const res = await NADARL.updateRulesDocument(filename);
        saveBtn.disabled = false;
        if (res.ok) {
            filenameInput.value = res.filename || '';
            show('Rules PDF saved.', 'success');
        } else {
            show('Could not save: ' + (res.error || 'unknown'), 'error');
        }
    });

    function show(text, type) {
        message.textContent = text;
        message.className = 'login-message login-message-' + type;
        message.hidden = false;
    }
});
