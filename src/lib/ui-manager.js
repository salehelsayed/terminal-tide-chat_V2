/**
 * UI Manager - Coordinates all UI components and state
 */
export class UIManager {
  constructor(components, storage) {
    this.terminal = components.terminal;
    this.userList = components.userList;
    this.settings = components.settings;
    this.debugPanel = components.debugPanel;
    this.storage = storage;
    
    this.currentChannel = '#Terminal';
    this.currentDM = null;
    
    // Initialize UI state
    this.initializeUI();
  }
  
  /**
   * Initialize UI elements and state
   */
  initializeUI() {
    // Set initial channel
    this.updateChannelDisplay(this.currentChannel);
    
    // Load and apply saved settings
    this.applySettings();
    
    // Set up nickname input
    const nicknameInput = document.getElementById('nickname-input');
    const savedNickname = this.storage.getSetting('nickname');
    nicknameInput.value = savedNickname;
    
    nicknameInput.addEventListener('change', (e) => {
      const nickname = e.target.value.trim() || 'Anonymous';
      this.storage.setSetting('nickname', nickname);
      this.onNicknameChange?.(nickname);
    });
    
    // Set up add friend functionality
    const addFriendBtn = document.getElementById('add-friend-btn');
    const addFriendInput = document.getElementById('add-friend-input');
    
    addFriendBtn.addEventListener('click', () => {
      const peerId = addFriendInput.value.trim();
      if (peerId) {
        this.onAddFriend?.(peerId);
        addFriendInput.value = '';
      }
    });
    
    addFriendInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addFriendBtn.click();
      }
    });
    
    // Set up key export/import
    const exportKeysBtn = document.getElementById('export-keys-btn');
    exportKeysBtn.addEventListener('click', () => {
      this.showKeyModal('export');
    });
    
    // Set up modal handlers
    this.setupModalHandlers();
  }
  
  /**
   * Apply saved settings to UI
   */
  applySettings() {
    const settings = this.storage.getAllSettings();
    
    // Apply theme
    document.documentElement.setAttribute('data-theme', settings.theme);
    
    // Apply font size
    document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
    
    // Apply other settings as needed
  }
  
  /**
   * Update connection status display
   * 
   * @param {string} status - Connection status (connected, connecting, disconnected)
   * @param {number} count - Number of connections
   */
  updateConnectionStatus(status, count = 0) {
    const statusIndicator = document.getElementById('connection-status');
    const statusText = document.getElementById('connection-text');
    const connectionCount = document.getElementById('connection-count');
    
    // Update indicator
    statusIndicator.className = `status-indicator ${status}`;
    
    // Update text
    switch(status) {
      case 'connected':
        statusText.textContent = `Connected (${count})`;
        break;
      case 'connecting':
        statusText.textContent = 'Connecting...';
        break;
      case 'disconnected':
        statusText.textContent = 'Disconnected';
        break;
    }
    
    // Update connection count
    if (connectionCount) {
      connectionCount.textContent = count.toString();
    }
  }
  
  /**
   * Update peer ID display
   * 
   * @param {string} peerId - Local peer ID
   */
  updatePeerId(peerId) {
    const peerIdEl = document.getElementById('peer-id');
    if (peerIdEl) {
      peerIdEl.textContent = peerId;
      peerIdEl.title = peerId; // Show full ID on hover
    }
  }
  
  /**
   * Update DHT status display
   * 
   * @param {string} status - DHT status
   */
  updateDHTStatus(status) {
    const dhtStatusEl = document.getElementById('dht-status');
    if (dhtStatusEl) {
      dhtStatusEl.textContent = status;
    }
  }
  
  /**
   * Update channel display
   * 
   * @param {string} channel - Current channel name
   * @param {string} info - Additional channel info
   */
  updateChannelDisplay(channel, info = '') {
    const channelEl = document.getElementById('current-channel');
    const channelInfoEl = document.getElementById('channel-info');
    
    if (channelEl) {
      channelEl.textContent = channel;
    }
    
    if (channelInfoEl) {
      channelInfoEl.textContent = info;
    }
    
    this.currentChannel = channel;
  }
  
  /**
   * Switch to direct message mode
   * 
   * @param {string} peerId - Peer ID for DM
   * @param {string} nickname - Peer nickname
   */
  switchToDM(peerId, nickname) {
    this.currentDM = peerId;
    this.updateChannelDisplay(`DM: ${nickname}`, peerId);
    this.terminal.setPrompt(`@${nickname} >`);
  }
  
  /**
   * Switch back to public channel
   */
  switchToPublic() {
    this.currentDM = null;
    this.updateChannelDisplay('#Terminal');
    this.terminal.setPrompt('>');
  }
  
  /**
   * Show key export/import modal
   * 
   * @param {string} mode - 'export' or 'import'
   */
  showKeyModal(mode) {
    const modal = document.getElementById('key-modal');
    const modalTitle = document.getElementById('modal-title');
    const keyTextarea = document.getElementById('key-textarea');
    const copyBtn = document.getElementById('copy-keys-btn');
    const importBtn = document.getElementById('import-keys-btn');
    
    modal.classList.remove('hidden');
    
    if (mode === 'export') {
      modalTitle.textContent = 'Export Keys';
      const keyData = this.onExportKeys?.();
      keyTextarea.value = JSON.stringify(keyData, null, 2);
      keyTextarea.readOnly = true;
      copyBtn.style.display = 'block';
      importBtn.style.display = 'none';
    } else {
      modalTitle.textContent = 'Import Keys';
      keyTextarea.value = '';
      keyTextarea.readOnly = false;
      copyBtn.style.display = 'none';
      importBtn.style.display = 'block';
    }
  }
  
  /**
   * Hide key modal
   */
  hideKeyModal() {
    const modal = document.getElementById('key-modal');
    modal.classList.add('hidden');
  }
  
  /**
   * Set up modal event handlers
   */
  setupModalHandlers() {
    const modal = document.getElementById('key-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const copyBtn = document.getElementById('copy-keys-btn');
    const importBtn = document.getElementById('import-keys-btn');
    const keyTextarea = document.getElementById('key-textarea');
    
    closeModalBtn.addEventListener('click', () => {
      this.hideKeyModal();
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideKeyModal();
      }
    });
    
    // Copy to clipboard
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(keyTextarea.value);
        this.terminal.displaySuccess('Keys copied to clipboard');
        this.hideKeyModal();
      } catch (error) {
        this.terminal.displayError('Failed to copy keys');
      }
    });
    
    // Import keys
    importBtn.addEventListener('click', async () => {
      try {
        const keyData = JSON.parse(keyTextarea.value);
        await this.onImportKeys?.(keyData);
        this.terminal.displaySuccess('Keys imported successfully');
        this.hideKeyModal();
      } catch (error) {
        this.terminal.displayError('Invalid key data');
      }
    });
  }
  
  /**
   * Show notification
   * 
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} options - Additional options
   */
  async showNotification(title, body, options = {}) {
    const settings = this.storage.getAllSettings();
    
    if (!settings.notificationsEnabled) return;
    
    // Check if we have permission
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        ...options
      });
    } else if (Notification.permission !== 'denied') {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, { body, ...options });
      }
    }
  }
  
  /**
   * Play sound effect
   * 
   * @param {string} soundType - Type of sound to play
   */
  playSound(soundType) {
    const settings = this.storage.getAllSettings();
    
    if (!settings.soundEnabled) return;
    
    // Play sound based on type and settings
    // This would be implemented with Web Audio API or audio elements
  }
  
  /**
   * Set event handlers
   * 
   * @param {object} handlers - Event handler functions
   */
  setEventHandlers(handlers) {
    Object.assign(this, handlers);
  }
}