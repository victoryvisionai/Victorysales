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
// Example Chart.js logic (add if you still want charts)
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
document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('userGrowthChart');
    if (ctx) {
        new Chart(ctx, {
            // Chart options and data here
        });
    }

    // Additional charts logic here, following the same structure
});

document.addEventListener('DOMContentLoaded', checkAuth);


document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.querySelector('.navbar');
    if (!navbar) {
        console.error('Navbar element (.navbar) not found.');
        return;
    }

    navbar.innerHTML = `
        <div class="logo">
            <img src="logo.jpg" alt="Victory Vision Logo">
        </div>
        <nav>
            <ul>
                <li><a href="ai-opt.html">🤖</a></li>
                <li><a href="images.html">Images</a></li>
                <li><a href="videos.html">Videos</a></li>
                <li><a href="pages.html">Pages</a></li>
                <li><a href="ads.html">Ads</a></li>
                <li><a href="leads.html">Leads</a></li>
                <li><a href="social.html">Social</a></li>
                <li><a href="messages.html">Messages</a></li>
                <li><a href="settings.html">⚙️</a></li>
            </ul>
        </nav>
    `;
});
