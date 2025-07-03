import { Storage, ChatHistoryStorage, SettingsStorage, FriendsStorage } from '../src/lib/storage.js';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index) => Object.keys(store)[index],
    get length() { return Object.keys(store).length; }
  };
})();

// Replace global localStorage
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('Storage', () => {
  let storage;
  
  beforeEach(() => {
    localStorageMock.clear();
    storage = new Storage('test');
  });
  
  describe('basic operations', () => {
    test('set and get values', () => {
      storage.set('key1', 'value1');
      expect(storage.get('key1')).toBe('value1');
      
      storage.set('key2', { nested: 'object' });
      expect(storage.get('key2')).toEqual({ nested: 'object' });
    });
    
    test('returns null for non-existent keys', () => {
      expect(storage.get('nonexistent')).toBeNull();
    });
    
    test('has() checks key existence', () => {
      storage.set('exists', true);
      expect(storage.has('exists')).toBe(true);
      expect(storage.has('notexists')).toBe(false);
    });
    
    test('remove() deletes keys', () => {
      storage.set('toremove', 'value');
      expect(storage.has('toremove')).toBe(true);
      
      storage.remove('toremove');
      expect(storage.has('toremove')).toBe(false);
    });
    
    test('handles JSON serialization errors', () => {
      const circular = {};
      circular.self = circular;
      
      expect(() => storage.set('circular', circular)).toThrow();
    });
  });
  
  describe('prefix handling', () => {
    test('uses prefix for all keys', () => {
      storage.set('mykey', 'value');
      expect(localStorageMock.getItem('test-mykey')).toBe('"value"');
    });
    
    test('keys() returns unprefixed keys', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      
      const keys = storage.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toHaveLength(2);
    });
    
    test('clear() only removes prefixed keys', () => {
      storage.set('key1', 'value1');
      localStorageMock.setItem('other-key', 'value');
      
      storage.clear();
      
      expect(storage.has('key1')).toBe(false);
      expect(localStorageMock.getItem('other-key')).toBe('value');
    });
  });
  
  describe('getSize', () => {
    test('calculates approximate storage size', () => {
      storage.set('key1', 'short');
      storage.set('key2', 'a'.repeat(100));
      
      const size = storage.getSize();
      expect(size).toBeGreaterThan(100);
    });
  });
});

describe('ChatHistoryStorage', () => {
  let chatHistory;
  
  beforeEach(() => {
    localStorageMock.clear();
    chatHistory = new ChatHistoryStorage();
  });
  
  describe('message management', () => {
    test('adds messages to room history', () => {
      const message = {
        type: 'm.room.message',
        content: { body: 'Hello' },
        sender: 'peer123'
      };
      
      chatHistory.addMessage('room1', message);
      
      const history = chatHistory.getHistory('room1');
      expect(history).toHaveLength(1);
      expect(history[0].content.body).toBe('Hello');
      expect(history[0].stored_at).toBeDefined();
    });
    
    test('limits message history per room', () => {
      // Add more than max messages
      for (let i = 0; i < 1100; i++) {
        chatHistory.addMessage('room1', {
          content: { body: `Message ${i}` }
        });
      }
      
      const history = chatHistory.getHistory('room1');
      expect(history).toHaveLength(1000);
      expect(history[0].content.body).toBe('Message 100'); // First 100 removed
    });
    
    test('getHistory respects limit parameter', () => {
      for (let i = 0; i < 50; i++) {
        chatHistory.addMessage('room1', {
          content: { body: `Message ${i}` }
        });
      }
      
      const limited = chatHistory.getHistory('room1', 10);
      expect(limited).toHaveLength(10);
      expect(limited[0].content.body).toBe('Message 40'); // Last 10
    });
    
    test('clearHistory removes room messages', () => {
      chatHistory.addMessage('room1', { content: { body: 'Test' } });
      expect(chatHistory.getHistory('room1')).toHaveLength(1);
      
      chatHistory.clearHistory('room1');
      expect(chatHistory.getHistory('room1')).toHaveLength(0);
    });
    
    test('getRoomIds returns all rooms with history', () => {
      chatHistory.addMessage('room1', { content: { body: 'Test1' } });
      chatHistory.addMessage('room2', { content: { body: 'Test2' } });
      
      const roomIds = chatHistory.getRoomIds();
      expect(roomIds).toContain('room1');
      expect(roomIds).toContain('room2');
      expect(roomIds).toHaveLength(2);
    });
  });
});

describe('SettingsStorage', () => {
  let settings;
  
  beforeEach(() => {
    localStorageMock.clear();
    settings = new SettingsStorage();
  });
  
  describe('settings management', () => {
    test('returns default values for unset settings', () => {
      expect(settings.getSetting('nickname')).toBe('Anonymous');
      expect(settings.getSetting('theme')).toBe('terminal-green');
      expect(settings.getSetting('fontSize')).toBe(14);
    });
    
    test('stores and retrieves custom settings', () => {
      settings.setSetting('nickname', 'Alice');
      expect(settings.getSetting('nickname')).toBe('Alice');
    });
    
    test('getAllSettings includes defaults and custom', () => {
      settings.setSetting('nickname', 'Bob');
      
      const all = settings.getAllSettings();
      expect(all.nickname).toBe('Bob'); // Custom
      expect(all.theme).toBe('terminal-green'); // Default
    });
    
    test('resetToDefaults clears all custom settings', () => {
      settings.setSetting('nickname', 'Custom');
      settings.setSetting('theme', 'terminal-blue');
      
      settings.resetToDefaults();
      
      expect(settings.getSetting('nickname')).toBe('Anonymous');
      expect(settings.getSetting('theme')).toBe('terminal-green');
    });
  });
});

describe('FriendsStorage', () => {
  let friends;
  
  beforeEach(() => {
    localStorageMock.clear();
    friends = new FriendsStorage();
  });
  
  describe('friend management', () => {
    test('adds friends with metadata', () => {
      friends.addFriend('peer123', { nickname: 'Alice' });
      
      const friend = friends.getFriend('peer123');
      expect(friend).toBeDefined();
      expect(friend.nickname).toBe('Alice');
      expect(friend.peerId).toBe('peer123');
      expect(friend.added_at).toBeDefined();
    });
    
    test('removes friends', () => {
      friends.addFriend('peer123');
      expect(friends.isFriend('peer123')).toBe(true);
      
      friends.removeFriend('peer123');
      expect(friends.isFriend('peer123')).toBe(false);
    });
    
    test('updates friend metadata', () => {
      friends.addFriend('peer123', { nickname: 'Alice' });
      friends.updateFriend('peer123', { nickname: 'Alice2', status: 'online' });
      
      const friend = friends.getFriend('peer123');
      expect(friend.nickname).toBe('Alice2');
      expect(friend.status).toBe('online');
      expect(friend.updated_at).toBeDefined();
    });
    
    test('getAllFriends returns all friends', () => {
      friends.addFriend('peer1', { nickname: 'Friend1' });
      friends.addFriend('peer2', { nickname: 'Friend2' });
      
      const all = friends.getAllFriends();
      expect(Object.keys(all)).toHaveLength(2);
      expect(all.peer1.nickname).toBe('Friend1');
      expect(all.peer2.nickname).toBe('Friend2');
    });
    
    test('handles non-existent friend operations gracefully', () => {
      expect(friends.getFriend('nonexistent')).toBeNull();
      expect(friends.isFriend('nonexistent')).toBe(false);
      
      // Should not throw
      friends.updateFriend('nonexistent', { nickname: 'Test' });
    });
  });
});