/**
 * scripts.js - Main JavaScript for Victory Vision platform
 * Handles authentication, UI effects, and image generation
 */

document.addEventListener('DOMContentLoaded', async () => { 
    // Console log for troubleshooting
    console.log('Victory Vision scripts initialized');
    
    // ======== AUTHENTICATION ========
    // Supabase Auth Check (kept exactly as shown)
    const supabaseUrl = 'your-supabase-url';
    const supabaseKey = 'your-public-anonymous-key';
    let supabase;
    
    try {
        supabase = supabaseClient.createClient(supabaseUrl, supabaseKey);
        console.log('Supabase client initialized');
    } catch (err) {
        console.error('Supabase client initialization error:', err);
        // Continue without auth in development/testing
    }
    
    async function checkAuth() {
        if (!supabase) return;
        
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
    
    // Only check auth in production environments
    if (!window.location.hostname.includes('localhost') && supabase) {
        await checkAuth();
    }
    
    // ======== CHART INITIALIZATION ========
    // Chart initialization if needed (kept exactly as shown)
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
    
    // ======== MAGIC UI ENHANCEMENTS ========
    
    // Typewriter effect for AI Description
    window.typeWriterEffect = function(element, text, speed = 25) {
        let index = 0;
        element.innerHTML = '';
        const interval = setInterval(() => {
            element.innerHTML += text.charAt(index);
            index++;
            if (index === text.length) clearInterval(interval);
        }, speed);
    };
    
    // Loading shimmer during fetch
    window.showLoader = function() {
        const gallery = document.getElementById("imageResults");
        if (gallery) {
            gallery.innerHTML = '<div class="spinner"></div><div class="loader">Generating your images...</div>';
        }
        
        // Also update status message
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
    
    // Update status message
    window.updateStatus = function(message) {
        const statusDiv = document.getElementById("status-message");
        if (statusDiv) {
            statusDiv.textContent = message;
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
    
    // ======== IMAGE GENERATION PAGE ========
    // Attach event listener to generate button if it exists
    const generateBtn = document.getElementById('generateBtn');
    if (!generateBtn) {
        // Try the alternative button ID
        const alternateBtn = document.querySelector('button[onclick="generateImage()"]');
        if (alternateBtn) {
            console.log('Found alternate generate button');
            alternateBtn.removeAttribute('onclick');
            alternateBtn.addEventListener('click', window.generateImage);
        }
    } else {
        console.log('Found generate button');
        generateBtn.addEventListener('click', window.generateImage);
    }
});

// ======== MAIN IMAGE GENERATION FUNCTIONS ========

// Main function to generate image
window.generateImage = async function() {
    console.log('generateImage function called');
    
    const prompt = document.getElementById('imagePrompt').value;
    const fileInput = document.getElementById('imageUpload');
    const tagsDiv = document.getElementById("suggested-tags");
    const descDiv = document.getElementById("refinement-desc");
    const resultsDiv = document.getElementById("imageResults");
    
    if (!prompt && (!fileInput || !fileInput.files[0])) {
        window.updateStatus('Please enter a prompt or upload an image');
        return;
    }
    
    // Clear previous results
    if (tagsDiv) tagsDiv.innerHTML = '';
    if (descDiv) descDiv.innerHTML = '';
    if (resultsDiv) resultsDiv.innerHTML = '';
    
    window.showLoader();
    window.updateStatus('Processing your request...');
    
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

// Helper function to read file as base64
window.readFileAsBase64 = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// Send request to n8n webhook with improved error handling
window.sendRequest = async function(prompt, image) {
    console.log('Sending request with prompt:', prompt);
    
    try {
        // Use the correct webhook URL
        const webhookUrl = 'https://victoryvision.app.n8n.cloud/webhook/8c4b0570-4136-4202-afc7-3ba7988d9b19';
        
        window.updateStatus('Connecting to AI service...');
        
        // Add a timeout for the fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
        // Prepare the request body
        const requestBody = {
            prompt: prompt || "Generate an image",
            customer_id: "client-xyz"
        };
        
        // Only add image if it exists
        if (image) {
            requestBody.image = image;
        }
        
        // Make the actual request with error handling
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.status === 500) {
                throw new Error('Server error (500): The AI service is experiencing issues. Please try again later.');
            } else if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            window.updateStatus('Processing AI response...');
            const data = await response.json();
            
            // Process the response
            window.displayResults(data);
            window.hideLoader();
            window.updateStatus('Images generated successfully!');
            
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timed out. The server took too long to respond.');
            } else if (fetchError.message.includes('Failed to fetch')) {
                throw new Error('Cannot connect to the server. Check if the AI service is running.');
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
                    <p>${error.message}</p>
                    <p>Possible solutions:</p>
                    <ul>
                        <li>Check that n8n is running on the server</li>
                        <li>Verify your internet connection</li>
                        <li>Make sure API keys are valid</li>
                        <li>Contact your administrator</li>
                    </ul>
                    <button onclick="window.retryConnection()">Retry Connection</button>
                </div>
            `;
        }
    }
};

// Retry connection function
window.retryConnection = function() {
    window.updateStatus('Retrying connection...');
    
    // Just try a simple HEAD request to see if the server is up
    fetch('https://victoryvision.app.n8n.cloud/webhook/8c4b0570-4136-4202-afc7-3ba7988d9b19', {
        method: 'HEAD',
        cache: 'no-cache'
    })
    .then(response => {
        if (response.ok) {
            window.updateStatus('Connection successful! Try generating an image again.');
            document.getElementById("imageResults").innerHTML = '<p>Server is reachable now. Please try generating an image again.</p>';
        } else {
            window.updateStatus('Server is reachable but returned status: ' + response.status);
        }
    })
    .catch(error => {
        window.updateStatus('Still cannot connect to server: ' + error.message);
    });
};

// Display results in the UI
window.displayResults = function(data) {
    const gallery = document.getElementById("imageResults");
    gallery.innerHTML = '';
    
    if (data.images && data.images.length > 0) {
        data.images.forEach((url, index) => {
            if (!url) return; // Skip empty URLs
            
            const container = document.createElement("div");
            container.className = "image-container";
            
            const img = document.createElement("img");
            img.src = url;
            img.classList.add("animated-glow");
            img.onerror = function() {
                this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f0f0f0"/><text x="40" y="100" font-family="Arial" font-size="12" fill="#999">Image failed to load</text></svg>';
            };
            
            const input = document.createElement("input");
            input.placeholder = "Enter collection name";
            input.id = "collection_" + index;
            
            const saveBtn = document.createElement("button");
            saveBtn.innerText = "💾 Save";
            saveBtn.onclick = () => window.saveToCollection(url, input.value);
            
            const dlBtn = document.createElement("button");
            dlBtn.innerText = "📥 Download";
            dlBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = url;
                a.download = "ai-image.jpg";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
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
    
    // Handle suggestions
    if (data.suggestions) {
        const tagsDiv = document.getElementById("suggested-tags");
        tagsDiv.innerHTML = '<strong>Enhance with:</strong><br>';
        
        if (Array.isArray(data.suggestions)) {
            data.suggestions.forEach(tag => {
                const btn = document.createElement("button");
                btn.innerText = tag;
                btn.onclick = () => {
                    document.getElementById('imagePrompt').value += ' ' + tag;
                };
                btn.style.margin = '4px';
                tagsDiv.appendChild(btn);
            });
            window.animateTags();
        } else {
            // Handle string of suggestions
            const tags = data.suggestions.split(',').map(t => t.trim());
            tags.forEach(tag => {
                if (!tag) return;
                const btn = document.createElement("button");
                btn.innerText = tag;
                btn.onclick = () => {
                    document.getElementById('imagePrompt').value += ' ' + tag;
                };
                btn.style.margin = '4px';
                tagsDiv.appendChild(btn);
            });
            window.animateTags();
        }
    }
    
    // Handle description
    if (data.description) {
        const descEl = document.getElementById("refinement-desc");
        window.typeWriterEffect(descEl, "AI Analysis: " + data.description, 20);
    }
};

// Save to collection function
window.saveToCollection = async function(imageUrl, collectionName) {
    if (!collectionName) {
        alert("Please enter a collection name.");
        return;
    }
    
    try {
        window.updateStatus("Saving to collection...");
        
        const saveResponse = await fetch("https://victoryvision.app.n8n.cloud/webhook/save-to-collection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                image_url: imageUrl,
                collection_name: collectionName,
                customer_id: "client-xyz"
            })
        });
        
        if (!saveResponse.ok) {
            throw new Error(`HTTP error! status: ${saveResponse.status}`);
        }
        
        alert("Saved to collection: " + collectionName);
        window.updateStatus("Saved to collection: " + collectionName);
    } catch (error) {
        console.error('Error saving to collection:', error);
        alert("Error saving to collection: " + error.message);
    }
};
