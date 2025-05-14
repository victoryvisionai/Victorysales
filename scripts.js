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
