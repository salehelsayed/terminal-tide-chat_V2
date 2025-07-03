/**
 * Debug panel component for displaying node information and testing
 */
export class DebugPanel {
  constructor(panelElement, infoElement, messageElement, sendButton, closeButton) {
    this.panel = panelElement;
    this.info = infoElement;
    this.messageInput = messageElement;
    this.sendButton = sendButton;
    this.closeButton = closeButton;
    
    this.isVisible = false;
    this.nodeStats = null;
    this.updateInterval = null;
    
    // Set up event handlers
    this.setupEventHandlers();
  }
  
  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    this.sendButton.addEventListener('click', () => {
      this.sendRawMessage();
    });
    
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        this.sendRawMessage();
      }
    });
    
    this.closeButton.addEventListener('click', () => {
      this.hide();
    });
  }
  
  /**
   * Toggle debug panel visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  /**
   * Show debug panel
   */
  show() {
    this.isVisible = true;
    this.panel.classList.remove('hidden');
    
    // Start updating stats
    this.updateStats();
    this.updateInterval = setInterval(() => {
      this.updateStats();
    }, 2000);
  }
  
  /**
   * Hide debug panel
   */
  hide() {
    this.isVisible = false;
    this.panel.classList.add('hidden');
    
    // Stop updating stats
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  /**
   * Update node statistics display
   */
  updateStats() {
    if (!this.nodeStats || !this.isVisible) return;
    
    const statsHtml = `
      <div class="debug-section">
        <h4>Node Information</h4>
        <div class="debug-item">
          <span class="debug-label">Peer ID:</span>
          <span class="debug-value">${this.nodeStats.peerId}</span>
        </div>
        <div class="debug-item">
          <span class="debug-label">Connections:</span>
          <span class="debug-value">${this.nodeStats.connectionCount}</span>
        </div>
        <div class="debug-item">
          <span class="debug-label">Protocols:</span>
          <span class="debug-value">${this.nodeStats.protocols.length}</span>
        </div>
      </div>
      
      <div class="debug-section">
        <h4>Addresses</h4>
        ${this.nodeStats.addresses.map(addr => `
          <div class="debug-item">
            <span class="debug-value mono">${this.escapeHtml(addr)}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="debug-section">
        <h4>Active Connections</h4>
        ${this.nodeStats.connections.length > 0 ? 
          this.nodeStats.connections.map(conn => `
            <div class="debug-connection">
              <div class="debug-item">
                <span class="debug-label">Peer:</span>
                <span class="debug-value">${this.shortenPeerId(conn.peer)}</span>
              </div>
              <div class="debug-item">
                <span class="debug-label">Direction:</span>
                <span class="debug-value">${conn.direction}</span>
              </div>
              <div class="debug-item">
                <span class="debug-label">Status:</span>
                <span class="debug-value">${conn.status}</span>
              </div>
            </div>
          `).join('') :
          '<div class="debug-item">No active connections</div>'
        }
      </div>
      
      <div class="debug-section">
        <h4>Registered Protocols</h4>
        ${this.nodeStats.protocols.map(proto => `
          <div class="debug-item">
            <span class="debug-value mono">${this.escapeHtml(proto)}</span>
          </div>
        `).join('')}
      </div>
    `;
    
    this.info.innerHTML = statsHtml;
  }
  
  /**
   * Set node statistics
   * 
   * @param {object} stats - Node statistics
   */
  setNodeStats(stats) {
    this.nodeStats = stats;
    if (this.isVisible) {
      this.updateStats();
    }
  }
  
  /**
   * Send raw message
   */
  sendRawMessage() {
    const messageText = this.messageInput.value.trim();
    if (!messageText) return;
    
    try {
      const message = JSON.parse(messageText);
      this.onSendRawMessage?.(message);
      this.messageInput.value = '';
      this.addLog('Sent raw message', 'success');
    } catch (error) {
      this.addLog(`Invalid JSON: ${error.message}`, 'error');
    }
  }
  
  /**
   * Add log entry
   * 
   * @param {string} message - Log message
   * @param {string} type - Log type (info, success, error)
   */
  addLog(message, type = 'info') {
    const logEl = document.createElement('div');
    logEl.className = `debug-log debug-log-${type}`;
    logEl.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    
    // Add to info panel
    this.info.appendChild(logEl);
    
    // Auto-scroll
    this.info.scrollTop = this.info.scrollHeight;
    
    // Remove old logs if too many
    const logs = this.info.querySelectorAll('.debug-log');
    if (logs.length > 100) {
      logs[0].remove();
    }
  }
  
  /**
   * Set raw message handler
   * 
   * @param {Function} handler - Message handler
   */
  setRawMessageHandler(handler) {
    this.onSendRawMessage = handler;
  }
  
  /**
   * Shorten peer ID for display
   * 
   * @param {string} peerId - Full peer ID
   * @returns {string} Shortened peer ID
   */
  shortenPeerId(peerId) {
    if (!peerId) return 'Unknown';
    if (peerId.length <= 16) return peerId;
    return `${peerId.slice(0, 6)}...${peerId.slice(-6)}`;
  }
  
  /**
   * Escape HTML to prevent XSS
   * 
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Add debug panel styles
const style = document.createElement('style');
style.textContent = `
  .debug-section {
    margin-bottom: 1rem;
  }
  
  .debug-section h4 {
    color: var(--accent);
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    text-transform: uppercase;
  }
  
  .debug-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.3rem;
    font-size: 0.8rem;
  }
  
  .debug-label {
    color: var(--text-secondary);
  }
  
  .debug-value {
    color: var(--text-primary);
    word-break: break-all;
  }
  
  .debug-value.mono {
    font-family: monospace;
    font-size: 0.7rem;
  }
  
  .debug-connection {
    background-color: var(--bg-tertiary);
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    border-left: 2px solid var(--border-color);
  }
  
  .debug-log {
    font-size: 0.8rem;
    margin-bottom: 0.2rem;
    padding: 0.2rem 0.5rem;
  }
  
  .debug-log-info {
    color: var(--text-dim);
  }
  
  .debug-log-success {
    color: var(--success);
  }
  
  .debug-log-error {
    color: var(--error);
  }
`;
document.head.appendChild(style);