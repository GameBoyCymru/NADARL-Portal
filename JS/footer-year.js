// Fills every element with class "footer-year" with the current year.
// Kept as an external script (not an inline <script>document.write(...)</script>)
// so the CSP script-src doesn't need 'unsafe-inline'.
document.querySelectorAll('.footer-year').forEach(el => {
    el.textContent = new Date().getFullYear();
});
