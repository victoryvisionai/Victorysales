document.addEventListener('DOMContentLoaded', () => {
    // Insert header dynamically
    const headerHTML = `
    <div class="logo">
        <img src="logo.jpg" alt="Victory Vision Logo">
    </div>
    <nav>
        <ul>
            <li><a href="ai-opt.html">🤖 AI</a></li>
            <li><a href="images.html">Images</a></li>
            <li><a href="videos.html">Videos</a></li>
            <li><a href="pages.html">Pages</a></li>
            <li><a href="ads.html">Ads</a></li>
            <li><a href="leads.html">Leads</a></li>
            <li><a href="social.html">Social</a></li>
            <li><a href="messages.html">Messages</a></li>
            <li><a href="settings.html">⚙️ Settings</a></li>
        </ul>
    </nav>`;

    document.querySelector('.navbar').innerHTML = headerHTML;

    // Initialize User Growth Chart
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

    // Initialize Revenue Growth Chart
    const revenueGrowthCtx = document.getElementById('revenueGrowthChart');
    if (revenueGrowthCtx) {
        new Chart(revenueGrowthCtx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Revenue ($)',
                    data: [50000, 75000, 100000, 150000, 200000, 250000, 300000, 325000, 350000, 375000, 390000, 400000],
                    backgroundColor: '#00e5ff'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
});
