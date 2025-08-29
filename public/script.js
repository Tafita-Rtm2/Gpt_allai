document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const mainContent = document.getElementById('main-content');
    const startButton = document.getElementById('start-button');
    const apiKeySection = document.getElementById('api-key-section');
    const apiKeyCode = document.getElementById('api-key-code');
    const copyButton = document.getElementById('copy-button');
    const providerDropdown = document.getElementById('provider-dropdown');
    const puterFilterSection = document.getElementById('puter-filter-section');
    const puterSearch = document.getElementById('puter-search');
    const puterFamiliesList = document.getElementById('puter-families-list');

    let allPuterFamilies = []; // Cache for the fetched families

    // --- Event Listeners ---

    // 1. Main Provider Dropdown Change
    providerDropdown.addEventListener('change', async () => {
        const selectedProvider = providerDropdown.value;
        startButton.disabled = !selectedProvider; // Enable button if a provider is chosen

        if (selectedProvider === 'puter') {
            puterFilterSection.classList.remove('hidden');
            // Fetch families only if they haven't been fetched yet
            if (allPuterFamilies.length === 0) {
                await fetchAndDisplayPuterFamilies();
            }
        } else {
            puterFilterSection.classList.add('hidden');
        }
    });

    // 2. Search input for Puter families
    puterSearch.addEventListener('input', () => {
        const searchTerm = puterSearch.value.toLowerCase();
        const filteredFamilies = allPuterFamilies.filter(family => family.toLowerCase().includes(searchTerm));
        renderPuterFamilies(filteredFamilies);
    });

    // 3. Generate Key Button Click
    startButton.addEventListener('click', async () => {
        const selectedProvider = providerDropdown.value;
        if (!selectedProvider) return;

        try {
            startButton.textContent = 'Generating...';
            startButton.disabled = true;

            const requestBody = { provider: selectedProvider };

            // If Puter is selected, check for a sub-family selection
            if (selectedProvider === 'puter') {
                const selectedFamilyInput = document.querySelector('input[name="puter-family"]:checked');
                if (selectedFamilyInput) {
                    requestBody.sub_provider = selectedFamilyInput.value;
                }
            }

            const response = await fetch('/api/generate-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate API key.');
            }

            if (data.apiKey) {
                apiKeyCode.textContent = data.apiKey;
                mainContent.classList.add('hidden');
                apiKeySection.classList.remove('hidden');
            }

        } catch (error) {
            console.error('Error generating API key:', error);
            alert(`Could not generate an API key: ${error.message}`);
        } finally {
            // Reset button state
            startButton.textContent = 'Get Your API Key';
            startButton.disabled = !providerDropdown.value;
        }
    });

    // 4. Copy API Key Button
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(apiKeyCode.textContent).then(() => {
            copyButton.textContent = 'Copied!';
            setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy key. Please copy it manually.');
        });
    });

    // --- Helper Functions ---

    async function fetchAndDisplayPuterFamilies() {
        try {
            puterFamiliesList.innerHTML = '<p>Loading families...</p>';
            const response = await fetch('/api/puter-families');
            if (!response.ok) throw new Error('Could not fetch Puter families.');

            allPuterFamilies = await response.json();
            renderPuterFamilies(allPuterFamilies);

        } catch (error) {
            console.error('Error fetching Puter families:', error);
            puterFamiliesList.innerHTML = '<p style="color: red;">Could not load model families.</p>';
        }
    }

    function renderPuterFamilies(families) {
        puterFamiliesList.innerHTML = ''; // Clear existing list
        if (families.length === 0) {
            puterFamiliesList.innerHTML = '<p>No matching families found.</p>';
            return;
        }

        // Add a "Select All" option first
        const allLabel = document.createElement('label');
        const allRadio = document.createElement('input');
        allRadio.type = 'radio';
        allRadio.name = 'puter-family';
        allRadio.value = ''; // Empty value signifies all
        allRadio.checked = true; // Default to all
        const allSpan = document.createElement('span');
        allSpan.className = 'family-name';
        allSpan.textContent = ' All Puter Models';
        allLabel.appendChild(allRadio);
        allLabel.appendChild(allSpan);
        puterFamiliesList.appendChild(allLabel);

        // Add the rest of the families
        families.forEach(family => {
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'puter-family';
            radio.value = family;

            const span = document.createElement('span');
            span.className = 'family-name';
            span.textContent = ` ${family}`;

            label.appendChild(radio);
            label.appendChild(span);
            puterFamiliesList.appendChild(label);
        });
    }
});
