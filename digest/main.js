// Minimal client-side JS for the digest page
// Currently a placeholder — archive filtering could be added here later
// The heavy lifting is done by the Python agent that regenerates this page daily

document.addEventListener('DOMContentLoaded', function () {
    // Smooth scroll for any anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
