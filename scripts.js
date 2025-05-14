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
});
