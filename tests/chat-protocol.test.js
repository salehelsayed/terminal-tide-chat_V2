import { ChatProtocol, CHAT_PROTOCOL } from '../src/lib/chat-protocol.js';
import { jest } from '@jest/globals';

// Mock dependencies
const mockPushable = {
  push: jest.fn(),
  end: jest.fn()
};

jest.mock('it-pushable', () => ({
  pushable: jest.fn(() => mockPushable)
}));

jest.mock('it-pipe', () => ({
  pipe: jest.fn(async () => {})
}));

jest.mock('it-length-prefixed', () => ({
  encode: {
    single: jest.fn((data) => data)
  },
  decode: {}
}));

// Mock storage
class MockStorage {
  constructor() {
    this.messages = {};
  }
  
  addMessage(roomId, message) {
    if (!this.messages[roomId]) {
      this.messages[roomId] = [];
    }
    this.messages[roomId].push(message);
  }
  
  getMessages(roomId) {
    return this.messages[roomId] || [];
  }
}

// Mock event emitter
class MockEventEmitter extends EventTarget {
  emit(event, data) {
    this.dispatchEvent(new CustomEvent(event, { detail: data }));
  }
}

// Mock stream
const createMockStream = () => ({
  source: {
    [Symbol.asyncIterator]: async function* () {
      yield new TextEncoder().encode(JSON.stringify({
        type: 'hello',
        sender: 'QmPeer123',
        protocol_version: 'length-prefixed-v1',
        capabilities: { v: 1 }
      }));
    }
  },
  sink: jest.fn(),
  close: jest.fn(async () => {}),
  addEventListener: jest.fn()
});

// Mock node
const createMockNode = () => ({
  peerId: { toString: () => 'QmSelf' },
  handle: jest.fn(),
  dialProtocol: jest.fn(async () => createMockStream()),
  services: {
    dht: {}
  }
});

describe('ChatProtocol', () => {
  let chatProtocol;
  let mockNode;
  let mockStorage;
  let mockEventEmitter;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockNode = createMockNode();
    mockStorage = new MockStorage();
    mockEventEmitter = new MockEventEmitter();
    chatProtocol = new ChatProtocol(mockNode, mockStorage, mockEventEmitter);
  });
  
  describe('initialization', () => {
    test('registers chat protocol handler', () => {
      expect(mockNode.handle).toHaveBeenCalledWith(
        CHAT_PROTOCOL,
        expect.any(Function),
        {
          maxInboundStreams: 32,
          runOnLimitedConnection: true
        }
      );
    });
    
    test('initializes with empty sessions', () => {
      expect(chatProtocol.sessions.size).toBe(0);
    });
  });
  
  describe('handleIncomingStream', () => {
    test('creates session for new peer', async () => {
      const mockStream = createMockStream();
      const connection = {
        remotePeer: { toString: () => 'QmPeer123' }
      };
      
      await chatProtocol.handleIncomingStream({ stream: mockStream, connection });
      
      expect(chatProtocol.sessions.has('QmPeer123')).toBe(true);
    });
    
    test('prevents duplicate sessions', async () => {
      const mockStream1 = createMockStream();
      const mockStream2 = createMockStream();
      const connection = {
        remotePeer: { toString: () => 'QmPeer123' }
      };
      
      // First connection
      await chatProtocol.handleIncomingStream({ stream: mockStream1, connection });
      
      // Duplicate connection
      await chatProtocol.handleIncomingStream({ stream: mockStream2, connection });
      
      expect(chatProtocol.sessions.size).toBe(1);
      expect(mockStream2.close).toHaveBeenCalled();
    });
    
    test('emits connection event', async () => {
      const mockStream = createMockStream();
      const connection = {
        remotePeer: { toString: () => 'QmPeer123' }
      };
      
      const eventPromise = new Promise(resolve => {
        mockEventEmitter.addEventListener('chat:connected', resolve);
      });
      
      await chatProtocol.handleIncomingStream({ stream: mockStream, connection });
      
      const event = await eventPromise;
      expect(event.detail.peerId).toBe('QmPeer123');
    });
  });
  
  describe('openStream', () => {
    test('opens new stream to peer', async () => {
      const session = await chatProtocol.openStream('QmPeer123');
      
      expect(mockNode.dialProtocol).toHaveBeenCalledWith('QmPeer123', CHAT_PROTOCOL);
      expect(chatProtocol.sessions.has('QmPeer123')).toBe(true);
    });
    
    test('returns existing session if available', async () => {
      // Open first session
      const session1 = await chatProtocol.openStream('QmPeer123');
      
      // Try to open again
      mockNode.dialProtocol.mockClear();
      const session2 = await chatProtocol.openStream('QmPeer123');
      
      expect(mockNode.dialProtocol).not.toHaveBeenCalled();
      expect(session1).toBe(session2);
    });
    
    test('handles connection failures', async () => {
      mockNode.dialProtocol.mockRejectedValue(new Error('Connection failed'));
      
      await expect(chatProtocol.openStream('QmPeer123'))
        .rejects.toThrow('Connection failed');
    });
  });
  
  describe('sendMessage', () => {
    test('sends message to peer', async () => {
      const content = 'Hello world';
      const roomId = 'room123';
      
      const message = await chatProtocol.sendMessage('QmPeer123', content, roomId);
      
      expect(message).toMatchObject({
        type: 'm.room.message',
        sender: 'QmSelf',
        room_id: roomId,
        content: {
          msgtype: 'm.text',
          body: content
        }
      });
      
      expect(message.origin_ts).toBeDefined();
      expect(message.event_id).toBeDefined();
    });
    
    test('stores message in history', async () => {
      await chatProtocol.sendMessage('QmPeer123', 'Test message', 'room123');
      
      const messages = mockStorage.getMessages('room123');
      expect(messages).toHaveLength(1);
      expect(messages[0].content.body).toBe('Test message');
    });
    
    test('emits message sent event', async () => {
      const eventPromise = new Promise(resolve => {
        mockEventEmitter.addEventListener('message:sent', resolve);
      });
      
      await chatProtocol.sendMessage('QmPeer123', 'Test', 'room123');
      
      const event = await eventPromise;
      expect(event.detail.content.body).toBe('Test');
    });
  });
  
  describe('broadcast', () => {
    test('sends message to all active sessions', async () => {
      // Create multiple sessions
      await chatProtocol.openStream('QmPeer1');
      await chatProtocol.openStream('QmPeer2');
      await chatProtocol.openStream('QmPeer3');
      
      await chatProtocol.broadcast('Broadcast message', 'public');
      
      // Should have sent to all 3 peers
      const messages = mockStorage.getMessages('public');
      expect(messages).toHaveLength(3);
    });
  });
  
  describe('message handlers', () => {
    test('handles chat messages', async () => {
      const message = {
        type: 'm.room.message',
        sender: 'QmPeer123',
        room_id: 'room123',
        content: { body: 'Hello' }
      };
      
      const eventPromise = new Promise(resolve => {
        mockEventEmitter.addEventListener('message:received', resolve);
      });
      
      await chatProtocol.handleMessage(message, 'QmPeer123');
      
      const event = await eventPromise;
      expect(event.detail).toEqual(message);
      
      // Should store in history
      const messages = mockStorage.getMessages('room123');
      expect(messages).toHaveLength(1);
    });
    
    test('handles handshake messages', async () => {
      const message = {
        type: 'hello',
        sender: 'QmPeer123',
        protocol_version: 'length-prefixed-v1',
        capabilities: { v: 1 }
      };
      
      const eventPromise = new Promise(resolve => {
        mockEventEmitter.addEventListener('peer:handshake', resolve);
      });
      
      await chatProtocol.handleMessage(message, 'QmPeer123');
      
      const event = await eventPromise;
      expect(event.detail.peerId).toBe('QmPeer123');
      expect(event.detail.capabilities).toEqual({ v: 1 });
    });
    
    test('handles nickname updates', async () => {
      const message = {
        type: 'm.nickname',
        sender: 'QmPeer123',
        nickname: 'Alice'
      };
      
      const eventPromise = new Promise(resolve => {
        mockEventEmitter.addEventListener('peer:nickname', resolve);
      });
      
      await chatProtocol.handleMessage(message, 'QmPeer123');
      
      const event = await eventPromise;
      expect(event.detail.peerId).toBe('QmPeer123');
      expect(event.detail.nickname).toBe('Alice');
    });
    
    test('ignores unknown message types', async () => {
      const message = {
        type: 'unknown.type',
        data: 'some data'
      };
      
      // Should not throw
      await expect(chatProtocol.handleMessage(message, 'QmPeer123'))
        .resolves.not.toThrow();
    });
  });
  
  describe('session management', () => {
    test('closes session with peer', async () => {
      await chatProtocol.openStream('QmPeer123');
      expect(chatProtocol.sessions.has('QmPeer123')).toBe(true);
      
      chatProtocol.closeSession('QmPeer123');
      
      // Session should be removed
      expect(chatProtocol.sessions.has('QmPeer123')).toBe(false);
    });
    
    test('closeAllSessions closes all active sessions', async () => {
      await chatProtocol.openStream('QmPeer1');
      await chatProtocol.openStream('QmPeer2');
      
      chatProtocol.closeAllSessions();
      
      expect(chatProtocol.sessions.size).toBe(0);
    });
    
    test('getActiveSessions returns only active sessions', async () => {
      await chatProtocol.openStream('QmPeer1');
      await chatProtocol.openStream('QmPeer2');
      
      const active = chatProtocol.getActiveSessions();
      expect(active.size).toBe(2);
    });
  });
  
  describe('utility methods', () => {
    test('generateRoomId creates deterministic IDs', () => {
      const id1 = ChatProtocol.generateRoomId('QmPeerA', 'QmPeerB');
      const id2 = ChatProtocol.generateRoomId('QmPeerB', 'QmPeerA');
      
      expect(id1).toBe(id2); // Order doesn't matter
      expect(id1).toHaveLength(16);
    });
    
    test('generateEventId creates unique IDs', () => {
      const id1 = chatProtocol.generateEventId();
      const id2 = chatProtocol.generateEventId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+_[a-z0-9]+$/);
    });
  });
});