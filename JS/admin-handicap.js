document.addEventListener('DOMContentLoaded', async () => {
    const panel = document.getElementById('handicapPanel');
    const targetInput = document.getElementById('handicapTarget');
    const divisorInput = document.getElementById('handicapDivisor');
    const offsetInput = document.getElementById('handicapOffset');
    const factorInput = document.getElementById('handicapFactor');
    const saveBtn = document.getElementById('handicapSave');
    const message = document.getElementById('handicapMessage');
    const calcAverageInput = document.getElementById('handicapCalcAverage');
    const calcResult = document.getElementById('handicapCalcResult');
    if (!panel) return;

    // Mirrors the SQL formula in shooter_handicap(): max(0, round(((target -
    // avg) / divisor - offset) * factor, 1)) - using whatever's currently
    // typed into the formula fields (not just the last-saved config), so
    // admins can preview a change before saving it.
    function recalculate() {
        const target = parseFloat(targetInput.value);
        const divisor = parseFloat(divisorInput.value);
        const offset_value = parseFloat(offsetInput.value);
        const factor = parseFloat(factorInput.value);
        const average = parseFloat(calcAverageInput.value);

        if ([target, divisor, offset_value, factor, average].some(isNaN) || divisor === 0) {
            calcResult.textContent = '—';
            return;
        }

        const handicap = Math.max(0, Math.round((((target - average) / divisor) - offset_value) * factor * 10) / 10);
        calcResult.textContent = handicap.toFixed(1);
    }

    [targetInput, divisorInput, offsetInput, factorInput, calcAverageInput].forEach(input => {
        input.addEventListener('input', recalculate);
    });

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
    recalculate();

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
            recalculate();
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
