import { createP2PNode, connectToPeer, getNodeStats, stopNode, announceToNetwork } from './lib/p2p-node.js';
import { KeyManager } from './lib/key-manager.js';
import { Storage, ChatHistoryStorage, SettingsStorage, FriendsStorage } from './lib/storage.js';
import { ChatProtocol, CHAT_PROTOCOL } from './lib/chat-protocol.js';
import { Terminal } from './components/terminal.js';
import { UserList } from './components/user-list.js';
import { Settings } from './components/settings.js';
import { DebugPanel } from './components/debug-panel.js';
import { UIManager } from './lib/ui-manager.js';
import { multiaddr } from '@multiformats/multiaddr';

// Import styles
import './styles.css';

/**
 * Main application class
 */
class P2PChatApp {
  constructor() {
    // Initialize storage
    this.storage = new Storage();
    this.chatHistory = new ChatHistoryStorage();
    this.settings = new SettingsStorage();
    this.friends = new FriendsStorage();
    
    // Initialize key manager
    this.keyManager = new KeyManager(this.storage);
    
    // Event emitter for cross-component communication
    this.events = new EventTarget();
    
    // P2P components (initialized in start())
    this.node = null;
    this.chatProtocol = null;
    
    // UI components
    this.terminal = null;
    this.userList = null;
    this.settingsPanel = null;
    this.debugPanel = null;
    this.uiManager = null;
  }
  
  /**
   * Initialize and start the application
   */
  async start() {
    try {
      // Initialize UI components
      this.initializeUI();
      
      // Display startup message
      this.terminal.displaySystem('Initializing P2P Chat Terminal...');
      
      // Initialize or load keys
      const keys = await this.initializeKeys();
      
      // Update UI with peer ID
      this.uiManager.updatePeerId(keys.peerId.toString());
      
      // Create and start P2P node
      this.terminal.displaySystem('Starting P2P node...');
      this.node = await createP2PNode(keys.privateKey);
      
      // Initialize chat protocol
      this.chatProtocol = new ChatProtocol(this.node, this.chatHistory, this.events);
      
      // Expose chat protocol for debugging
      window.chatProtocol = this.chatProtocol;
      
      // Set up P2P event handlers
      this.setupP2PEventHandlers();
      
      // Start the node
      await this.node.start();
      
      // Display success message
      this.terminal.displaySuccess('P2P node started successfully!');
      this.terminal.displaySystem(`Your Peer ID: ${keys.peerId.toString()}`);
      
      // Wait a moment for the node to establish connections
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Display our multiaddrs
      const addrs = this.node.getMultiaddrs();
      console.log('\n[App] 📍 Node Info:');
      console.log('[App] PeerID:', keys.peerId.toString());
      console.log('[App] Listening addresses:');
      addrs.forEach(addr => {
        console.log('   ' + addr.toString());
      });
      
      if (addrs.length > 0) {
        this.terminal.displaySystem('Listening on:');
        addrs.forEach(addr => {
          if (addr.toString().includes('/p2p-circuit/')) {
            this.terminal.displaySystem(`  Circuit: ${addr.toString()}`);
          }
        });
      }
      
      // Manual bootstrap connection (like in the example)
      setTimeout(async () => {
        try {
          console.log('[App] 🔗 Attempting manual bootstrap connection...');
          const bootstrapPeers = [
            '/dns4/mknoun.xyz/tcp/4001/wss/p2p/12D3KooWGMYMmN1RGUYjWaSV6P3XtnBjwnosnJGNMnttfVCRnd6g'
          ];
          
          for (const addr of bootstrapPeers) {
            try {
              const ma = multiaddr(addr);
              console.log('[App] 🔗 Dialing bootstrap:', ma.toString());
              await this.node.dial(ma);
              console.log('[App] ✅ Bootstrap connection successful');
              this.terminal.displaySuccess('Connected to bootstrap node');
            } catch (err) {
              console.log('[App] ⚠️ Bootstrap connection failed:', err.message);
              this.terminal.displaySystem('Bootstrap connection failed, retrying...');
            }
          }
        } catch (err) {
          console.error('[App] ❌ Bootstrap error:', err);
        }
      }, 3000);
      
      // Check supported protocols
      console.log('[App] 📋 Supported protocols:', await this.node.getProtocols());
      
      // Update connection status
      this.updateConnectionStatus();
      
      // Load friends list
      this.loadFriends();
      
      // Auto-connect if enabled
      if (this.settings.getSetting('autoConnect')) {
        this.terminal.displaySystem('Auto-connecting to network...');
        // The bootstrap process should handle initial connections
        // Just ensure we're connected to at least one peer
        setTimeout(() => {
          if (this.node.getConnections().length === 0) {
            this.terminal.displaySystem('No peers found. Try /connect <peer-id> to connect manually.');
          }
        }, 5000);
      }
      
    } catch (error) {
      console.error('Failed to start application:', error);
      this.terminal.displayError(`Failed to start: ${error.message}`);
    }
  }
  
  /**
   * Initialize UI components
   */
  initializeUI() {
    // Initialize terminal
    this.terminal = new Terminal(
      document.getElementById('terminal-output'),
      document.getElementById('terminal-input'),
      document.getElementById('input-prompt')
    );
    
    // Initialize user list
    this.userList = new UserList(
      document.getElementById('user-list')
    );
    
    // Initialize settings panel
    this.settingsPanel = new Settings(
      document.getElementById('settings-content'),
      this.settings
    );
    
    // Initialize debug panel
    this.debugPanel = new DebugPanel(
      document.getElementById('debug-panel'),
      document.getElementById('debug-info'),
      document.getElementById('debug-message'),
      document.getElementById('send-raw-btn'),
      document.getElementById('close-debug')
    );
    
    // Initialize UI manager
    this.uiManager = new UIManager(
      {
        terminal: this.terminal,
        userList: this.userList,
        settings: this.settingsPanel,
        debugPanel: this.debugPanel
      },
      this.settings
    );
    
    // Set up UI event handlers
    this.setupUIEventHandlers();
  }
  
  /**
   * Initialize or load cryptographic keys
   */
  async initializeKeys() {
    // Try to load existing keys
    let keys = await this.keyManager.loadKeys();
    
    if (!keys) {
      // Clear any corrupted keys
      this.keyManager.clearKeys();
      
      // Generate new keys
      this.terminal.displaySystem('Generating new identity...');
      keys = await this.keyManager.generateKeys();
      this.terminal.displaySuccess('New identity created!');
    } else {
      this.terminal.displaySystem('Loaded existing identity');
    }
    
    return keys;
  }
  
  /**
   * Set up P2P event handlers
   */
  setupP2PEventHandlers() {
    // Peer discovery
    this.node.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString();
      console.log('Discovered peer:', peerId);
    });
    
    // Peer connection
    this.node.addEventListener('peer:connect', async (evt) => {
      const peerId = evt.detail.toString();
      this.terminal.displaySuccess(`Connected to peer: ${this.userList.shortenPeerId(peerId)}`);
      
      // Add to user list
      this.userList.addUser(peerId);
      
      // Update connection status
      this.updateConnectionStatus();
      
      // Check if friend
      const friend = this.friends.getFriend(peerId);
      if (friend) {
        this.userList.updateUser(peerId, { nickname: friend.nickname });
      }
    });
    
    // Peer disconnection
    this.node.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString();
      this.terminal.displaySystem(`Disconnected from peer: ${this.userList.shortenPeerId(peerId)}`);
      
      // Update user status
      this.userList.updateUser(peerId, { status: 'offline' });
      
      // Update connection status
      this.updateConnectionStatus();
    });
    
    // Chat protocol events
    this.events.addEventListener('message:received', (evt) => {
      const message = evt.detail;
      this.handleIncomingMessage(message);
    });
    
    this.events.addEventListener('chat:connected', (evt) => {
      const { peerId } = evt.detail;
      console.log('Chat session established with:', peerId);
    });
    
    this.events.addEventListener('peer:nickname', (evt) => {
      const { peerId, nickname } = evt.detail;
      this.userList.updateUser(peerId, { nickname });
      
      // Update friend info if friend
      if (this.friends.isFriend(peerId)) {
        this.friends.updateFriend(peerId, { nickname });
      }
    });
  }
  
  /**
   * Set up UI event handlers
   */
  setupUIEventHandlers() {
    // Terminal message handler
    this.terminal.setMessageHandler(async (content) => {
      if (this.uiManager.currentDM) {
        // Send direct message
        await this.sendDirectMessage(this.uiManager.currentDM, content);
      } else {
        // Broadcast to channel
        await this.broadcastMessage(content);
      }
    });
    
    // Terminal command handlers
    this.terminal.setCommandHandlers({
      onDebugToggle: () => this.debugPanel.toggle(),
      onConnect: (peerId) => this.connectToPeer(peerId),
      onNickname: (nickname) => this.changeNickname(nickname),
      onJoin: (channel) => this.joinChannel(channel),
      onDirectMessage: (peerId, message) => this.sendDirectMessage(peerId, message),
      onResetKeys: () => this.resetKeys(),
      onInfo: () => this.displayNodeInfo(),
      onChat: (peerId) => this.startChatSession(peerId)
    });
    
    // User list handlers
    this.userList.setUserSelectHandler((user) => {
      console.log('Selected user:', user);
      // Switch to DM mode when user is selected
      this.uiManager.switchToDM(user.peerId, user.nickname || user.peerId);
      this.terminal.displaySystem(`Switched to DM with ${this.userList.shortenPeerId(user.peerId)}`);
    });
    
    this.userList.setUserDoubleClickHandler((user) => {
      // Also handle double-click
      this.uiManager.switchToDM(user.peerId, user.nickname || user.peerId);
    });
    
    // Settings handlers
    this.settingsPanel.setSettingChangeHandler((setting, value) => {
      console.log('Setting changed:', setting, value);
      this.uiManager.applySettings();
    });
    
    // UI Manager handlers
    this.uiManager.setEventHandlers({
      onNicknameChange: (nickname) => this.changeNickname(nickname),
      onAddFriend: (peerId) => this.addFriend(peerId),
      onExportKeys: () => this.keyManager.exportKeys(),
      onImportKeys: (keyData) => this.importKeys(keyData)
    });
    
    // Debug panel handlers
    this.debugPanel.setRawMessageHandler(async (message) => {
      // Send raw message to selected peer
      const selectedUser = this.userList.getSelectedUser();
      if (selectedUser) {
        try {
          const session = await this.chatProtocol.openStream(selectedUser.peerId);
          await session.send(message);
          this.debugPanel.addLog('Raw message sent', 'success');
        } catch (error) {
          this.debugPanel.addLog(`Failed to send: ${error.message}`, 'error');
        }
      } else {
        this.debugPanel.addLog('No peer selected', 'error');
      }
    });
  }
  
  /**
   * Handle incoming chat message
   */
  handleIncomingMessage(message) {
    const sender = this.userList.getUser(message.sender) || { nickname: message.sender };
    
    // Display in terminal
    this.terminal.displayChat(
      sender.nickname,
      message.content.body,
      message.origin_ts
    );
    
    // Show notification if not focused
    if (!document.hasFocus()) {
      this.uiManager.showNotification(
        `Message from ${sender.nickname}`,
        message.content.body
      );
    }
    
    // Play sound
    this.uiManager.playSound('message');
  }
  
  /**
   * Send direct message to peer
   */
  async sendDirectMessage(peerId, content) {
    try {
      console.log('[SendDM] Attempting to send message to:', peerId);
      
      // First ensure we have a chat session
      const session = await this.chatProtocol.openStream(peerId);
      
      // Generate room ID and send message
      const roomId = await ChatProtocol.generateRoomId(this.node.peerId.toString(), peerId);
      const message = await this.chatProtocol.sendMessage(peerId, content, roomId);
      
      // Don't display here - terminal already displayed the input
      // The chat protocol will handle echoing back our sent messages if needed
      
      console.log('[SendDM] Message sent successfully');
      
    } catch (error) {
      console.error('[SendDM] Failed to send message:', error);
      this.terminal.displayError(`Failed to send message: ${error.message}`);
      
      if (error.message.includes('protocol not supported')) {
        this.terminal.displaySystem('The peer might not support the chat protocol. Try /connect first.');
      }
    }
  }
  
  /**
   * Broadcast message to all connected peers
   */
  async broadcastMessage(content) {
    try {
      const roomId = this.uiManager.currentChannel;
      await this.chatProtocol.broadcast(content, roomId);
      
      // Display our message
      const ourNickname = this.settings.getSetting('nickname');
      this.terminal.displayChat(ourNickname, content, Date.now());
      
    } catch (error) {
      this.terminal.displayError(`Failed to broadcast: ${error.message}`);
    }
  }
  
  /**
   * Connect to a specific peer
   */
  async connectToPeer(peerId) {
    try {
      this.terminal.displaySystem(`Connecting to ${peerId}...`);
      
      // First check if we're already connected
      const existingConnections = this.node.getConnections(peerId);
      if (existingConnections.length > 0) {
        this.terminal.displaySuccess('Already connected to this peer!');
        const isRelay = existingConnections[0].limitedConnection;
        this.terminal.displaySystem(`Connection type: ${isRelay ? 'RELAY (limited)' : 'DIRECT'}`);
        return;
      }
      
      // Just establish basic connection without specific protocol
      await connectToPeer(this.node, peerId);
      
      // Check connection type
      const newConnections = this.node.getConnections(peerId);
      if (newConnections.length > 0) {
        const isRelay = newConnections[0].limitedConnection;
        this.terminal.displaySuccess(`Connection established! Type: ${isRelay ? 'RELAY' : 'DIRECT'}`);
        
        if (isRelay) {
          this.terminal.displaySystem('Connected via circuit relay. You can now chat!');
        }
      }
    } catch (error) {
      this.terminal.displayError(`Failed to connect: ${error.message}`);
      
      // Provide helpful suggestions
      if (error.message.includes('Not found')) {
        this.terminal.displaySystem('Peer not found in DHT. Make sure:');
        this.terminal.displaySystem('  1. Both peers are connected to the bootstrap node');
        this.terminal.displaySystem('  2. The peer ID is correct');
        this.terminal.displaySystem('  3. Try again in a few seconds (DHT needs time to propagate)');
      }
    }
  }
  
  /**
   * Change nickname
   */
  changeNickname(nickname) {
    this.settings.setSetting('nickname', nickname);
    this.terminal.displaySuccess(`Nickname changed to: ${nickname}`);
    
    // Broadcast nickname to connected peers
    this.broadcastNicknameUpdate(nickname);
  }
  
  /**
   * Broadcast nickname update to peers
   */
  async broadcastNicknameUpdate(nickname) {
    const sessions = this.chatProtocol.getActiveSessions();
    
    for (const [peerId, session] of sessions) {
      try {
        await session.send({
          type: 'm.nickname',
          sender: this.node.peerId.toString(),
          nickname: nickname
        });
      } catch (error) {
        console.error('Failed to send nickname update:', error);
      }
    }
  }
  
  /**
   * Join a channel
   */
  joinChannel(channel) {
    if (!channel.startsWith('#')) {
      channel = '#' + channel;
    }
    
    this.uiManager.switchToPublic();
    this.uiManager.updateChannelDisplay(channel);
    this.terminal.displaySystem(`Joined channel: ${channel}`);
  }
  
  /**
   * Add friend
   */
  addFriend(peerId) {
    // Check if valid peer ID
    if (!peerId || peerId.length < 10) {
      this.terminal.displayError('Invalid peer ID');
      return;
    }
    
    // Add to friends storage
    this.friends.addFriend(peerId);
    this.terminal.displaySuccess(`Added friend: ${peerId}`);
    
    // Try to connect if not already connected
    const user = this.userList.getUser(peerId);
    if (!user) {
      this.connectToPeer(peerId);
    }
  }
  
  /**
   * Load friends list
   */
  loadFriends() {
    const friends = this.friends.getAllFriends();
    
    Object.entries(friends).forEach(([peerId, friend]) => {
      // Add to user list as offline initially
      this.userList.addUser(peerId, {
        nickname: friend.nickname || peerId,
        status: 'offline'
      });
    });
  }
  
  /**
   * Import keys and restart
   */
  async importKeys(keyData) {
    try {
      await this.keyManager.importKeys(keyData);
      this.terminal.displaySuccess('Keys imported. Restarting...');
      
      // Stop current node
      if (this.node) {
        await stopNode(this.node);
      }
      
      // Restart with new keys
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Reset keys and restart
   */
  async resetKeys() {
    try {
      this.terminal.displaySystem('Resetting identity keys...');
      
      // Clear stored keys
      this.keyManager.clearKeys();
      
      // Clear friends and chat history if desired
      // this.friends.clear();
      // this.chatHistory.clear();
      
      // Stop current node
      if (this.node) {
        await stopNode(this.node);
      }
      
      // Reload to generate new keys
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      this.terminal.displayError(`Failed to reset keys: ${error.message}`);
    }
  }
  
  /**
   * Update connection status
   */
  updateConnectionStatus() {
    const stats = getNodeStats(this.node);
    const status = stats.connectionCount > 0 ? 'connected' : 'disconnected';
    
    this.uiManager.updateConnectionStatus(status, stats.connectionCount);
    this.debugPanel.setNodeStats(stats);
    
    // Update DHT status
    const dhtStatus = this.node.services.dht ? 'Active' : 'Inactive';
    this.uiManager.updateDHTStatus(dhtStatus);
  }
  
  /**
   * Display node connection info
   */
  displayNodeInfo() {
    const stats = getNodeStats(this.node);
    const multiaddrs = this.node.getMultiaddrs();
    
    this.terminal.displaySystem('=== Node Information ===');
    this.terminal.displaySystem(`Peer ID: ${stats.peerId}`);
    this.terminal.displaySystem(`Connected Peers: ${stats.connectionCount}`);
    
    if (multiaddrs.length > 0) {
      this.terminal.displaySystem('\nListening Addresses:');
      multiaddrs.forEach(addr => {
        const addrStr = addr.toString();
        if (addrStr.includes('/p2p-circuit/')) {
          this.terminal.displaySystem(`  Circuit Relay: ${addrStr}`);
        } else if (addrStr.includes('/webrtc/')) {
          this.terminal.displaySystem(`  WebRTC: ${addrStr}`);
        } else {
          this.terminal.displaySystem(`  ${addrStr}`);
        }
      });
    }
    
    // Show connectable address for others
    const circuitAddrs = multiaddrs.filter(addr => 
      addr.toString().includes('/p2p-circuit/')
    );
    if (circuitAddrs.length > 0) {
      this.terminal.displaySystem('\nOthers can connect to you using:');
      this.terminal.displaySystem(`  /connect ${stats.peerId}`);
    }
  }
  
  /**
   * Start a chat session with a peer using the chat protocol
   */
  async startChatSession(peerId) {
    try {
      this.terminal.displaySystem(`Starting chat session with ${peerId}...`);
      
      // Try to connect using the chat protocol directly
      await connectToPeer(this.node, peerId, CHAT_PROTOCOL);
      
      this.terminal.displaySuccess('Chat session established!');
      this.terminal.displaySystem('You can now send messages directly.');
      
      // Switch to DM mode with this peer
      this.uiManager.switchToDM(peerId, peerId);
    } catch (error) {
      this.terminal.displayError(`Failed to start chat session: ${error.message}`);
      
      if (error.message.includes('no protocols found')) {
        this.terminal.displaySystem('The peer might not be running the chat protocol.');
      }
    }
  }
  
  /**
   * Clean up on shutdown
   */
  async shutdown() {
    if (this.chatProtocol) {
      this.chatProtocol.closeAllSessions();
    }
    
    if (this.node) {
      await stopNode(this.node);
    }
  }
}

// Initialize and start the application
const app = new P2PChatApp();

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.start());
} else {
  app.start();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  app.shutdown();
});

// Export for debugging
window.p2pChat = app;

// Add global debug functions (like in the example)
console.log('\n[App] 💬 Chat ready!');
console.log('[App] Commands:');
console.log('  window.checkProtocols() - Check protocols and streams');
console.log('  window.debugChatState() - Show complete debug info');
console.log('  window.manualDial(peerId) - Manually dial a peer');
console.log('  window.searchDHT(peerId) - Search DHT for a peer');
console.log('  /info - Show node connection info');
console.log('  /connect <peer-id> - Connect to a peer');
console.log('  /chat <peer-id> - Start chat session');
window.checkProtocols = async () => {
  const protocols = await app.node.getProtocols();
  console.log('[DEBUG] 📋 Node protocols:', protocols);
  console.log('[DEBUG] 📋 Chat protocol registered:', protocols.includes(CHAT_PROTOCOL));
  
  // Check connections
  const connections = app.node.getConnections();
  console.log('[DEBUG] 📋 Active connections:', connections.length);
  
  for (const conn of connections) {
    console.log(`[DEBUG] 📋 Connection to ${conn.remotePeer.toString()}:`);
    console.log(`  - Status: ${conn.status}`);
    console.log(`  - Direction: ${conn.stat.direction}`);
    console.log(`  - Limited: ${conn.limitedConnection}`);
    console.log(`  - Streams: ${conn.streams.length}`);
    
    for (const stream of conn.streams) {
      console.log(`  - Stream protocol: ${stream.protocol || 'unknown'}`);
      console.log(`    Direction: ${stream.stat.direction}`);
      console.log(`    Timeline: ${JSON.stringify(stream.stat.timeline)}`);
    }
  }
};

window.debugChatState = () => {
  console.log('\n[DEBUG] 🔍 COMPLETE CHAT STATE:');
  console.log('[DEBUG] Chat Protocol:', {
    hasProtocol: !!app.chatProtocol,
    sessions: app.chatProtocol ? app.chatProtocol.sessions.size : 0,
    activeSessions: app.chatProtocol ? Array.from(app.chatProtocol.sessions.entries()).map(([id, session]) => ({
      peerId: id,
      isActive: session.isActive
    })) : []
  });
  console.log('[DEBUG] LibP2P Node:', {
    peerId: app.node.peerId.toString(),
    started: app.node.isStarted(),
    connections: app.node.getConnections().length,
    multiaddrs: app.node.getMultiaddrs().map(a => a.toString())
  });
  console.log('[DEBUG] DHT Status:', {
    isActive: !!app.node.services.dht,
    mode: app.node.services.dht ? (app.node.services.dht.clientMode ? 'client' : 'server') : 'N/A'
  });
};

window.manualDial = async (peerId) => {
  console.log('[DEBUG] Manual dial to:', peerId);
  try {
    await connectToPeer(app.node, peerId);
    console.log('[DEBUG] ✅ Manual dial successful');
  } catch (err) {
    console.error('[DEBUG] ❌ Manual dial failed:', err);
  }
};

window.searchDHT = async (peerId) => {
  console.log('[DEBUG] 🔍 Searching DHT for peer:', peerId);
  try {
    const { peerIdFromString } = await import('@libp2p/peer-id');
    const targetPeerId = peerIdFromString(peerId);
    
    console.log('[DEBUG] 🔍 Using getClosestPeers...');
    const peers = await app.node.services.dht.getClosestPeers(targetPeerId.toBytes());
    
    let found = false;
    for await (const peer of peers) {
      console.log('[DEBUG] 🔍 DHT response:', peer.id.toString());
      if (peer.multiaddrs && peer.multiaddrs.length > 0) {
        console.log('[DEBUG] 🔍 Addresses:');
        peer.multiaddrs.forEach(addr => console.log('    -', addr.toString()));
      }
      
      if (peer.id.equals(targetPeerId)) {
        console.log('[DEBUG] ✅ Found target peer in DHT!');
        found = true;
      }
    }
    
    if (!found) {
      console.log('[DEBUG] ❌ Peer not found in DHT');
    }
  } catch (err) {
    console.error('[DEBUG] ❌ DHT search failed:', err);
  }
};