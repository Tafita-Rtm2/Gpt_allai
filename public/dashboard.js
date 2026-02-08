document.addEventListener('DOMContentLoaded', () => {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        window.location.href = '/index.html';
        return;
    }

    // --- DOM Elements ---
    const userEmailSpan = document.getElementById('user-email');
    const logoutButton = document.getElementById('logout-button');
    const providerDropdown = document.getElementById('provider-dropdown');
    const generateKeyButton = document.getElementById('generate-key-button');
    const apiKeyDisplay = document.getElementById('api-key-display');
    const apiKeyCode = document.getElementById('api-key-code');
    const copyKeyButton = document.getElementById('copy-key-button');
    const apiKeyHistoryContainer = document.getElementById('api-key-history-container');
    const baseUrlDisplay = document.getElementById('base-url-display');
    const baseUrlPlaceholders = document.querySelectorAll('.base-url-placeholder');

    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');

    // Documentation
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const copyCodeBtns = document.querySelectorAll('.copy-code-btn');

    // Playground
    const playgroundKeySelect = document.getElementById('playground-key-select');
    const playgroundModelSelect = document.getElementById('playground-model-select');
    const chatInput = document.getElementById('chat-input');
    const sendRequestBtn = document.getElementById('send-test-request');
    const chatOutput = document.getElementById('chat-output');

    // Puter filter
    const puterFilterSection = document.getElementById('puter-filter-section');
    const puterFamiliesList = document.getElementById('puter-families-list');
    let allPuterFamilies = [];

    // --- Setup ---
    const currentBaseUrl = `${window.location.origin}/v1`;
    if (baseUrlDisplay) baseUrlDisplay.textContent = currentBaseUrl;
    baseUrlPlaceholders.forEach(p => p.textContent = currentBaseUrl);

    // Get user info
    fetchUserInfo();

    fetchAndDisplayApiKeys();

    // --- Navigation Logic ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');

            // Update active nav item
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Show corresponding section
            sections.forEach(s => {
                s.classList.remove('active');
                if (s.id === sectionId) s.classList.add('active');
            });
        });
    });

    // --- Documentation Tab Logic ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabPanes.forEach(p => {
                p.classList.remove('active');
                if (p.id === tabId) p.classList.add('active');
            });
        });
    });

    copyCodeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const code = btn.previousElementSibling.innerText;
            navigator.clipboard.writeText(code).then(() => {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="bi bi-check"></i> Copied!';
                setTimeout(() => { btn.innerHTML = originalText; }, 2000);
            });
        });
    });

    // --- API Key Generation ---
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        window.location.href = '/index.html';
    });

    providerDropdown.addEventListener('change', async () => {
        const selectedProvider = providerDropdown.value;
        generateKeyButton.disabled = !selectedProvider;

        const providerLogo = document.getElementById('provider-logo');
        if (selectedProvider) {
            let logoUrl = '';
            switch (selectedProvider) {
                case 'claude':
                    logoUrl = 'assets/claude.svg';
                    break;
                case 'gemini':
                    logoUrl = 'assets/gemini.svg';
                    break;
                case 'openai':
                case 'chatgpt5':
                    logoUrl = 'assets/openai.svg';
                    break;
                case 'rtm':
                    logoUrl = 'assets/rtmlogo.jpg';
                    break;
                default:
                    logoUrl = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.7.2/icons/gear.svg';
            }
            providerLogo.src = logoUrl;
            providerLogo.classList.remove('hidden');
        } else {
            providerLogo.classList.add('hidden');
        }

        if (selectedProvider === 'puter') {
            puterFilterSection.classList.remove('hidden');
            if (allPuterFamilies.length === 0) {
                await fetchAndDisplayPuterFamilies();
            }
        } else {
            puterFilterSection.classList.add('hidden');
        }
    });

    generateKeyButton.addEventListener('click', async () => {
        const selectedProvider = providerDropdown.value;
        if (!selectedProvider) return;

        try {
            generateKeyButton.textContent = 'Generating...';
            generateKeyButton.disabled = true;

            const requestBody = { provider: selectedProvider };
            if (selectedProvider === 'puter') {
                const selectedFamilyInput = document.querySelector('input[name="puter-family"]:checked');
                if (selectedFamilyInput && selectedFamilyInput.value) {
                    requestBody.sub_provider = selectedFamilyInput.value;
                }
            }

            const response = await fetch('/api/generate-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate key.');

            apiKeyCode.textContent = data.apiKey;
            apiKeyDisplay.classList.remove('hidden');

            fetchAndDisplayApiKeys();

        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            generateKeyButton.textContent = 'Generate Key';
            generateKeyButton.disabled = !providerDropdown.value;
        }
    });

    copyKeyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(apiKeyCode.textContent).then(() => {
            const originalIcon = copyKeyButton.innerHTML;
            copyKeyButton.innerHTML = '<i class="bi bi-check-lg"></i>';
            setTimeout(() => { copyKeyButton.innerHTML = originalIcon; }, 2000);
        });
    });

    // --- Playground Logic ---
    sendRequestBtn.addEventListener('click', async () => {
        const apiKey = playgroundKeySelect.value;
        const model = playgroundModelSelect.value;
        const message = chatInput.value.trim();

        if (!apiKey) return alert('Please select an API key.');
        if (!message) return alert('Please enter a message.');

        // Add user message to chat
        appendMessage('user', message);
        chatInput.value = '';
        sendRequestBtn.disabled = true;

        const loadingMsg = appendMessage('assistant', 'Thinking...');

        try {
            const response = await fetch(`${currentBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: message }]
                })
            });

            const data = await response.json();
            loadingMsg.remove();

            if (!response.ok) throw new Error(data.error || 'API Request failed.');

            const content = data.choices[0].message.content;
            appendMessage('assistant', content);

        } catch (error) {
            loadingMsg.remove();
            appendMessage('system', `Error: ${error.message}`);
        } finally {
            sendRequestBtn.disabled = false;
        }
    });

    function appendMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        msgDiv.textContent = content;
        chatOutput.appendChild(msgDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
        return msgDiv;
    }

    // --- Helper Functions ---
    async function fetchAndDisplayPuterFamilies() {
        try {
            puterFamiliesList.innerHTML = '<p>Loading...</p>';
            const response = await fetch('/api/puter-families');
            if (!response.ok) throw new Error('Could not fetch Puter families.');
            allPuterFamilies = await response.json();
            renderPuterFamilies(allPuterFamilies);
        } catch (error) {
            puterFamiliesList.innerHTML = '<p style="color: red;">Could not load families.</p>';
        }
    }

    function renderPuterFamilies(families) {
        puterFamiliesList.innerHTML = '';

        const createRadio = (value, labelText, checked = false) => {
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'puter-family';
            radio.value = value;
            radio.checked = checked;
            const span = document.createElement('span');
            span.textContent = labelText;
            label.appendChild(radio);
            label.appendChild(span);
            return label;
        };

        puterFamiliesList.appendChild(createRadio('', 'All Models', true));
        families.forEach(family => {
            puterFamiliesList.appendChild(createRadio(family, family));
        });
    }

    async function fetchAndDisplayApiKeys() {
        try {
            const response = await fetch('/api/keys', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('authToken');
                    window.location.href = '/index.html';
                }
                throw new Error('Could not fetch API keys.');
            }
            const keys = await response.json();
            renderApiKeys(keys);
            updatePlaygroundKeys(keys);
        } catch (error) {
            apiKeyHistoryContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }

    function renderApiKeys(keys) {
        if (keys.length === 0) {
            apiKeyHistoryContainer.innerHTML = '<p>No API keys generated yet.</p>';
            return;
        }

        let html = `
            <table class="api-key-table">
                <thead>
                    <tr>
                        <th>Provider</th>
                        <th>Key (Partial)</th>
                        <th>Created</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        keys.forEach(key => {
            const partialKey = `${key.api_key.substring(0, 8)}...${key.api_key.slice(-8)}`;
            const date = new Date(key.created_at).toLocaleDateString();
            html += `
                <tr>
                    <td><strong>${key.provider.toUpperCase()}</strong></td>
                    <td title="${key.api_key}"><code>${partialKey}</code></td>
                    <td>${date}</td>
                    <td><button class="delete-key-btn" data-id="${key.id}"><i class="bi bi-trash"></i></button></td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        apiKeyHistoryContainer.innerHTML = html;

        document.querySelectorAll('.delete-key-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this key?')) {
                    deleteApiKey(id);
                }
            });
        });
    }

    function updatePlaygroundKeys(keys) {
        const currentVal = playgroundKeySelect.value;
        playgroundKeySelect.innerHTML = '<option value="">-- Select a key --</option>';
        keys.forEach(key => {
            const option = document.createElement('option');
            option.value = key.api_key;
            option.textContent = `${key.provider} (${key.api_key.substring(0, 8)}...)`;
            playgroundKeySelect.appendChild(option);
        });
        playgroundKeySelect.value = currentVal;
    }

    async function fetchUserInfo() {
        try {
            const response = await fetch('/api/me', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                userEmailSpan.textContent = data.email;
            }
        } catch (error) {
            console.error('Failed to fetch user info:', error);
        }
    }

    async function deleteApiKey(keyId) {
        try {
            const response = await fetch(`/api/keys/${keyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!response.ok) throw new Error('Failed to delete key.');
            fetchAndDisplayApiKeys();
        } catch (error) {
            alert(error.message);
        }
    }
});
