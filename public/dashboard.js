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

    // Elements for Puter provider filter (optional)
    const puterFilterSection = document.getElementById('puter-filter-section');
    const puterSearch = document.getElementById('puter-search');
    const puterFamiliesList = document.getElementById('puter-families-list');
    let allPuterFamilies = [];

    // --- Initial Setup ---
    fetchAndDisplayApiKeys();

    // --- Event Listeners ---
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
                    logoUrl = 'assets/claude.jpg';
                    break;
                case 'gemini':
                    logoUrl = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.7.2/icons/gear.svg';
                    break;
                case 'openai':
                    logoUrl = 'assets/openai.svg';
                    break;
                case 'puter':
                    logoUrl = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.7.2/icons/gear.svg';
                    break;
                case 'rtm':
                    logoUrl = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.7.2/icons/gear.svg';
                    break;
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

            // Refresh the API key list
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
            copyKeyButton.textContent = 'Copied!';
            setTimeout(() => { copyKeyButton.textContent = 'Copy'; }, 2000);
        });
    });

    // --- Functions ---
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

    // --- API Key History Functions ---
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
        } catch (error) {
            apiKeyHistoryContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }

    function renderApiKeys(keys) {
        if (keys.length === 0) {
            apiKeyHistoryContainer.innerHTML = '<p>No API keys generated yet.</p>';
            return;
        }
        apiKeyHistoryContainer.innerHTML = ''; // Clear previous content

        const table = document.createElement('table');
        table.className = 'api-key-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Provider</th>
                    <th>Key (Partial)</th>
                    <th>Created On</th>
                    <th>Action</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement('tbody');
        keys.forEach(key => {
            const tr = document.createElement('tr');
            const partialKey = `...${key.api_key.slice(-12)}`;
            const createdDate = new Date(key.created_at).toLocaleDateString();

            tr.innerHTML = `
                <td>${escapeHtml(key.provider)}</td>
                <td title="${escapeHtml(key.api_key)}">${escapeHtml(partialKey)}</td>
                <td>${createdDate}</td>
                <td><button class="delete-key-btn" data-key-id="${key.id}">Delete</button></td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        apiKeyHistoryContainer.appendChild(table);

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-key-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const keyId = e.target.getAttribute('data-key-id');
                if (confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
                    deleteApiKey(keyId);
                }
            });
        });
    }

    async function deleteApiKey(keyId) {
        try {
            const response = await fetch(`/api/keys/${keyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to delete key.');

            // Refresh the list after successful deletion
            fetchAndDisplayApiKeys();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }
});
