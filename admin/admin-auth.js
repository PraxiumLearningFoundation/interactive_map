const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const passphrase = document.getElementById('passphrase').value;

  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      window.location.href = 'dashboard.html';
      return;
    }
    if (resp.status === 429) {
      errorEl.textContent = 'Too many attempts. Please wait 15 minutes and try again.';
    } else {
      errorEl.textContent = 'Incorrect passphrase.';
    }
    errorEl.hidden = false;
  } catch (err) {
    errorEl.textContent = 'Could not reach the server. Please try again.';
    errorEl.hidden = false;
  }
});
