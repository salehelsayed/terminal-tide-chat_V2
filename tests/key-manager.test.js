import { KeyManager } from '../src/lib/key-manager.js';
import { jest } from '@jest/globals';

// Mock storage
class MockStorage {
  constructor() {
    this.data = {};
  }
  
  get(key) {
    return this.data[key] || null;
  }
  
  set(key, value) {
    this.data[key] = value;
  }
  
  has(key) {
    return key in this.data;
  }
  
  remove(key) {
    delete this.data[key];
  }
}

describe('KeyManager', () => {
  let keyManager;
  let mockStorage;
  
  beforeEach(() => {
    mockStorage = new MockStorage();
    keyManager = new KeyManager(mockStorage);
  });
  
  describe('generateKeys', () => {
    test('generates valid Ed25519 keys', async () => {
      const { privateKey, peerId } = await keyManager.generateKeys();
      
      expect(privateKey).toBeDefined();
      expect(privateKey.type).toBe('Ed25519');
      expect(privateKey.raw).toHaveLength(64); // 32 seed + 32 public
      expect(peerId).toBeDefined();
      expect(peerId.toString()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/); // Base58 format
    });
    
    test('stores keys in storage', async () => {
      const { peerId } = await keyManager.generateKeys();
      
      const stored = mockStorage.get('libp2p-keys');
      expect(stored).toBeDefined();
      expect(stored.privateKey).toBeDefined();
      expect(stored.peerId).toBe(peerId.toString());
    });
  });
  
  describe('loadKeys', () => {
    test('returns null when no keys exist', async () => {
      const result = await keyManager.loadKeys();
      expect(result).toBeNull();
    });
    
    test('loads previously generated keys', async () => {
      // Generate keys first
      const generated = await keyManager.generateKeys();
      
      // Load them
      const loaded = await keyManager.loadKeys();
      
      expect(loaded).toBeDefined();
      expect(loaded.peerId.toString()).toBe(generated.peerId.toString());
      expect(loaded.privateKey.raw).toEqual(generated.privateKey.raw);
    });
    
    test('handles corrupted key data gracefully', async () => {
      // Store invalid data
      mockStorage.set('libp2p-keys', {
        privateKey: 'invalid-base64',
        peerId: 'some-id'
      });
      
      const result = await keyManager.loadKeys();
      expect(result).toBeNull();
    });
  });
  
  describe('exportKeys', () => {
    test('returns null when no keys exist', () => {
      const result = keyManager.exportKeys();
      expect(result).toBeNull();
    });
    
    test('exports keys with metadata', async () => {
      await keyManager.generateKeys();
      
      const exported = keyManager.exportKeys();
      expect(exported).toBeDefined();
      expect(exported.privateKey).toBeDefined();
      expect(exported.peerId).toBeDefined();
      expect(exported.exported).toBeDefined();
      expect(new Date(exported.exported)).toBeInstanceOf(Date);
    });
  });
  
  describe('importKeys', () => {
    test('throws error for invalid key data', async () => {
      await expect(keyManager.importKeys(null)).rejects.toThrow('Invalid key data');
      await expect(keyManager.importKeys({})).rejects.toThrow('Invalid key data');
    });
    
    test('imports valid key data', async () => {
      // Generate and export keys
      const generated = await keyManager.generateKeys();
      const exported = keyManager.exportKeys();
      
      // Clear storage
      mockStorage.remove('libp2p-keys');
      
      // Import keys
      const imported = await keyManager.importKeys(exported);
      
      expect(imported.peerId.toString()).toBe(generated.peerId.toString());
      expect(mockStorage.has('libp2p-keys')).toBe(true);
    });
  });
  
  describe('utility methods', () => {
    test('clearKeys removes stored keys', async () => {
      await keyManager.generateKeys();
      expect(keyManager.hasKeys()).toBe(true);
      
      keyManager.clearKeys();
      expect(keyManager.hasKeys()).toBe(false);
    });
    
    test('getPeerId returns stored peer ID', async () => {
      const { peerId } = await keyManager.generateKeys();
      
      const storedId = keyManager.getPeerId();
      expect(storedId).toBe(peerId.toString());
    });
    
    test('getPeerId returns null when no keys exist', () => {
      const result = keyManager.getPeerId();
      expect(result).toBeNull();
    });
  });
});