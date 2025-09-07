document.addEventListener('DOMContentLoaded', () => {
    const loginFormWrapper = document.getElementById('login-form-wrapper');
    const registerFormWrapper = document.getElementById('register-form-wrapper');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    const loginMessage = document.getElementById('login-message');
    const registerMessage = document.getElementById('register-message');

    // --- Toggle between Login and Register forms ---
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginFormWrapper.classList.remove('active');
        registerFormWrapper.classList.add('active');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerFormWrapper.classList.remove('active');
        loginFormWrapper.classList.add('active');
    });

    // --- Handle Registration ---
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        setMessage(registerMessage, 'Creating account...', 'pending');

        try {
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            setMessage(registerMessage, 'Account created! Please log in.', 'success');
            setTimeout(() => {
                registerFormWrapper.classList.remove('active');
                loginFormWrapper.classList.add('active');
                document.getElementById('login-email').value = email; // Pre-fill email
                registerMessage.textContent = ''; // Clear message
            }, 1500);

        } catch (error) {
            setMessage(registerMessage, error.message, 'error');
        }
    });

    // --- Handle Login ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        setMessage(loginMessage, 'Logging in...', 'pending');

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            if (data.token) {
                localStorage.setItem('authToken', data.token);
                setMessage(loginMessage, 'Success! Redirecting...', 'success');
                // Redirect to a new dashboard page after a short delay
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 1000);
            } else {
                throw new Error('No authentication token received.');
            }

        } catch (error) {
            setMessage(loginMessage, error.message, 'error');
        }
    });

    // --- Password Visibility Toggle ---
    document.querySelectorAll(".toggle-pass").forEach(icon => {
      icon.addEventListener("click", () => {
        let input = icon.previousElementSibling;
        if (input.type === "password") {
          input.type = "text";
          icon.classList.replace("bi-eye-slash", "bi-eye");
        } else {
          input.type = "password";
          icon.classList.replace("bi-eye", "bi-eye-slash");
        }
      });
    });

    // --- Helper function to display messages ---
    function setMessage(element, text, type) {
        element.textContent = text;
        element.className = 'message'; // Reset classes
        if (text) {
            element.classList.add(type); // Add type class like 'success' or 'error'
        }
    }
});
