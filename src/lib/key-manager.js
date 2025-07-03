import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { createEd25519PeerId } from '@libp2p/peer-id-factory';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays';

/**
 * Manages libp2p cryptographic keys and peer IDs
 */
export class KeyManager {
  constructor(storage) {
    this.storage = storage;
    this.KEYS_KEY = 'libp2p-keys';
  }

  /**
   * Generate new Ed25519 keypair and derive PeerID
   * 
   * @returns {Promise<{privateKey: object, peerId: object}>} Generated keys and peer ID
   */
  async generateKeys() {
    // Generate Ed25519 keypair and PeerId together
    const peerId = await createEd25519PeerId();
    // The privateKey in the peerId is already in protobuf format
    const privateKeyProtobuf = peerId.privateKey;
    
    // Store keys in localStorage
    this.storage.set(this.KEYS_KEY, {
      privateKey: uint8ArrayToString(privateKeyProtobuf, 'base64'),
      peerId: peerId.toString()
    });
    
    // Return the actual privateKey object (not protobuf)
    const privateKey = await privateKeyFromProtobuf(privateKeyProtobuf);
    return { privateKey, peerId };
  }

  /**
   * Load existing keys from storage
   * 
   * @returns {Promise<{privateKey: object, peerId: object} | null>} Loaded keys or null if not found
   */
  async loadKeys() {
    const stored = this.storage.get(this.KEYS_KEY);
    if (!stored) {
      return null;
    }
    
    try {
      // GOTCHA: Must use privateKeyFromProtobuf to reconstruct key
      const privateKeyBytes = uint8ArrayFromString(stored.privateKey, 'base64');
      const privateKey = await privateKeyFromProtobuf(privateKeyBytes);
      // Recreate the peerId from the private key
      const peerId = await peerIdFromPrivateKey(privateKey);
      
      return { privateKey, peerId };
    } catch (error) {
      console.error('Failed to load keys:', error);
      return null;
    }
  }

  /**
   * Export keys for backup
   * 
   * @returns {object|null} Exportable key data
   */
  exportKeys() {
    const stored = this.storage.get(this.KEYS_KEY);
    if (!stored) {
      return null;
    }
    
    return {
      privateKey: stored.privateKey,
      peerId: stored.peerId,
      exported: new Date().toISOString()
    };
  }

  /**
   * Import keys from backup
   * 
   * @param {object} keyData - Key data to import
   * @returns {Promise<{privateKey: object, peerId: object}>} Imported keys
   */
  async importKeys(keyData) {
    if (!keyData || !keyData.privateKey) {
      throw new Error('Invalid key data');
    }
    
    // Validate by reconstructing keys
    const privateKeyBytes = uint8ArrayFromString(keyData.privateKey, 'base64');
    const privateKey = await privateKeyFromProtobuf(privateKeyBytes);
    // Recreate the peerId from the private key
    const peerId = await peerIdFromPrivateKey(privateKey);
    
    // Store imported keys
    this.storage.set(this.KEYS_KEY, {
      privateKey: keyData.privateKey,
      peerId: peerId.toString()
    });
    
    return { privateKey, peerId };
  }

  /**
   * Clear stored keys
   */
  clearKeys() {
    this.storage.remove(this.KEYS_KEY);
  }

  /**
   * Check if keys exist in storage
   * 
   * @returns {boolean} True if keys exist
   */
  hasKeys() {
    return this.storage.has(this.KEYS_KEY);
  }

  /**
   * Get the stored peer ID without loading full keys
   * 
   * @returns {string|null} Peer ID string or null
   */
  getPeerId() {
    const stored = this.storage.get(this.KEYS_KEY);
    return stored ? stored.peerId : null;
  }
}