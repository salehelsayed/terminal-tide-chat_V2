/**
 * Settings component for managing application preferences
 */
export class Settings {
  constructor(containerElement, storage) {
    this.container = containerElement;
    this.storage = storage;
    this.currentTab = 'general';
    
    // Initialize tab handlers
    this.setupTabs();
  }
  
  /**
   * Set up tab click handlers
   */
  setupTabs() {
    const tabs = document.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });
    
    // Show initial tab
    this.switchTab('general');
  }
  
  /**
   * Switch to a different settings tab
   * 
   * @param {string} tabName - Name of the tab to switch to
   */
  switchTab(tabName) {
    this.currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Render tab content
    this.renderTabContent();
  }
  
  /**
   * Render content for the current tab
   */
  renderTabContent() {
    this.container.innerHTML = '';
    
    switch(this.currentTab) {
      case 'general':
        this.renderGeneralSettings();
        break;
      case 'display':
        this.renderDisplaySettings();
        break;
      case 'audio':
        this.renderAudioSettings();
        break;
      case 'files':
        this.renderFilesSettings();
        break;
    }
  }
  
  /**
   * Render general settings
   */
  renderGeneralSettings() {
    const settings = this.storage.getAllSettings();
    
    this.container.innerHTML = `
      <div class="setting-group">
        <label for="auto-connect">Auto-connect on startup</label>
        <input type="checkbox" id="auto-connect" ${settings.autoConnect ? 'checked' : ''}>
      </div>
      
      <div class="setting-group">
        <label for="notifications">Enable notifications</label>
        <input type="checkbox" id="notifications" ${settings.notificationsEnabled ? 'checked' : ''}>
      </div>
      
      <div class="setting-group">
        <label for="debug-mode">Debug mode</label>
        <input type="checkbox" id="debug-mode" ${settings.debugMode ? 'checked' : ''}>
      </div>
      
      <div class="setting-group">
        <button class="terminal-button" id="reset-settings">Reset to Defaults</button>
      </div>
    `;
    
    // Add event handlers
    this.container.querySelector('#auto-connect').addEventListener('change', (e) => {
      this.storage.setSetting('autoConnect', e.target.checked);
      this.onSettingChange?.('autoConnect', e.target.checked);
    });
    
    this.container.querySelector('#notifications').addEventListener('change', (e) => {
      this.storage.setSetting('notificationsEnabled', e.target.checked);
      this.onSettingChange?.('notificationsEnabled', e.target.checked);
    });
    
    this.container.querySelector('#debug-mode').addEventListener('change', (e) => {
      this.storage.setSetting('debugMode', e.target.checked);
      this.onSettingChange?.('debugMode', e.target.checked);
    });
    
    this.container.querySelector('#reset-settings').addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        this.storage.resetToDefaults();
        this.renderTabContent();
        this.onSettingsReset?.();
      }
    });
  }
  
  /**
   * Render display settings
   */
  renderDisplaySettings() {
    const settings = this.storage.getAllSettings();
    
    this.container.innerHTML = `
      <div class="setting-group">
        <label for="theme">Theme</label>
        <select id="theme" class="terminal-input">
          <option value="terminal-green" ${settings.theme === 'terminal-green' ? 'selected' : ''}>
            Terminal Green
          </option>
          <option value="terminal-amber" ${settings.theme === 'terminal-amber' ? 'selected' : ''}>
            Terminal Amber
          </option>
          <option value="terminal-blue" ${settings.theme === 'terminal-blue' ? 'selected' : ''}>
            Terminal Blue
          </option>
        </select>
      </div>
      
      <div class="setting-group">
        <label for="font-size">Font Size</label>
        <input type="range" id="font-size" min="10" max="20" value="${settings.fontSize}">
        <span id="font-size-value">${settings.fontSize}px</span>
      </div>
      
      <div class="setting-group">
        <label for="timestamp-format">Timestamp Format</label>
        <select id="timestamp-format" class="terminal-input">
          <option value="12h" ${settings.timestampFormat === '12h' ? 'selected' : ''}>
            12 Hour
          </option>
          <option value="24h" ${settings.timestampFormat === '24h' ? 'selected' : ''}>
            24 Hour
          </option>
        </select>
      </div>
    `;
    
    // Add event handlers
    this.container.querySelector('#theme').addEventListener('change', (e) => {
      this.storage.setSetting('theme', e.target.value);
      this.onSettingChange?.('theme', e.target.value);
    });
    
    const fontSizeInput = this.container.querySelector('#font-size');
    const fontSizeValue = this.container.querySelector('#font-size-value');
    
    fontSizeInput.addEventListener('input', (e) => {
      const size = parseInt(e.target.value);
      fontSizeValue.textContent = `${size}px`;
      this.storage.setSetting('fontSize', size);
      this.onSettingChange?.('fontSize', size);
    });
    
    this.container.querySelector('#timestamp-format').addEventListener('change', (e) => {
      this.storage.setSetting('timestampFormat', e.target.value);
      this.onSettingChange?.('timestampFormat', e.target.value);
    });
  }
  
  /**
   * Render audio settings
   */
  renderAudioSettings() {
    const settings = this.storage.getAllSettings();
    
    this.container.innerHTML = `
      <div class="setting-group">
        <label for="sound-enabled">Enable sounds</label>
        <input type="checkbox" id="sound-enabled" ${settings.soundEnabled ? 'checked' : ''}>
      </div>
      
      <div class="setting-group">
        <label for="message-sound">Message notification sound</label>
        <select id="message-sound" class="terminal-input">
          <option value="beep" ${settings.messageSound === 'beep' ? 'selected' : ''}>
            Beep
          </option>
          <option value="ping" ${settings.messageSound === 'ping' ? 'selected' : ''}>
            Ping
          </option>
          <option value="none" ${settings.messageSound === 'none' ? 'selected' : ''}>
            None
          </option>
        </select>
      </div>
      
      <div class="setting-group">
        <label for="volume">Volume</label>
        <input type="range" id="volume" min="0" max="100" value="${settings.volume || 50}">
        <span id="volume-value">${settings.volume || 50}%</span>
      </div>
      
      <div class="setting-group">
        <button class="terminal-button" id="test-sound">Test Sound</button>
      </div>
    `;
    
    // Add event handlers
    this.container.querySelector('#sound-enabled').addEventListener('change', (e) => {
      this.storage.setSetting('soundEnabled', e.target.checked);
      this.onSettingChange?.('soundEnabled', e.target.checked);
    });
    
    this.container.querySelector('#message-sound').addEventListener('change', (e) => {
      this.storage.setSetting('messageSound', e.target.value);
      this.onSettingChange?.('messageSound', e.target.value);
    });
    
    const volumeInput = this.container.querySelector('#volume');
    const volumeValue = this.container.querySelector('#volume-value');
    
    volumeInput.addEventListener('input', (e) => {
      const volume = parseInt(e.target.value);
      volumeValue.textContent = `${volume}%`;
      this.storage.setSetting('volume', volume);
      this.onSettingChange?.('volume', volume);
    });
    
    this.container.querySelector('#test-sound').addEventListener('click', () => {
      this.onTestSound?.();
    });
  }
  
  /**
   * Render file sharing settings
   */
  renderFilesSettings() {
    const settings = this.storage.getAllSettings();
    
    this.container.innerHTML = `
      <div class="setting-group">
        <label for="auto-accept">Auto-accept files from friends</label>
        <input type="checkbox" id="auto-accept" ${settings.autoAcceptFiles ? 'checked' : ''}>
      </div>
      
      <div class="setting-group">
        <label for="download-path">Download directory</label>
        <input type="text" id="download-path" class="terminal-input" 
               value="${settings.downloadPath || 'Downloads'}" readonly>
        <button class="terminal-button" id="change-path">Change</button>
      </div>
      
      <div class="setting-group">
        <label for="max-file-size">Max file size (MB)</label>
        <input type="number" id="max-file-size" class="terminal-input" 
               value="${settings.maxFileSize || 100}" min="1" max="1000">
      </div>
      
      <div class="setting-group">
        <label>File sharing is a planned feature</label>
        <div style="color: var(--text-dim); font-size: 0.9rem;">
          File sharing will be available in a future update
        </div>
      </div>
    `;
    
    // Add event handlers
    this.container.querySelector('#auto-accept').addEventListener('change', (e) => {
      this.storage.setSetting('autoAcceptFiles', e.target.checked);
      this.onSettingChange?.('autoAcceptFiles', e.target.checked);
    });
    
    this.container.querySelector('#max-file-size').addEventListener('change', (e) => {
      const size = parseInt(e.target.value);
      this.storage.setSetting('maxFileSize', size);
      this.onSettingChange?.('maxFileSize', size);
    });
  }
  
  /**
   * Set setting change handler
   * 
   * @param {Function} handler - Handler function
   */
  setSettingChangeHandler(handler) {
    this.onSettingChange = handler;
  }
  
  /**
   * Set settings reset handler
   * 
   * @param {Function} handler - Handler function
   */
  setSettingsResetHandler(handler) {
    this.onSettingsReset = handler;
  }
  
  /**
   * Set test sound handler
   * 
   * @param {Function} handler - Handler function
   */
  setTestSoundHandler(handler) {
    this.onTestSound = handler;
  }
}