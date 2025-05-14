
document.addEventListener('DOMContentLoaded', async () => { 

    // Supabase Auth Check (keep exactly as shown)
    const supabaseUrl = 'your-supabase-url';
    const supabaseKey = 'your-public-anonymous-key';
    const supabase = supabase.createClient(supabaseUrl, supabaseKey);

    async function checkAuth() {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) {
                if (!window.location.pathname.includes('login.html')) {
                    window.location.href = 'login.html';
                }
            }
        } catch (err) {
            console.error('Supabase auth error:', err);
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = 'login.html';
            }
        }
    }
    await checkAuth();

    // Chart initialization if needed (optional, keep exactly as shown)
    const userGrowthCtx = document.getElementById('userGrowthChart');
    if (userGrowthCtx) {
        new Chart(userGrowthCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Active Users',
                    data: [100, 150, 200, 300, 400, 500, 600, 650, 700, 750, 775, 800],
                    borderColor: '#00e5ff',
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    borderWidth: 2,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // ✨ Magic UI Enhancements ✨

    // Typewriter effect for AI Description
    function typeWriterEffect(element, text, speed = 25) {
        let index = 0;
        element.innerHTML = '';
        const interval = setInterval(() => {
            element.innerHTML += text.charAt(index);
            index++;
            if (index === text.length) clearInterval(interval);
        }, speed);
    }

    // Loading shimmer during fetch
    window.showLoader = function() {
        const gallery = document.getElementById("imageResults");
        gallery.innerHTML = '<div class="loader">Generating...</div>';
    };

    // Animate suggestion buttons
    window.animateTags = function() {
        const tags = document.querySelectorAll("#suggested-tags button");
        tags.forEach((btn, i) => {
            btn.style.opacity = 0;
            btn.style.transform = "translateY(10px)";
            setTimeout(() => {
                btn.style.transition = "all 0.4s ease";
                btn.style.opacity = 1;
                btn.style.transform = "translateY(0)";
            }, i * 100);
        });
    };

    // Glow on hover for new images
    const observer = new MutationObserver(() => {
        document.querySelectorAll("#imageResults img").forEach(img => {
            img.classList.add("animated-glow");
        });
    });
    observer.observe(document.getElementById("imageResults"), { childList: true });

    // Inject global styles for glow & loader
    const style = document.createElement('style');
    style.innerHTML = `
        .animated-glow { transition: box-shadow 0.3s ease; }
        .animated-glow:hover {
            box-shadow: 0 0 10px #00e5ff, 0 0 20px #00e5ff88;
        }
        .loader {
            font-size: 1.2em;
            padding: 30px;
            color: #00e5ff;
            text-align: center;
            animation: pulse 1.2s infinite ease-in-out;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
    `;
    document.head.appendChild(style);
});
