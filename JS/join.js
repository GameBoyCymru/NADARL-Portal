document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('joinForm');

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
