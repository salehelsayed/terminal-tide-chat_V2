/**
 * User list component for displaying online peers
 */
export class UserList {
  constructor(containerElement) {
    this.container = containerElement;
    this.users = new Map();
    this.selectedUser = null;
  }
  
  /**
   * Add or update a user in the list
   * 
   * @param {string} peerId - Peer ID
   * @param {object} info - User information
   */
  addUser(peerId, info = {}) {
    const userInfo = {
      peerId,
      nickname: info.nickname || this.shortenPeerId(peerId),
      status: info.status || 'online',
      lastSeen: Date.now(),
      ...info
    };
    
    this.users.set(peerId, userInfo);
    this.render();
  }
  
  /**
   * Remove a user from the list
   * 
   * @param {string} peerId - Peer ID
   */
  removeUser(peerId) {
    this.users.delete(peerId);
    if (this.selectedUser === peerId) {
      this.selectedUser = null;
    }
    this.render();
  }
  
  /**
   * Update user information
   * 
   * @param {string} peerId - Peer ID
   * @param {object} updates - Updates to apply
   */
  updateUser(peerId, updates) {
    const user = this.users.get(peerId);
    if (user) {
      Object.assign(user, updates);
      this.render();
    }
  }
  
  /**
   * Clear all users
   */
  clear() {
    this.users.clear();
    this.selectedUser = null;
    this.render();
  }
  
  /**
   * Render the user list
   */
  render() {
    this.container.innerHTML = '';
    
    if (this.users.size === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'user-list-empty';
      emptyEl.textContent = 'No users online';
      emptyEl.style.color = 'var(--text-dim)';
      emptyEl.style.textAlign = 'center';
      emptyEl.style.padding = '1rem';
      this.container.appendChild(emptyEl);
      return;
    }
    
    // Sort users by nickname
    const sortedUsers = Array.from(this.users.values()).sort((a, b) => 
      a.nickname.localeCompare(b.nickname)
    );
    
    sortedUsers.forEach(user => {
      const userEl = this.createUserElement(user);
      this.container.appendChild(userEl);
    });
  }
  
  /**
   * Create user element
   * 
   * @param {object} user - User information
   * @returns {HTMLElement} User element
   */
  createUserElement(user) {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    if (user.peerId === this.selectedUser) {
      userEl.classList.add('selected');
    }
    
    userEl.innerHTML = `
      <div class="user-info">
        <div class="user-name">${this.escapeHtml(user.nickname)}</div>
        <div class="user-id" style="font-size: 0.7rem; color: var(--text-dim);">
          ${this.shortenPeerId(user.peerId)}
        </div>
      </div>
      <div class="user-status ${user.status}">${user.status}</div>
    `;
    
    // Click handler
    userEl.addEventListener('click', () => {
      this.selectUser(user.peerId);
    });
    
    // Double click for DM
    userEl.addEventListener('dblclick', () => {
      this.onUserDoubleClick?.(user);
    });
    
    return userEl;
  }
  
  /**
   * Select a user
   * 
   * @param {string} peerId - Peer ID to select
   */
  selectUser(peerId) {
    this.selectedUser = peerId;
    this.render();
    
    const user = this.users.get(peerId);
    if (user && this.onUserSelect) {
      this.onUserSelect(user);
    }
  }
  
  /**
   * Get selected user
   * 
   * @returns {object|null} Selected user or null
   */
  getSelectedUser() {
    return this.selectedUser ? this.users.get(this.selectedUser) : null;
  }
  
  /**
   * Get all users
   * 
   * @returns {Map} All users
   */
  getUsers() {
    return new Map(this.users);
  }
  
  /**
   * Get user by peer ID
   * 
   * @param {string} peerId - Peer ID
   * @returns {object|null} User or null
   */
  getUser(peerId) {
    return this.users.get(peerId) || null;
  }
  
  /**
   * Set user select handler
   * 
   * @param {Function} handler - Selection handler
   */
  setUserSelectHandler(handler) {
    this.onUserSelect = handler;
  }
  
  /**
   * Set user double click handler
   * 
   * @param {Function} handler - Double click handler
   */
  setUserDoubleClickHandler(handler) {
    this.onUserDoubleClick = handler;
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
  
  /**
   * Update online status for all users
   * 
   * @param {Set} onlinePeers - Set of online peer IDs
   */
  updateOnlineStatus(onlinePeers) {
    this.users.forEach((user, peerId) => {
      const status = onlinePeers.has(peerId) ? 'online' : 'offline';
      if (user.status !== status) {
        user.status = status;
      }
    });
    this.render();
  }
}