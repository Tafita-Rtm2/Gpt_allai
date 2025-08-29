document.addEventListener('DOMContentLoaded', () => {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        window.location.href = '/index.html';
        return;
    }

    // --- DOM Elements ---
    const userEmailSpan = document.getElementById('user-email'); // Will need to fetch this
    const logoutButton = document.getElementById('logout-button');
    const providerDropdown = document.getElementById('provider-dropdown');
    const generateKeyButton = document.getElementById('generate-key-button');
    const apiKeyDisplay = document.getElementById('api-key-display');
    const apiKeyCode = document.getElementById('api-key-code');
    const copyKeyButton = document.getElementById('copy-key-button');
    const historyContainer = document.getElementById('history-container');

    // Elements for Puter provider filter (optional)
    const puterFilterSection = document.getElementById('puter-filter-section');
    const puterSearch = document.getElementById('puter-search');
    const puterFamiliesList = document.getElementById('puter-families-list');
    let allPuterFamilies = [];

    // --- Initial Setup ---
    fetchAndDisplayHistory();

    // --- Event Listeners ---
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        window.location.href = '/index.html';
    });

    providerDropdown.addEventListener('change', async () => {
        const selectedProvider = providerDropdown.value;
        generateKeyButton.disabled = !selectedProvider;
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

        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            generateKeyButton.textContent = 'Generate Key';
            generateKeyButton.disabled = !providerDropdown.value;
        }
    });

    copyKeyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(apiKeyCode.textContent).then(() => {
            copyKeyButton.textContent = 'Copied!';
            setTimeout(() => { copyKeyButton.textContent = 'Copy'; }, 2000);
        });
    });

    // --- Functions ---
    async function fetchAndDisplayHistory() {
        try {
            const response = await fetch('/api/history', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!response.ok) {
                 if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('authToken');
                    window.location.href = '/index.html';
                }
                throw new Error('Could not fetch history.');
            }
            const history = await response.json();
            renderHistory(history);
        } catch (error) {
            historyContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }

    function renderHistory(history) {
        if (history.length === 0) {
            historyContainer.innerHTML = '<p>No chat history found.</p>';
            return;
        }
        historyContainer.innerHTML = '';
        history.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'history-item';

            const date = new Date(item.timestamp).toLocaleString();
            const model = item.model;

            let userMessage = 'No user message found.';
            try {
                const messages = JSON.parse(item.messages);
                const userMsg = messages.find(m => m.role === 'user');
                if (userMsg) {
                    if (typeof userMsg.content === 'string') {
                        userMessage = userMsg.content;
                    } else if (Array.isArray(userMsg.content)) {
                        userMessage = userMsg.content.find(p => p.type === 'text')?.text || 'Image content';
                    }
                }
            } catch (e) { /* ignore parse error */ }

            let assistantResponse = 'No response found.';
            try {
                const response = JSON.parse(item.response);
                assistantResponse = response.content;
            } catch(e) { /* ignore parse error */ }


            itemDiv.innerHTML = `
                <div class="history-meta">
                    <span><strong>Date:</strong> ${date}</span> |
                    <span><strong>Model:</strong> ${model}</span>
                </div>
                <div class="history-convo">
                    <div class="user">
                        <span class="role">You:</span>
                        <pre>${escapeHtml(userMessage)}</pre>
                    </div>
                    <div class="assistant">
                        <span class="role">Assistant:</span>
                        <pre>${escapeHtml(assistantResponse)}</pre>
                    </div>
                </div>
            `;
            historyContainer.appendChild(itemDiv);
        });
    }

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
        // This function is identical to the one in the old script.js
        // For brevity, it is not repeated here but would be included in a real implementation.
        // It renders radio buttons for each Puter model family.
        puterFamiliesList.innerHTML = '';
        const allLabel = document.createElement('label');
        const allRadio = document.createElement('input');
        allRadio.type = 'radio';
        allRadio.name = 'puter-family';
        allRadio.value = '';
        allRadio.checked = true;
        allLabel.appendChild(allRadio);
        allLabel.append(' All Puter Models');
        puterFamiliesList.appendChild(allLabel);

        families.forEach(family => {
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'puter-family';
            radio.value = family;
            label.appendChild(radio);
            label.append(` ${family}`);
            puterFamiliesList.appendChild(label);
        });
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
