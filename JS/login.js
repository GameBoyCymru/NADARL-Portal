const EDITOR_ROLES = ['captain', 'generic', 'admin'];

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const button = document.getElementById('loginButton');
    const message = document.getElementById('loginMessage');

    const loggedInPanel = document.getElementById('loggedInPanel');
    const loggedInEmail = document.getElementById('loggedInEmail');
    const loggedInRole = document.getElementById('loggedInRole');
    const logoutButton = document.getElementById('logoutButton');
    const loginStatus = document.getElementById('loginStatus');

    if (!window.db) {
        showMessage('Unable to connect to the league database. Please try again later.', 'error');
        form.querySelector('input, button').disabled = true;
        return;
    }

    init();

    async function init() {
        const profile = await NADARL.fetchMyProfile();
        if (profile && EDITOR_ROLES.indexOf(profile.role) !== -1) {
            showLoggedIn(profile);
        } else {
            hideLoggedIn();
            loginStatus.hidden = false;
            loginStatus.textContent = 'You are not logged in.';
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessage();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showMessage('Please enter both your email and password.', 'error');
            return;
        }

        setLoading(true);

        const { data, error } = await window.db.auth.signInWithPassword({ email, password });

        if (error) {
            setLoading(false);
            showMessage(invalidCredentialsMessage(error), 'error');
            passwordInput.value = '';
            return;
        }

        const profile = await NADARL.fetchMyProfile();

        if (!profile) {
            await window.db.auth.signOut();
            setLoading(false);
            showMessage(
                'Your account is not set up yet. If you have just signed up, ' +
                'a league administrator needs to approve your request first.',
                'error'
            );
            passwordInput.value = '';
            return;
        }

        if (profile.role === 'pending') {
            await window.db.auth.signOut();
            setLoading(false);
            showMessage(
                'Your account is awaiting approval from a league administrator. ' +
                'You will be able to sign in once it has been activated.',
                'error'
            );
            passwordInput.value = '';
            return;
        }

        if (EDITOR_ROLES.indexOf(profile.role) === -1) {
            await window.db.auth.signOut();
            setLoading(false);
            showMessage(
                'Your account is not authorised to access this area. Only league ' +
                'admins, captains and team accounts may sign in.',
                'error'
            );
            passwordInput.value = '';
            return;
        }

        showLoggedIn(profile);
        showMessage('Signed in successfully. Redirecting…', 'success');
        setLoading(false);
        setTimeout(() => { window.location.href = 'fixtures.html'; }, 1000);
    });

    logoutButton.addEventListener('click', async () => {
        await window.db.auth.signOut();
        hideLoggedIn();
        form.reset();
        showMessage('You have been signed out.', 'success');
    });

    function showLoggedIn(profile) {
        form.hidden = true;
        loggedInPanel.hidden = false;
        loggedInEmail.textContent = profile.email || 'committee member';
        loggedInRole.textContent = profile.role;
        const adminLink = document.getElementById('adminLink');
        if (adminLink) adminLink.hidden = profile.role !== 'admin';
        loginStatus.textContent = '';
        loginStatus.hidden = true;
    }

    function hideLoggedIn() {
        loggedInPanel.hidden = true;
        form.hidden = false;
        loginStatus.hidden = false;
        loginStatus.textContent = 'You are not logged in.';
    }

    function setLoading(loading) {
        button.disabled = loading;
        button.textContent = loading ? 'Signing in…' : 'Sign In';
    }

    function showMessage(text, type) {
        message.textContent = text;
        message.className = 'login-message login-message-' + type;
        message.hidden = false;
    }

    function clearMessage() {
        message.hidden = true;
        message.textContent = '';
        message.className = 'login-message';
    }

    function invalidCredentialsMessage(error) {
        if (error && error.status === 400) {
            return 'Incorrect email or password. Please try again.';
        }
        return 'Unable to sign in. Please check your details and try again.';
    }
});
