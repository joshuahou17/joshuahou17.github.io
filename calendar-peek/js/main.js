// Calendar Peek Landing Site JavaScript
console.log('🗓️ Calendar Peek loaded successfully!');

// Navigation scroll behavior
let lastScrollTop = 0;
const nav = document.querySelector('.centered-nav');

window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Show nav when scrolling up, hide when scrolling down
    if (scrollTop > lastScrollTop && scrollTop > 100) {
        // Scrolling down
        nav.classList.remove('visible');
    } else {
        // Scrolling up
        nav.classList.add('visible');
    }
    
    lastScrollTop = scrollTop;
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Welcome message
console.log('🚀 Ready to export your calendar dates!'); 