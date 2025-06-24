/**
 * scripts.js - Main JavaScript for Victory Vision platform
 * Handles authentication, UI effects, and image generation
 * SECURITY ENHANCED VERSION
 */

document.addEventListener('DOMContentLoaded', async () => { 
    // Console log for troubleshooting
    console.log('Victory Vision scripts initialized');
    
    // ======== SECURITY CONFIGURATION ========
    // Rate limiting
    const rateLimiter = {
        attempts: 0,
        maxAttempts: 10,
        windowMs: 300000, // 5 minutes
        lastReset: Date.now(),
        
        canMakeRequest: function() {
            const now = Date.now();
            if (now - this.lastReset > this.windowMs) {
                this.attempts = 0;
                this.lastReset = now;
            }
            return this.attempts < this.maxAttempts;
        },
        
        recordAttempt: function() {
            this.attempts++;
        }
    };
    
    // Input sanitization
    function sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
    }
    
    // URL validation
    function isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'https:' && urlObj.hostname.includes('victoryvision.app');
        } catch {
            return false;
        }
    }
    
    // ======== AUTHENTICATION ========
    // Supabase Auth Check (SECURE VERSION)
    const supabaseUrl = 'https://nyyvsdkumxvuwimmucdb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZzZGt1bXh2dXdpbW11Y2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzY5OTQsImV4cCI6MjA1OTMxMjk5NH0.7m7R_8mBhp7X8itl5cR81xbX2AjJUm2SIPR0FUv6ouU';
    let supabase;
    let CUSTOMER_ID = null;
    
    try {
        if (window.supabase) {
            supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
            console.log('Supabase client initialized');
        }
    } catch (err) {
        console.error('Supabase client initialization error:', err);
    }
    
    async function checkAuth() {
        if (!supabase) return false;
        
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error || !session) {
                return false;
            }
            
            CUSTOMER_ID = session.user.email;
            return true;
        } catch (err) {
            console.error('Supabase auth error:', err);
            return false;
        }
    }
    
    // Only check auth on protected pages
    const protectedPages = ['companyprofile', 'campaigns', 'media', 'pages', 'social', 'contacts', 'ads', 'ai', 'settings'];
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    
    if (protectedPages.includes(currentPage) && supabase) {
        const isAuthenticated = await checkAuth();
        if (!isAuthenticated) {
            window.location.href = 'login.html';
            return;
        }
    }
    
    // ======== CHART INITIALIZATION ========
    // Chart initialization if needed (secured)
    const userGrowthCtx = document.getElementById('userGrowthChart');
    if (userGrowthCtx && window.Chart) {
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
    
    // ======== MAGIC UI ENHANCEMENTS ========
    
    // Typewriter effect for AI Description
    window.typeWriterEffect = function(element, text, speed = 25) {
        if (!element || typeof text !== 'string') return;
        
        // Sanitize text before displaying
        const cleanText = sanitizeInput(text);
        let index = 0;
        element.textContent = ''; // Use textContent instead of innerHTML
        
        const interval = setInterval(() => {
            element.textContent += cleanText.charAt(index);
            index++;
            if (index === cleanText.length) clearInterval(interval);
        }, speed);
    };
    
    // Loading shimmer during fetch
    window.showLoader = function() {
        const gallery = document.getElementById("imageResults");
        if (gallery) {
            gallery.innerHTML = '<div class="spinner"></div><div class="loader">Generating your images...</div>';
        }
        
        const statusMessage = document.getElementById("status-message");
        if (statusMessage) {
            statusMessage.textContent = "Processing your request. This may take up to 30 seconds...";
        }
    };
    
    // Hide loader
    window.hideLoader = function() {
        const statusMessage = document.getElementById("status-message");
        if (statusMessage) {
            statusMessage.textContent = "";
        }
    };
    
    // Update status message (secured)
    window.updateStatus = function(message) {
        const statusDiv = document.getElementById("status-message");
        if (statusDiv && typeof message === 'string') {
            statusDiv.textContent = sanitizeInput(message);
        }
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
    const imageResults = document.getElementById("imageResults");
    if (imageResults) {
        const observer = new MutationObserver(() => {
            document.querySelectorAll("#imageResults img").forEach(img => {
                img.classList.add("animated-glow");
            });
        });
        observer.observe(imageResults, { childList: true });
    }
    
    // Inject global styles for glow & loader (XSS safe)
    const style = document.createElement('style');
    style.textContent = `
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
        .error-message {
            background: #f8d7da;
            color: #721c24;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
            border: 1px solid #f5c6cb;
        }
        .error-message h3 {
            margin-top: 0;
        }
        .error-message ul {
            margin: 10px 0;
            padding-left: 20px;
        }
    `;
    document.head.appendChild(style);
    
    // ======== IMAGE GENERATION PAGE ========
    // Attach event listener to generate button if it exists (secured)
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        console.log('Found generate button');
        generateBtn.addEventListener('click', window.generateImage);
    } else {
        // Try the alternative button but remove inline onclick for security
        const alternateBtn = document.querySelector('button[onclick*="generateImage"]');
        if (alternateBtn) {
            console.log('Found alternate generate button');
            alternateBtn.removeAttribute('onclick');
            alternateBtn.addEventListener('click', window.generateImage);
        }
    }
});

// ======== MAIN IMAGE GENERATION FUNCTIONS ========

// Main function to generate image (SECURED)
window.generateImage = async function() {
    console.log('generateImage function called');
    
    // Rate limiting check
    if (!rateLimiter.canMakeRequest()) {
        window.updateStatus('Too many requests. Please wait before trying again.');
        return;
    }
    
    const promptElement = document.getElementById('imagePrompt');
    const fileInput = document.getElementById('imageUpload');
    const tagsDiv = document.getElementById("suggested-tags");
    const descDiv = document.getElementById("refinement-desc");
    const resultsDiv = document.getElementById("imageResults");
    
    if (!promptElement) {
        window.updateStatus('Prompt input not found');
        return;
    }
    
    const prompt = sanitizeInput(promptElement.value);
    
    if (!prompt && (!fileInput || !fileInput.files[0])) {
        window.updateStatus('Please enter a prompt or upload an image');
        return;
    }
    
    // Validate file if uploaded
    if (fileInput && fileInput.files[0]) {
        const file = fileInput.files[0];
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        
        if (file.size > maxSize) {
            window.updateStatus('File too large. Maximum size is 5MB.');
            return;
        }
        
        if (!allowedTypes.includes(file.type)) {
            window.updateStatus('Invalid file type. Please upload JPEG, PNG, GIF, or WebP images only.');
            return;
        }
    }
    
    // Clear previous results
    if (tagsDiv) tagsDiv.innerHTML = '';
    if (descDiv) descDiv.innerHTML = '';
    if (resultsDiv) resultsDiv.innerHTML = '';
    
    window.showLoader();
    window.updateStatus('Processing your request...');
    
    rateLimiter.recordAttempt();
    
    try {
        // Check if we have a file
        let imageBase64 = null;
        if (fileInput && fileInput.files[0]) {
            imageBase64 = await window.readFileAsBase64(fileInput.files[0]);
            console.log('Image loaded as base64');
        }
        
        // Now send the request
        await window.sendRequest(prompt, imageBase64);
        
    } catch (error) {
        console.error('Error in generateImage:', error);
        window.updateStatus('Error: ' + error.message);
        window.hideLoader();
    }
};

// Helper function to read file as base64 (SECURED)
window.readFileAsBase64 = function(file) {
    return new Promise((resolve, reject) => {
        // Additional file validation
        if (!file || !(file instanceof File)) {
            reject(new Error('Invalid file'));
            return;
        }
        
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const result = reader.result;
                if (typeof result === 'string' && result.includes(',')) {
                    const base64 = result.split(',')[1];
                    resolve(base64);
                } else {
                    reject(new Error('Invalid file format'));
                }
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('File reading failed'));
        reader.readAsDataURL(file);
    });
};

// Send request to n8n webhook with improved error handling (SECURED)
window.sendRequest = async function(prompt, image) {
    console.log('Sending request with prompt:', prompt);
    
    try {
        // Validate inputs
        if (typeof prompt !== 'string') {
            throw new Error('Invalid prompt format');
        }
        
        // Use secure webhook URL - replace with your actual secure endpoint
        const webhookUrl = 'https://victoryvision.app.n8n.cloud/webhook/media/create';
        
        if (!isValidUrl(webhookUrl)) {
            throw new Error('Invalid webhook URL');
        }
        
        window.updateStatus('Connecting to AI service...');
        
        // Add a timeout for the fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
        // Prepare the request body with authentication
        const requestBody = {
            prompt: prompt || "Generate an image",
            customer_id: CUSTOMER_ID || "anonymous"
        };
        
        // Only add image if it exists and is valid
        if (image && typeof image === 'string') {
            requestBody.image = image;
        }
        
        // Make the actual request with security headers
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Customer-ID': CUSTOMER_ID || 'anonymous',
                    'X-Request-ID': generateRequestId()
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
                mode: 'cors',
                credentials: 'omit'
            });
            
            clearTimeout(timeoutId);
            
            if (response.status === 500) {
                throw new Error('Server error: The AI service is experiencing issues. Please try again later.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please wait before making another request.');
            } else if (response.status === 401 || response.status === 403) {
                throw new Error('Authentication required. Please log in again.');
            } else if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            window.updateStatus('Processing AI response...');
            const data = await response.json();
            
            // Validate response data
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid response format');
            }
            
            // Process the response
            window.displayResults(data);
            window.hideLoader();
            window.updateStatus('Images generated successfully!');
            
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timed out. The server took too long to respond.');
            } else if (fetchError.message.includes('Failed to fetch')) {
                throw new Error('Cannot connect to the server. Please check your connection.');
            } else {
                throw fetchError;
            }
        }
        
    } catch (error) {
        console.error('Error in sendRequest:', error);
        
        // Handle the error in the UI
        window.hideLoader();
        window.updateStatus('Error: ' + error.message);
        
        // Show a helpful error message in the results area
        const resultsDiv = document.getElementById("imageResults");
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <div class="error-message">
                    <h3>⚠️ Connection Error</h3>
                    <p>${sanitizeInput(error.message)}</p>
                    <p>Please try again or contact support if the problem persists.</p>
                </div>
            `;
        }
    }
};

// Generate secure request ID
function generateRequestId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Display results in the UI (SECURED)
window.displayResults = function(data) {
    const gallery = document.getElementById("imageResults");
    if (!gallery) return;
    
    gallery.innerHTML = '';
    
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        data.images.forEach((url, index) => {
            if (!url || typeof url !== 'string' || !isValidUrl(url)) return; // Skip invalid URLs
            
            const container = document.createElement("div");
            container.className = "image-container";
            
            const img = document.createElement("img");
            img.src = url;
            img.classList.add("animated-glow");
            img.alt = `Generated image ${index + 1}`;
            img.onerror = function() {
                this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f0f0f0"/><text x="40" y="100" font-family="Arial" font-size="12" fill="#999">Image failed to load</text></svg>';
            };
            
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = "Enter collection name";
            input.id = "collection_" + index;
            input.maxLength = 50; // Limit input length
            
            const saveBtn = document.createElement("button");
            saveBtn.textContent = "💾 Save";
            saveBtn.type = "button";
            saveBtn.onclick = () => {
                const collectionName = sanitizeInput(input.value);
                if (collectionName) {
                    window.saveToCollection(url, collectionName);
                }
            };
            
            const dlBtn = document.createElement("button");
            dlBtn.textContent = "📥 Download";
            dlBtn.type = "button";
            dlBtn.onclick = () => {
                try {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ai-image-${Date.now()}.jpg`;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } catch (error) {
                    console.error('Download failed:', error);
                    window.updateStatus('Download failed: ' + error.message);
                }
            };
            
            container.appendChild(img);
            container.appendChild(document.createElement("br"));
            container.appendChild(input);
            container.appendChild(saveBtn);
            container.appendChild(dlBtn);
            gallery.appendChild(container);
        });
    } else {
        gallery.innerHTML = '<p>No images were generated. Try a different prompt.</p>';
    }
    
    // Handle suggestions (secured)
    if (data.suggestions) {
        const tagsDiv = document.getElementById("suggested-tags");
        if (tagsDiv) {
            tagsDiv.innerHTML = '<strong>Enhance with:</strong><br>';
            
            let suggestions = [];
            if (Array.isArray(data.suggestions)) {
                suggestions = data.suggestions;
            } else if (typeof data.suggestions === 'string') {
                suggestions = data.suggestions.split(',').map(t => t.trim());
            }
            
            suggestions.slice(0, 10).forEach(tag => { // Limit to 10 suggestions
                const cleanTag = sanitizeInput(tag);
                if (!cleanTag) return;
                
                const btn = document.createElement("button");
                btn.textContent = cleanTag;
                btn.type = "button";
                btn.onclick = () => {
                    const promptElement = document.getElementById('imagePrompt');
                    if (promptElement) {
                        promptElement.value += ' ' + cleanTag;
                    }
                };
                btn.style.margin = '4px';
                tagsDiv.appendChild(btn);
            });
            window.animateTags();
        }
    }
    
    // Handle description (secured)
    if (data.description && typeof data.description === 'string') {
        const descEl = document.getElementById("refinement-desc");
        if (descEl) {
            window.typeWriterEffect(descEl, "AI Analysis: " + data.description, 20);
        }
    }
};

// Save to collection function (SECURED)
window.saveToCollection = async function(imageUrl, collectionName) {
    if (!collectionName || typeof collectionName !== 'string') {
        window.updateStatus("Please enter a valid collection name.");
        return;
    }
    
    if (!imageUrl || !isValidUrl(imageUrl)) {
        window.updateStatus("Invalid image URL.");
        return;
    }
    
    // Rate limiting check
    if (!rateLimiter.canMakeRequest()) {
        window.updateStatus('Too many requests. Please wait before trying again.');
        return;
    }
    
    try {
        window.updateStatus("Saving to collection...");
        
        const saveUrl = "https://victoryvision.app.n8n.cloud/webhook/media/save";
        
        if (!isValidUrl(saveUrl)) {
            throw new Error('Invalid save URL');
        }
        
        const saveResponse = await fetch(saveUrl, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                'X-Customer-ID': CUSTOMER_ID || 'anonymous'
            },
            body: JSON.stringify({
                image_url: imageUrl,
                collection_name: sanitizeInput(collectionName),
                customer_id: CUSTOMER_ID || "anonymous"
            }),
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (!saveResponse.ok) {
            throw new Error(`HTTP error! status: ${saveResponse.status}`);
        }
        
        rateLimiter.recordAttempt();
        window.updateStatus("Saved to collection: " + collectionName);
    } catch (error) {
        console.error('Error saving to collection:', error);
        window.updateStatus("Error saving to collection: " + error.message);
    }
};
