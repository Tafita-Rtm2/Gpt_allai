document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('main-content');
    const startButton = document.getElementById('start-button');
    const apiKeySection = document.getElementById('api-key-section');
    const apiKeyCode = document.getElementById('api-key-code');
    const copyButton = document.getElementById('copy-button');

    startButton.addEventListener('click', async () => {
        try {
            // Show loading state if needed
            startButton.textContent = 'Generating...';
            startButton.disabled = true;

            const response = await fetch('/api/generate-key', {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to generate API key.');
            }

            const data = await response.json();

            if (data.apiKey) {
                apiKeyCode.textContent = data.apiKey;
                mainContent.classList.add('hidden');
                apiKeySection.classList.remove('hidden');
            }

        } catch (error) {
            console.error('Error generating API key:', error);
            alert('Could not generate an API key. Please try again later.');
            startButton.textContent = 'Get Started';
            startButton.disabled = false;
        }
    });

    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(apiKeyCode.textContent).then(() => {
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
                copyButton.textContent = 'Copy';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy key. Please copy it manually.');
        });
    });
});
