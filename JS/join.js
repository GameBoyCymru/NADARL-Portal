async function initSaleEnquiry() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('type') !== 'sale') return;

    const itemId = params.get('item');
    if (!itemId) return;

    const item = await NADARL.fetchSaleItemById(itemId);
    if (!item) return;

    document.getElementById('joinIntroTitle').textContent = 'Enquire About This Item';
    document.getElementById('joinIntroText').textContent =
        "You're enquiring about the item below. Fill in your details and a member of our committee will get back to you.";

    document.getElementById('saleEnquiryName').textContent = item.name || 'Item for sale';
    const priceEl = document.getElementById('saleEnquiryPrice');
    if (item.price) {
        priceEl.textContent = item.price;
        priceEl.hidden = false;
    }
    document.getElementById('saleEnquiryDescription').textContent = item.description || '';
    document.getElementById('saleEnquirySection').hidden = false;

    const enquiryTypeSelect = document.getElementById('enquiryType');
    enquiryTypeSelect.value = 'sale';
    enquiryTypeSelect.classList.add('locked-field');
    enquiryTypeSelect.setAttribute('tabindex', '-1');
    enquiryTypeSelect.setAttribute('aria-readonly', 'true');

    const messageLines = [`Enquiry about: ${item.name || 'item for sale'}`];
    if (item.price) messageLines.push(`Price: ${item.price}`);
    if (item.description) messageLines.push('', item.description);

    const message = document.getElementById('message');
    message.value = messageLines.join('\n');
    message.readOnly = true;
    message.classList.add('locked-field');
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('joinForm');

    initSaleEnquiry();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = new FormData(form);

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: data,
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                alert('Thank you for your enquiry. A member of the committee will be in touch soon.');
                form.reset();
            } else {
                alert('Something went wrong. Please try again later.');
            }
        } catch {
            alert('Something went wrong. Please try again later.');
        }
    });
});
