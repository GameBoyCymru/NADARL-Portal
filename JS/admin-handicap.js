document.addEventListener('DOMContentLoaded', async () => {
    const panel = document.getElementById('handicapPanel');
    const targetInput = document.getElementById('handicapTarget');
    const divisorInput = document.getElementById('handicapDivisor');
    const offsetInput = document.getElementById('handicapOffset');
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
    divisorInput.value = cfg.divisor;
    offsetInput.value = cfg.offset_value;
    factorInput.value = cfg.factor;

    saveBtn.addEventListener('click', async () => {
        const target = parseFloat(targetInput.value);
        const divisor = parseFloat(divisorInput.value);
        const offset_value = parseFloat(offsetInput.value);
        const factor = parseFloat(factorInput.value);
        if (isNaN(target) || target < 0) { show('Enter a valid target.', 'error'); return; }
        if (isNaN(divisor) || divisor === 0) { show('Enter a valid non-zero divisor.', 'error'); return; }
        if (isNaN(offset_value)) { show('Enter a valid offset.', 'error'); return; }
        if (isNaN(factor) || factor < 0) { show('Enter a valid factor.', 'error'); return; }
        saveBtn.disabled = true;
        const res = await NADARL.updateHandicapConfig({ target, divisor, offset_value, factor });
        saveBtn.disabled = false;
        if (res.ok) {
            targetInput.value = res.config.target;
            divisorInput.value = res.config.divisor;
            offsetInput.value = res.config.offset_value;
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
