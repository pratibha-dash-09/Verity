const statusNode = document.querySelector('#settings-status');
const messageNode = document.querySelector('#setup-message');
fetch('/api/status').then(response => response.json()).then(status => {
  statusNode.textContent = status.ready ? 'A saved connection is active.' : 'A research connection is needed.';
}).catch(() => { statusNode.textContent = 'Could not reach Verity.'; });
document.querySelector('#key-form').onsubmit = async event => {
  event.preventDefault();
  const input = document.querySelector('#api-key');
  const button = event.target.querySelector('button');
  const key = input.value.trim();
  input.value = '';
  button.disabled = true;
  messageNode.textContent = 'Saving your connection...';
  try {
    const response = await fetch('/api/setup', {method:'POST',
      headers:{'Content-Type':'application/json', 'X-Verity-Admin':document.querySelector('meta[name="admin-token"]').content},
      body:JSON.stringify({key}), signal:AbortSignal.timeout(45000)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    statusNode.textContent = 'A saved connection is active.';
    messageNode.textContent = 'Connection saved. You can return to Verity.';
  } catch (error) {
    messageNode.textContent = error.name === 'TimeoutError' ? 'Connection setup timed out. Try again.' : error.message;
  } finally { button.disabled = false; }
};
