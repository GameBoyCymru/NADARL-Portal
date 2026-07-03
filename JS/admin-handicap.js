document.addEventListener('DOMContentLoaded', async () => {
    const panel = document.getElementById('handicapPanel');
    const targetInput = document.getElementById('handicapTarget');
    const factorInput = document.getElementById('handicapFactor');
    const saveBtn = document.getElementById('handicapSave');
    const message = document.getElementById('handicapMessage');
    if (!panel) return;

    const me = await NADARL.fetchMyProfile();
    if (!me || me.role !== 'admin') {
        panel.hidden = true;
        return;
    }

    const cfg = await NADARL.fetchHandicapConfig();
    targetInput.value = cfg.target;
    factorInput.value = cfg.factor;

    saveBtn.addEventListener('click', async () => {
        const target = parseFloat(targetInput.value);
        const factor = parseFloat(factorInput.value);
        if (isNaN(target) || target < 0) { show('Enter a valid target.', 'error'); return; }
        if (isNaN(factor) || factor < 0) { show('Enter a valid factor.', 'error'); return; }
        saveBtn.disabled = true;
        const res = await NADARL.updateHandicapConfig({ target, factor });
        saveBtn.disabled = false;
        if (res.ok) {
            targetInput.value = res.config.target;
            factorInput.value = res.config.factor;
            show('Handicap formula saved.', 'success');
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
