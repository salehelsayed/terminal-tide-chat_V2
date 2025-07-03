/**
 * LocalStorage wrapper with JSON serialization and error handling
 */
export class Storage {
  constructor(prefix = 'libp2p') {
    this.prefix = prefix;
    this.storage = window.localStorage;
  }

  /**
   * Get key with prefix
   * 
   * @param {string} key - Storage key
   * @returns {string} Prefixed key
   */
  _getKey(key) {
    return `${this.prefix}-${key}`;
  }

  /**
   * Set value in storage
   * 
   * @param {string} key - Storage key
   * @param {any} value - Value to store (will be JSON serialized)
   */
  set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      this.storage.setItem(this._getKey(key), serialized);
    } catch (error) {
      console.error('Storage set error:', error);
      throw new Error(`Failed to store ${key}: ${error.message}`);
    }
  }

  /**
   * Get value from storage
   * 
   * @param {string} key - Storage key
   * @returns {any} Deserialized value or null if not found
   */
  get(key) {
    try {
      const serialized = this.storage.getItem(this._getKey(key));
      if (serialized === null) {
        return null;
      }
      return JSON.parse(serialized);
    } catch (error) {
      console.error('Storage get error:', error);
      return null;
    }
  }

  /**
   * Check if key exists
   * 
   * @param {string} key - Storage key
   * @returns {boolean} True if key exists
   */
  has(key) {
    return this.storage.getItem(this._getKey(key)) !== null;
  }

  /**
   * Remove value from storage
   * 
   * @param {string} key - Storage key
   */
  remove(key) {
    this.storage.removeItem(this._getKey(key));
  }

  /**
   * Clear all storage with this prefix
   */
  clear() {
    const keysToRemove = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix + '-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => this.storage.removeItem(key));
  }

  /**
   * Get all keys with this prefix
   * 
   * @returns {string[]} Array of keys (without prefix)
   */
  keys() {
    const keys = [];
    const prefixLen = this.prefix.length + 1;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix + '-')) {
        keys.push(key.substring(prefixLen));
      }
    }
    return keys;
  }

  /**
   * Get storage size for this prefix
   * 
   * @returns {number} Approximate size in bytes
   */
  getSize() {
    let size = 0;
    this.keys().forEach(key => {
      const value = this.storage.getItem(this._getKey(key));
      if (value) {
        size += value.length + key.length;
      }
    });
    return size;
  }
}

/**
 * Chat history storage manager
 */
export class ChatHistoryStorage extends Storage {
  constructor() {
    super('libp2p-chat');
    this.MAX_MESSAGES_PER_ROOM = 1000;
  }

  /**
   * Add message to room history
   * 
   * @param {string} roomId - Room identifier
   * @param {object} message - Message object
   */
  addMessage(roomId, message) {
    const historyKey = `history-${roomId}`;
    const messages = this.get(historyKey) || [];
    
    messages.push({
      ...message,
      stored_at: Date.now()
    });
    
    // Limit message history
    if (messages.length > this.MAX_MESSAGES_PER_ROOM) {
      messages.splice(0, messages.length - this.MAX_MESSAGES_PER_ROOM);
    }
    
    this.set(historyKey, messages);
  }

  /**
   * Get room history
   * 
   * @param {string} roomId - Room identifier
   * @param {number} limit - Maximum messages to return
   * @returns {object[]} Message array
   */
  getHistory(roomId, limit = 100) {
    const historyKey = `history-${roomId}`;
    const messages = this.get(historyKey) || [];
    
    if (limit && messages.length > limit) {
      return messages.slice(-limit);
    }
    
    return messages;
  }

  /**
   * Clear room history
   * 
   * @param {string} roomId - Room identifier
   */
  clearHistory(roomId) {
    const historyKey = `history-${roomId}`;
    this.remove(historyKey);
  }

  /**
   * Get all room IDs with history
   * 
   * @returns {string[]} Array of room IDs
   */
  getRoomIds() {
    return this.keys()
      .filter(key => key.startsWith('history-'))
      .map(key => key.substring(8));
  }
}

/**
 * Settings storage manager
 */
export class SettingsStorage extends Storage {
  constructor() {
    super('libp2p-settings');
    this.defaults = {
      nickname: 'Anonymous',
      theme: 'terminal-green',
      fontSize: 14,
      soundEnabled: true,
      notificationsEnabled: false,
      autoConnect: true,
      debugMode: false
    };
  }

  /**
   * Get setting value with default fallback
   * 
   * @param {string} key - Setting key
   * @returns {any} Setting value
   */
  getSetting(key) {
    const value = this.get(key);
    return value !== null ? value : this.defaults[key];
  }

  /**
   * Set setting value
   * 
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  setSetting(key, value) {
    this.set(key, value);
  }

  /**
   * Get all settings
   * 
   * @returns {object} All settings with defaults
   */
  getAllSettings() {
    const settings = { ...this.defaults };
    this.keys().forEach(key => {
      settings[key] = this.get(key);
    });
    return settings;
  }

  /**
   * Reset to defaults
   */
  resetToDefaults() {
    this.clear();
  }
}

/**
 * Friends storage manager
 */
export class FriendsStorage extends Storage {
  constructor() {
    super('libp2p-friends');
  }

  /**
   * Add friend
   * 
   * @param {string} peerId - Friend's peer ID
   * @param {object} metadata - Friend metadata (nickname, etc)
   */
  addFriend(peerId, metadata = {}) {
    const friends = this.get('list') || {};
    friends[peerId] = {
      ...metadata,
      added_at: Date.now(),
      peerId
    };
    this.set('list', friends);
  }

  /**
   * Remove friend
   * 
   * @param {string} peerId - Friend's peer ID
   */
  removeFriend(peerId) {
    const friends = this.get('list') || {};
    delete friends[peerId];
    this.set('list', friends);
  }

  /**
   * Get friend
   * 
   * @param {string} peerId - Friend's peer ID
   * @returns {object|null} Friend data or null
   */
  getFriend(peerId) {
    const friends = this.get('list') || {};
    return friends[peerId] || null;
  }

  /**
   * Get all friends
   * 
   * @returns {object} Friends map
   */
  getAllFriends() {
    return this.get('list') || {};
  }

  /**
   * Update friend metadata
   * 
   * @param {string} peerId - Friend's peer ID
   * @param {object} metadata - Updated metadata
   */
  updateFriend(peerId, metadata) {
    const friends = this.get('list') || {};
    if (friends[peerId]) {
      friends[peerId] = {
        ...friends[peerId],
        ...metadata,
        updated_at: Date.now()
      };
      this.set('list', friends);
    }
  }

  /**
   * Check if peer is friend
   * 
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} True if friend
   */
  isFriend(peerId) {
    const friends = this.get('list') || {};
    return peerId in friends;
  }
}