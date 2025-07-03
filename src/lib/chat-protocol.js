import * as lp from 'it-length-prefixed';
import { pipe } from 'it-pipe';
import { pushable } from 'it-pushable';
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays';
// Use Web Crypto API for browser compatibility
const crypto = globalThis.crypto || window.crypto;

// Chat protocol identifier
export const CHAT_PROTOCOL = '/chat/1.0.0';

/**
 * Chat session manager - handles one session per peer
 */
class ChatSession {
  constructor(stream, peerId, onMessage, onClose) {
    this.stream = stream;
    this.peerId = peerId;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.outbound = pushable();
    this.isActive = true;
    this.seq = 0;
    
    // Start handling the stream
    this.handleStream();
  }
  
  /**
   * Handle bidirectional stream communication
   */
  async handleStream() {
    try {
      // Set up outbound pipe (our messages to peer)
      pipe(
        this.outbound,
        lp.encode,
        this.stream.sink
      ).catch(err => {
        console.error('Outbound pipe error:', err);
        this.close();
      });
      
      // Set up inbound pipe (peer messages to us)
      await pipe(
        this.stream.source,
        lp.decode,
        async (source) => {
          for await (const data of source) {
            try {
              const message = uint8ArrayToString(data.subarray());
              const parsed = JSON.parse(message);
              
              // Handle message
              if (this.onMessage) {
                await this.onMessage(parsed, this.peerId);
              }
            } catch (error) {
              console.error('Message parse error:', error);
            }
          }
        }
      );
    } catch (error) {
      console.error('Stream handling error:', error);
    } finally {
      this.close();
    }
  }
  
  /**
   * Send message to peer
   * 
   * @param {object} message - Message object to send
   */
  async send(message) {
    console.log('[ChatSession] 📮 send called, isActive:', this.isActive);
    
    if (!this.isActive) {
      console.error('[ChatSession] ❌ Cannot send - session not active');
      throw new Error('Session is not active');
    }
    
    try {
      const messageStr = JSON.stringify(message);
      console.log('[ChatSession] 📮 Encoding message, length:', messageStr.length);
      
      const data = uint8ArrayFromString(messageStr);
      
      console.log('[ChatSession] 📮 Pushing to outbound stream...');
      // Don't double-encode - the outbound pipe already handles lp.encode
      this.outbound.push(data);
      this.seq++;
      
      console.log('[ChatSession] 📮 Message pushed successfully, new seq:', this.seq);
    } catch (error) {
      console.error('[ChatSession] ❌ Send error:', error);
      throw error;
    }
  }
  
  /**
   * Send handshake message
   */
  async sendHandshake(ourPeerId) {
    console.log('[ChatSession] 🤝 Sending handshake from:', ourPeerId);
    
    const handshake = {
      type: 'hello',
      sender: ourPeerId,
      protocol_version: 'length-prefixed-v1',
      capabilities: { v: 1, maxFrame: 131072 }
    };
    
    await this.send(handshake);
    console.log('[ChatSession] 🤝 Handshake sent');
  }
  
  /**
   * Close the session
   */
  close() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.outbound.end();
    
    if (this.onClose) {
      this.onClose(this.peerId);
    }
  }
}

/**
 * Chat protocol handler
 */
export class ChatProtocol {
  constructor(node, storage, eventEmitter) {
    this.node = node;
    this.storage = storage;
    this.eventEmitter = eventEmitter;
    this.sessions = new Map(); // One session per peer
    this.messageHandlers = new Map();
    
    // Helper method for emitting events that works with both EventEmitter and EventTarget
    this.emit = (eventName, detail) => {
      if (this.eventEmitter.emit) {
        // Node.js EventEmitter style
        this.eventEmitter.emit(eventName, detail);
      } else if (this.eventEmitter.dispatchEvent) {
        // Browser EventTarget style
        this.eventEmitter.dispatchEvent(new CustomEvent(eventName, { detail }));
      } else {
        console.error('[ChatProtocol] Unknown event emitter type');
      }
    };
    
    // Register protocol handler with enhanced logging
    console.log('[ChatProtocol] 📋 Registering protocol handler for:', CHAT_PROTOCOL);
    
    this.node.handle(
      CHAT_PROTOCOL,
      async ({ stream, connection }) => {
        console.log('[ChatProtocol] 🎯 PROTOCOL HANDLER TRIGGERED for:', CHAT_PROTOCOL);
        console.log('[ChatProtocol] 🎯 Connection from:', connection.remotePeer.toString());
        console.log('[ChatProtocol] 🎯 Connection type:', connection.limitedConnection ? 'LIMITED (relay)' : 'DIRECT');
        
        await this.handleIncomingStream({ stream, connection });
      },
      {
        maxInboundStreams: 32,
        runOnLimitedConnection: true  // CRITICAL for circuit relay support
      }
    );
    
    console.log('[ChatProtocol] ✅ Protocol handler registered for:', CHAT_PROTOCOL);
    
    // Log supported protocols
    console.log('[ChatProtocol] 📋 Node protocols:', this.node.getProtocols());
    
    // Register default message handlers
    this.registerMessageHandlers();
  }
  
  /**
   * Handle incoming stream from peer
   */
  async handleIncomingStream({ stream, connection }) {
    const peerId = connection.remotePeer.toString();
    
    // CRITICAL: Prevent duplicate sessions
    if (this.sessions.has(peerId)) {
      console.warn('Duplicate session attempt from:', peerId);
      await stream.close();
      return;
    }
    
    console.log('[ChatProtocol] 📨 Incoming chat stream from:', peerId);
    console.log('[ChatProtocol] 📨 Stream direction:', stream.stat?.direction);
    
    // Create new session
    const session = new ChatSession(
      stream,
      peerId,
      this.handleMessage.bind(this),
      this.handleSessionClose.bind(this)
    );
    
    this.sessions.set(peerId, session);
    console.log('[ChatProtocol] 📨 Session created and stored');
    
    // Send handshake
    console.log('[ChatProtocol] 📨 Sending handshake...');
    await session.sendHandshake(this.node.peerId.toString());
    
    // Emit connection event
    this.emit('chat:connected', { peerId });
    console.log('[ChatProtocol] 📨 Incoming stream setup complete');
  }
  
  /**
   * Open chat stream to peer
   * 
   * @param {string} peerId - Target peer ID
   * @returns {Promise<ChatSession>} Chat session
   */
  async openStream(peerId) {
    // Check for existing session
    if (this.sessions.has(peerId)) {
      console.log('[ChatProtocol] 📌 Reusing existing session with:', peerId);
      return this.sessions.get(peerId);
    }
    
    // Convert peerId string to PeerId object if needed
    let peerIdObj;
    
    try {
      console.log('[ChatProtocol] 📞 Opening chat stream to:', peerId);
      console.log('[ChatProtocol] 📞 Using protocol:', CHAT_PROTOCOL);
      
      if (typeof peerId === 'string') {
        console.log('[ChatProtocol] 📞 Converting string peer ID to object...');
        const { peerIdFromString } = await import('@libp2p/peer-id');
        peerIdObj = peerIdFromString(peerId);
      } else {
        peerIdObj = peerId;
      }
      
      console.log('[ChatProtocol] 📞 Dialing with peer ID object:', peerIdObj.toString());
      
      // Check if we're connected first
      const existingConnections = this.node.getConnections(peerIdObj);
      console.log('[ChatProtocol] 📞 Pre-dial connection check:', existingConnections.length, 'connections');
      
      if (existingConnections.length === 0) {
        console.log('[ChatProtocol] 📞 No existing connection, dial will attempt to connect...');
      } else {
        console.log('[ChatProtocol] 📞 Already connected, will use existing connection');
        // Check what protocols the peer supports
        try {
          const protocols = await this.node.peerStore.get(peerIdObj);
          console.log('[ChatProtocol] 📞 Peer protocols in store:', protocols?.protocols || 'Not found');
        } catch (e) {
          console.log('[ChatProtocol] 📞 Could not retrieve peer protocols:', e.message);
        }
      }
      
      // Open stream to peer with the chat protocol
      // libp2p will automatically handle DHT lookup and circuit relay if needed
      let stream;
      try {
        stream = await this.node.dialProtocol(peerIdObj, CHAT_PROTOCOL);
      } catch (dialError) {
        console.log('[ChatProtocol] 📞 dialProtocol failed:', dialError.message);
        
        // If dialProtocol fails, try to establish connection first
        if (existingConnections.length === 0) {
          console.log('[ChatProtocol] 📞 Attempting to establish connection first...');
          try {
            await this.node.dial(peerIdObj);
            console.log('[ChatProtocol] 📞 Connection established, retrying dialProtocol...');
            stream = await this.node.dialProtocol(peerIdObj, CHAT_PROTOCOL);
          } catch (retryError) {
            console.error('[ChatProtocol] 📞 Retry failed:', retryError.message);
            throw retryError;
          }
        } else {
          throw dialError;
        }
      }
      
      console.log('[ChatProtocol] ✅ Stream established with:', peerId);
      
      // Check if this is a relay connection
      const connections = this.node.getConnections(peerIdObj);
      console.log('[ChatProtocol] 🔌 Active connections:', connections.length);
      if (connections.length > 0) {
        const conn = connections[0];
        console.log('[ChatProtocol] 🔌 Connection details:', {
          status: conn.status,
          direction: conn.stat?.direction,
          streams: conn.streams.length,
          limitedConnection: conn.limitedConnection
        });
        const isRelay = conn.limitedConnection;
        console.log('[ChatProtocol] 🔌 Connection type:', isRelay ? 'LIMITED (relay)' : 'DIRECT');
      }
      
      // Create session
      const session = new ChatSession(
        stream,
        peerId,
        this.handleMessage.bind(this),
        this.handleSessionClose.bind(this)
      );
      
      this.sessions.set(peerId, session);
      
      // Send handshake
      await session.sendHandshake(this.node.peerId.toString());
      
      // Emit connection event
      this.emit('chat:connected', { peerId });
      
      return session;
    } catch (error) {
      console.error('[ChatProtocol] ❌ Failed to open stream to', peerId);
      console.error('[ChatProtocol] ❌ Error:', error.message);
      console.error('[ChatProtocol] ❌ Error stack:', error.stack);
      
      // Check if we have any connections to this peer
      // Make sure to use the PeerId object if we converted it
      const checkPeerId = typeof peerId === 'string' ? peerIdObj : peerId;
      const connections = this.node.getConnections(checkPeerId);
      console.log('[ChatProtocol] ❌ Existing connections to peer:', connections.length);
      
      if (connections.length === 0) {
        console.error('[ChatProtocol] ❌ No active connection to peer - cannot establish chat stream');
        throw new Error(`Not connected to peer ${peerId}. Use /connect first.`);
      }
      
      throw error;
    }
  }
  
  /**
   * Send message to peer
   * 
   * @param {string} peerId - Target peer ID
   * @param {string} content - Message content
   * @param {string} roomId - Room/channel ID
   */
  async sendMessage(peerId, content, roomId) {
    console.log('[ChatProtocol] 📤 sendMessage called:', {
      peerId,
      content,
      roomId,
      hasExistingSession: this.sessions.has(peerId)
    });
    
    let session = this.sessions.get(peerId);
    
    // Open stream if needed
    if (!session) {
      console.log('[ChatProtocol] 📤 No existing session, opening new stream...');
      session = await this.openStream(peerId);
    }
    
    console.log('[ChatProtocol] 📤 Session state:', {
      isActive: session.isActive,
      peerId: session.peerId,
      hasStream: !!session.stream
    });
    
    // Create message
    const message = {
      type: 'm.room.message',
      sender: this.node.peerId.toString(),
      room_id: roomId,
      origin_ts: Date.now(),
      seq: session.seq,
      event_id: this.generateEventId(),
      content: {
        msgtype: 'm.text',
        body: content
      }
    };
    
    console.log('[ChatProtocol] 📤 Sending message:', message);
    
    // Send message
    await session.send(message);
    
    console.log('[ChatProtocol] 📤 Message sent successfully');
    
    // Store in history
    this.storage.addMessage(roomId, message);
    
    // Emit event
    this.emit('message:sent', message);
    
    return message;
  }
  
  /**
   * Handle incoming message
   */
  async handleMessage(message, peerId) {
    console.log('Received message:', message.type, 'from', peerId);
    
    // Get handler for message type
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      await handler(message, peerId);
    } else {
      console.warn('Unknown message type:', message.type);
    }
  }
  
  /**
   * Register message type handlers
   */
  registerMessageHandlers() {
    // Handshake handler
    this.messageHandlers.set('hello', async (message, peerId) => {
      console.log('Handshake from', peerId, message);
      this.emit('peer:handshake', { peerId, capabilities: message.capabilities });
    });
    
    // Chat message handler
    this.messageHandlers.set('m.room.message', async (message, peerId) => {
      console.log('[ChatProtocol] 💬 Received chat message:', {
        from: peerId,
        sender: message.sender,
        room: message.room_id,
        text: message.content?.body
      });
      
      // Store in history
      this.storage.addMessage(message.room_id, message);
      
      // Emit event for UI
      this.emit('message:received', message);
      console.log('[ChatProtocol] 💬 Message event emitted');
    });
    
    // Typing indicator
    this.messageHandlers.set('m.typing', async (message, peerId) => {
      this.emit('peer:typing', { peerId, typing: message.typing });
    });
    
    // Nickname update
    this.messageHandlers.set('m.nickname', async (message, peerId) => {
      this.emit('peer:nickname', { peerId, nickname: message.nickname });
    });
  }
  
  /**
   * Handle session close
   */
  handleSessionClose(peerId) {
    console.log('Session closed with', peerId);
    this.sessions.delete(peerId);
    this.emit('chat:disconnected', { peerId });
  }
  
  /**
   * Broadcast message to all connected peers
   * 
   * @param {string} content - Message content
   * @param {string} roomId - Room/channel ID
   */
  async broadcast(content, roomId) {
    const promises = [];
    
    for (const [peerId, session] of this.sessions) {
      if (session.isActive) {
        promises.push(this.sendMessage(peerId, content, roomId));
      }
    }
    
    await Promise.allSettled(promises);
  }
  
  /**
   * Generate deterministic room ID from peer IDs
   * 
   * @param {string} peerId1 - First peer ID
   * @param {string} peerId2 - Second peer ID
   * @returns {string} Room ID
   */
  static async generateRoomId(peerId1, peerId2) {
    // Sort peer IDs for consistency
    const sorted = [peerId1, peerId2].sort();
    const combined = sorted.join(':');
    
    // Create hash using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16);
  }
  
  /**
   * Generate unique event ID
   * 
   * @returns {string} Event ID
   */
  generateEventId() {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  /**
   * Get active sessions
   * 
   * @returns {Map} Active sessions
   */
  getActiveSessions() {
    return new Map(
      Array.from(this.sessions.entries())
        .filter(([_, session]) => session.isActive)
    );
  }
  
  /**
   * Close session with peer
   * 
   * @param {string} peerId - Peer ID
   */
  closeSession(peerId) {
    const session = this.sessions.get(peerId);
    if (session) {
      session.close();
    }
  }
  
  /**
   * Close all sessions
   */
  closeAllSessions() {
    for (const session of this.sessions.values()) {
      session.close();
    }
  }
}