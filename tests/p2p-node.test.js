import { createP2PNode, connectToPeer, getNodeStats, stopNode } from '../src/lib/p2p-node.js';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { jest } from '@jest/globals';

// Mock libp2p modules
jest.mock('libp2p', () => ({
  createLibp2p: jest.fn()
}));

jest.mock('@libp2p/websockets', () => ({
  webSockets: jest.fn(() => 'websockets-transport')
}));

jest.mock('@libp2p/webrtc', () => ({
  webRTC: jest.fn(() => 'webrtc-transport')
}));

jest.mock('@libp2p/circuit-relay-v2', () => ({
  circuitRelayTransport: jest.fn(() => 'relay-transport')
}));

jest.mock('@chainsafe/libp2p-noise', () => ({
  noise: jest.fn(() => 'noise-encryption')
}));

jest.mock('@chainsafe/libp2p-yamux', () => ({
  yamux: jest.fn(() => 'yamux-muxer')
}));

jest.mock('@libp2p/kad-dht', () => ({
  kadDHT: jest.fn(() => 'kad-dht')
}));

jest.mock('@libp2p/identify', () => ({
  identify: jest.fn(() => 'identify'),
  identifyPush: jest.fn(() => 'identify-push')
}));

jest.mock('@libp2p/bootstrap', () => ({
  bootstrap: jest.fn(() => 'bootstrap')
}));

// Mock node instance
const createMockNode = () => ({
  peerId: { toString: () => 'QmMockPeerId123' },
  addEventListener: jest.fn(),
  start: jest.fn(async () => {}),
  stop: jest.fn(async () => {}),
  dial: jest.fn(async () => ({ id: 'mock-connection' })),
  dialProtocol: jest.fn(async () => ({ id: 'mock-stream' })),
  getConnections: jest.fn(() => [
    {
      remotePeer: { toString: () => 'QmPeer1' },
      direction: 'inbound',
      status: 'open',
      remoteAddr: { protoNames: () => ['/p2p-circuit', '/webrtc'] }
    }
  ]),
  getMultiaddrs: jest.fn(() => [
    { toString: () => '/ip4/127.0.0.1/tcp/4001/p2p/QmMockPeerId123' }
  ]),
  getProtocols: jest.fn(() => ['/chat/1.0.0', '/ipfs/ping/1.0.0']),
  getPeers: jest.fn(() => [
    { toString: () => 'QmPeer1' },
    { toString: () => 'QmPeer2' }
  ]),
  peerRouting: {
    findPeer: jest.fn(async () => ({
      multiaddrs: [{ toString: () => '/ip4/1.2.3.4/tcp/4001/p2p/QmPeerX' }]
    }))
  },
  services: {
    dht: 'kad-dht'
  }
});

describe('P2P Node', () => {
  let mockCreateLibp2p;
  let privateKey;
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Generate test key
    privateKey = await generateKeyPair('Ed25519');
    
    // Get mocked createLibp2p
    const libp2pModule = await import('libp2p');
    mockCreateLibp2p = libp2pModule.createLibp2p;
  });
  
  describe('createP2PNode', () => {
    test('creates node with correct configuration', async () => {
      const mockNode = createMockNode();
      mockCreateLibp2p.mockResolvedValue(mockNode);
      
      const node = await createP2PNode(privateKey);
      
      expect(mockCreateLibp2p).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey,
          addresses: {
            listen: ['/webrtc', '/p2p-circuit']
          },
          transports: expect.arrayContaining([
            'relay-transport',
            'webrtc-transport',
            'websockets-transport'
          ]),
          streamMuxers: ['yamux-muxer'],
          connectionEncrypters: ['noise-encryption'],
          services: expect.objectContaining({
            dht: 'kad-dht',
            identify: 'identify',
            identifyPush: 'identify-push'
          })
        })
      );
      
      expect(node).toBe(mockNode);
    });
    
    test('sets up event handlers', async () => {
      const mockNode = createMockNode();
      mockCreateLibp2p.mockResolvedValue(mockNode);
      
      await createP2PNode(privateKey);
      
      // Should set up event listeners
      expect(mockNode.addEventListener).toHaveBeenCalledWith(
        'peer:discovery',
        expect.any(Function)
      );
      expect(mockNode.addEventListener).toHaveBeenCalledWith(
        'peer:connect',
        expect.any(Function)
      );
      expect(mockNode.addEventListener).toHaveBeenCalledWith(
        'peer:disconnect',
        expect.any(Function)
      );
      expect(mockNode.addEventListener).toHaveBeenCalledWith(
        'connection:open',
        expect.any(Function)
      );
    });
    
    test('accepts additional options', async () => {
      const mockNode = createMockNode();
      mockCreateLibp2p.mockResolvedValue(mockNode);
      
      const customOptions = {
        connectionManager: {
          maxConnections: 100
        }
      };
      
      await createP2PNode(privateKey, customOptions);
      
      expect(mockCreateLibp2p).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionManager: expect.objectContaining({
            maxConnections: 100
          })
        })
      );
    });
  });
  
  describe('connectToPeer', () => {
    test('connects to peer by multiaddr', async () => {
      const mockNode = createMockNode();
      const multiaddr = '/ip4/127.0.0.1/tcp/4001/p2p/QmPeerX';
      
      const connection = await connectToPeer(mockNode, multiaddr);
      
      expect(mockNode.dial).toHaveBeenCalledWith(
        expect.objectContaining({
          toString: expect.any(Function)
        })
      );
      expect(connection).toEqual({ id: 'mock-connection' });
    });
    
    test('connects to peer by peer ID using DHT', async () => {
      const mockNode = createMockNode();
      const peerId = 'QmPeerX';
      
      const connection = await connectToPeer(mockNode, peerId);
      
      expect(mockNode.peerRouting.findPeer).toHaveBeenCalledWith(peerId);
      expect(mockNode.dial).toHaveBeenCalled();
      expect(connection).toEqual({ id: 'mock-connection' });
    });
    
    test('throws error when peer not found', async () => {
      const mockNode = createMockNode();
      mockNode.peerRouting.findPeer.mockResolvedValue({
        multiaddrs: []
      });
      
      await expect(connectToPeer(mockNode, 'QmUnknown'))
        .rejects.toThrow('No addresses found for peer');
    });
    
    test('handles connection failures', async () => {
      const mockNode = createMockNode();
      mockNode.dial.mockRejectedValue(new Error('Connection failed'));
      
      await expect(connectToPeer(mockNode, '/ip4/1.2.3.4/tcp/4001/p2p/QmX'))
        .rejects.toThrow('Connection failed');
    });
  });
  
  describe('getNodeStats', () => {
    test('returns comprehensive node statistics', () => {
      const mockNode = createMockNode();
      
      const stats = getNodeStats(mockNode);
      
      expect(stats).toEqual({
        peerId: 'QmMockPeerId123',
        addresses: ['/ip4/127.0.0.1/tcp/4001/p2p/QmMockPeerId123'],
        connections: [{
          peer: 'QmPeer1',
          direction: 'inbound',
          status: 'open',
          protocols: ['/p2p-circuit', '/webrtc']
        }],
        connectionCount: 1,
        protocols: ['/chat/1.0.0', '/ipfs/ping/1.0.0'],
        peers: ['QmPeer1', 'QmPeer2']
      });
    });
  });
  
  describe('stopNode', () => {
    test('gracefully stops the node', async () => {
      const mockNode = createMockNode();
      
      await stopNode(mockNode);
      
      expect(mockNode.stop).toHaveBeenCalled();
    });
    
    test('handles stop errors gracefully', async () => {
      const mockNode = createMockNode();
      mockNode.stop.mockRejectedValue(new Error('Stop failed'));
      
      // Should not throw
      await expect(stopNode(mockNode)).resolves.not.toThrow();
    });
  });
});