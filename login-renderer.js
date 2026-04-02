const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const deviceCodeBox = document.getElementById('deviceCodeBox');
const deviceCode = document.getElementById('deviceCode');
const copyBtn = document.getElementById('copyBtn');
const errorContainer = document.getElementById('errorContainer');

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(deviceCode.textContent);
    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => {
        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }, 1500);
});

loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    loginBtnText.textContent = 'Starting...';

    const result = await window.api.authStartLogin();

    if (result.error) {
        errorContainer.innerHTML = `<div class="error-msg">${escapeHtml(result.error)}</div>`;
        loginBtn.disabled = false;
        loginBtnText.textContent = 'Login with GitHub';
        return;
    }

    deviceCode.textContent = result.userCode;
    deviceCodeBox.style.display = 'block';
    loginBtnText.textContent = 'Waiting...';
});

window.api.onAuthError((data) => {
    errorContainer.innerHTML = `<div class="error-msg">${escapeHtml(data.error)}</div>`;
    deviceCodeBox.style.display = 'none';
    loginBtn.disabled = false;
    loginBtnText.textContent = 'Login with GitHub';
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
