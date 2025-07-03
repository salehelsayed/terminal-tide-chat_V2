import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify, identifyPush } from '@libp2p/identify';
import { dcutr } from '@libp2p/dcutr';
import { ping } from '@libp2p/ping';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { multiaddr } from '@multiformats/multiaddr';
import { peerIdFromString } from '@libp2p/peer-id';

// Bootstrap peers for initial network connection
const BOOTSTRAP_PEERS = [
  // Main DHT bootstrap server
  '/dns4/mknoun.xyz/tcp/4001/wss/p2p/12D3KooWGMYMmN1RGUYjWaSV6P3XtnBjwnosnJGNMnttfVCRnd6g',
  // Additional bootstrap peers can be added here
];

// STUN/TURN servers for WebRTC NAT traversal
const ICE_SERVERS = [
  {
    urls: ['stun:stun.l.google.com:19302']
  },
  {
    urls: ['stun:stun1.l.google.com:19302']
  }
  // Add TURN servers here if available
];

/**
 * Create and configure a libp2p node for P2P chat
 * 
 * @param {object} privateKey - Ed25519 private key for node identity
 * @param {object} options - Additional configuration options
 * @returns {Promise<object>} Configured libp2p node
 */
export async function createP2PNode(privateKey, options = {}) {
  const config = {
    // Node identity
    privateKey,
    
    // Addresses to listen on
    addresses: {
      listen: [
        '/webrtc',      // WebRTC for browser-to-browser
        '/p2p-circuit'  // Circuit relay for NAT traversal
      ]
    },
    
    // Transport protocols
    transports: [
      // CRITICAL: Circuit relay must be first for proper discovery
      circuitRelayTransport({
        discoverRelays: 2,  // Discover up to 2 relay nodes
        reservationConcurrency: 3
      }),
      
      // WebRTC for direct browser connections
      webRTC({
        rtcConfiguration: {
          iceServers: [
            {
              urls: [
                'stun:mknoun.xyz:3478',
                'turn:mknoun.xyz:3478?transport=udp',
                'turn:mknoun.xyz:3478?transport=tcp'
              ],
              username: 'testuser',
              credential: 'testpass'
            }
          ]
        }
      }),
      
      // WebSockets for bootstrap connections only
      webSockets()
    ],
    
    // Stream multiplexing
    streamMuxers: [
      yamux({
        // GOTCHA: Keep-alive is essential for long connections
        enableKeepAlive: true,
        keepAliveInterval: 15000,    // 15 seconds
        idleTimeout: 300000,          // 5 minutes
        maxMessageSize: 1048576       // 1MB
      })
    ],
    
    // Connection encryption
    connectionEncrypters: [noise()],
    
    // Peer discovery mechanisms
    peerDiscovery: [
      bootstrap({
        list: BOOTSTRAP_PEERS,
        interval: 60000,  // Re-check every minute
        timeout: 30000    // 30 second timeout
      })
    ],
    
    // Network services
    services: {
      // DHT for peer discovery - set to server mode for better discovery
      dht: kadDHT({
        clientMode: false,  // Server mode for better peer discovery
        protocol: '/ipfs/lan/kad/1.0.0'  // Use LAN protocol like in example
      }),
      
      // Identify protocol for peer exchange
      identify: identify(),
      identifyPush: identifyPush(),
      cutr: dcutr(),
      ping: ping(),
    },
    
    // Connection manager settings
    connectionManager: {
      maxConnections: 50,
      minConnections: 2,
      autoDial: true,
      autoDialInterval: 10000,
      maxParallelDials: 3,
      dialTimeout: 30000
    },
    
    // Merge any additional options
    ...options
  };
  
  // Create the libp2p node
  const node = await createLibp2p(config);
  
  // Set up event handlers
  setupNodeEventHandlers(node);
  
  return node;
}

/**
 * Set up event handlers for the libp2p node
 * 
 * @param {object} node - libp2p node instance
 */
function setupNodeEventHandlers(node) {
  // Peer discovery
  node.addEventListener('peer:discovery', (evt) => {
    if (evt.detail && evt.detail.id) {
      const peerId = evt.detail.id.toString();
      console.log('[P2P] 🔍 PEER:DISCOVERY EVENT for:', peerId);
      
      // Check if this is a bootstrap node
      const isBootstrap = BOOTSTRAP_PEERS.some(addr => addr.includes(peerId));
      if (isBootstrap) {
        console.log('[P2P] 🔍 This is a bootstrap node');
      }
    }
  });
  
  // Peer connection
  node.addEventListener('peer:connect', (evt) => {
    if (evt.detail) {
      const peerId = evt.detail.toString();
      console.log(`\n[P2P] 🔗 PEER:CONNECT EVENT for: ${peerId}`);
      
      // Get connection details
      const connections = node.getConnections(peerId);
      if (connections.length > 0) {
        const conn = connections[0];
        console.log('[P2P] 🔗 Connection details:', {
          status: conn.status,
          direction: conn.stat?.direction,
          limitedConnection: conn.limitedConnection
        });
      }
    }
  });
  
  // Peer disconnection
  node.addEventListener('peer:disconnect', (evt) => {
    if (evt.detail) {
      const peerId = evt.detail.toString();
      console.log('[P2P] 📪 PEER:DISCONNECT EVENT for:', peerId);
    }
  });
  
  // Connection events - most detailed info
  node.addEventListener('connection:open', (evt) => {
    const connection = evt.detail;
    if (!connection) return;
    
    const { remotePeer, remoteAddr } = connection;
    console.log(`\n[P2P] 🔗 CONNECTION:OPEN EVENT`);
    console.log(`[P2P] 🔗 Remote peer: ${remotePeer.toString()}`);
    console.log(`[P2P] 🔗 Direction: ${connection.stat?.direction || 'unknown'}`);
    console.log(`[P2P] 🔗 Status: ${connection.status}`);
    console.log(`[P2P] 🔗 Limited connection: ${connection.limitedConnection}`);

    if (remoteAddr) {
      console.log(`[P2P] 🔗 Address: ${remoteAddr.toString()}`);
      if (remoteAddr.toString().includes('/p2p-circuit')) {
        console.log('[P2P] => Circuit relay connection');
      } else if (remoteAddr.toString().includes('/webrtc')) {
        console.log('[P2P] => Direct WebRTC connection!');
      } else if (remoteAddr.toString().includes('/wss/')) {
        console.log('[P2P] => WebSocket Secure connection!');
      }
    }
  });
  
  // Self peer discovery (finding our own addresses)
  node.addEventListener('self:peer:update', (evt) => {
    console.log('\n[P2P] 📍 SELF:PEER:UPDATE - Our addresses:');
    evt.detail.peer.addresses.forEach(addr => {
      console.log('  ', addr.toString());
    });
  });
}

/**
 * Connect to a specific peer by multiaddr or peer ID
 * 
 * @param {object} node - libp2p node instance
 * @param {string} peer - Peer ID or multiaddr string
 * @param {string} protocol - Optional protocol to dial
 * @returns {Promise<object>} Connection object or stream if protocol specified
 */
export async function connectToPeer(node, peer, protocol = null) {
  try {
    // Check if it's a multiaddr or just a peer ID
    if (peer.includes('/')) {
      // Direct multiaddr provided
      const peerAddr = multiaddr(peer);
      if (protocol) {
        return await node.dialProtocol(peerAddr, protocol);
      }
      return await node.dial(peerAddr);
    } else {
      // Just peer ID - parse it
      console.log('[ConnectToPeer] 🔎 Looking for peer:', peer);
      const peerId = peerIdFromString(peer);
      console.log('[ConnectToPeer] 🔎 Parsed peer ID object:', {
        toString: peerId.toString(),
        type: typeof peerId,
        hasToBytes: typeof peerId.toBytes === 'function',
        hasMultihash: !!peerId.multihash,
        multihashType: peerId.multihash ? typeof peerId.multihash : 'N/A'
      });
      
      // First check if we're already connected
      const existingConnections = node.getConnections(peerId);
      if (existingConnections.length > 0) {
        console.log('[ConnectToPeer] ✅ Already connected to peer');
        if (protocol) {
          return await node.dialProtocol(peerId, protocol);
        }
        return existingConnections[0];
      }
      
      // Try to find peer via DHT/peerRouting
      try {
        console.log('[ConnectToPeer] 🔍 Starting peer discovery...');
        console.log('[ConnectToPeer] 🔍 Looking for peer:', peerId.toString());
        
        // First, check if we have any stored addresses for this peer
        const storedPeerInfo = await node.peerStore.get(peerId);
        if (storedPeerInfo && storedPeerInfo.addresses && storedPeerInfo.addresses.length > 0) {
          console.log('[ConnectToPeer] 💾 Found stored addresses in peerStore:');
          storedPeerInfo.addresses.forEach(addr => {
            console.log(`  - ${addr.multiaddr.toString()}`);
          });
        }
        
        // Try to find peer using peerRouting (which uses DHT internally)
        console.log('[ConnectToPeer] 🔍 Querying peer routing (DHT)...');
        
        let foundAddresses = [];
        try {
          const peerInfo = await node.peerRouting.findPeer(peerId);
          console.log(`[ConnectToPeer] ✅ Found peer via peer routing!`);
          console.log(`[ConnectToPeer] 🏡 Peer ID matches: ${peerInfo.id.equals(peerId)}`);
          
          if (peerInfo.multiaddrs && peerInfo.multiaddrs.length > 0) {
            foundAddresses = peerInfo.multiaddrs;
            console.log(`[ConnectToPeer] 🏡 Found ${foundAddresses.length} addresses:`);
            foundAddresses.forEach(ma => {
              const addrStr = ma.toString();
              console.log(`  - ${addrStr}`);
              
              if (addrStr.includes('/p2p-circuit')) {
                console.log('    ^ Circuit relay address');
              } else if (addrStr.includes('/webrtc')) {
                console.log('    ^ WebRTC address');
              } else if (addrStr.includes('/wss/')) {
                console.log('    ^ WebSocket Secure address');
              }
            });
            
            // Store addresses in peerStore for future use
            console.log('[ConnectToPeer] 💾 Storing addresses in peerStore...');
            for (const addr of foundAddresses) {
              await node.peerStore.merge(peerId, { multiaddrs: [addr] });
            }
          } else {
            console.log('[ConnectToPeer] ⚠️ Peer found but no addresses available');
          }
        } catch (findPeerError) {
          console.log('[ConnectToPeer] ⚠️ Peer not found via routing:', findPeerError.message);
          
          // Check if we're connected to bootstrap nodes
          const connections = node.getConnections();
          const bootstrapConnections = connections.filter(conn => {
            const addr = conn.remoteAddr.toString();
            return addr.includes('12D3KooWGMYMmN1RGUYjWaSV6P3XtnBjwnosnJGNMnttfVCRnd6g');
          });
          
          if (bootstrapConnections.length === 0) {
            console.log('[ConnectToPeer] ❌ Not connected to bootstrap node - this might be why DHT lookup fails');
          } else {
            console.log('[ConnectToPeer] ✅ Connected to bootstrap node, but peer not in DHT');
          }
        }
      } catch (error) {
        console.log('[ConnectToPeer] ❌ Peer discovery error:', error.message);
        console.log('[ConnectToPeer] 📡 Will attempt direct dial anyway...');
      }
      
      // Now dial the peer - libp2p will try all known addresses
      try {
        console.log('[ConnectToPeer] 📞 Dialing peer...');
        
        if (protocol) {
          // Use dialProtocol which will handle peer discovery automatically
          const stream = await node.dialProtocol(peerId, protocol);
          console.log(`[ConnectToPeer] 🎉 Successfully connected with protocol ${protocol}!`);
          return stream;
        } else {
          // Just establish connection without specific protocol
          const connection = await node.dial(peerId);
          console.log('[ConnectToPeer] 🎉 Successfully connected!');
          return connection;
        }
      } catch (dialError) {
        console.error('[ConnectToPeer] ❌ Failed to dial peer:', dialError);
        
        // If direct dial fails, try to use any stored multiaddrs
        const storedAddrs = await node.peerStore.get(peerId);
        if (storedAddrs && storedAddrs.addresses && storedAddrs.addresses.length > 0) {
          console.log('[ConnectToPeer] 🔄 Trying stored addresses...');
          for (const addrInfo of storedAddrs.addresses) {
            try {
              const addr = addrInfo.multiaddr;
              console.log('[ConnectToPeer] Trying stored address:', addr.toString());
              if (protocol) {
                return await node.dialProtocol(addr, protocol);
              }
              return await node.dial(addr);
            } catch (e) {
              console.warn('[ConnectToPeer] Failed with stored address:', e.message);
            }
          }
        }
        
        throw dialError;
      }
    }
  } catch (error) {
    console.error('[ConnectToPeer] ❌ Connection failed:', error);
    throw error;
  }
}

/**
 * Get node statistics and information
 * 
 * @param {object} node - libp2p node instance
 * @returns {object} Node statistics
 */
export function getNodeStats(node) {
  const connections = [];
  
  for (const connection of node.getConnections()) {
    connections.push({
      peer: connection.remotePeer.toString(),
      direction: connection.direction,
      status: connection.status,
      protocols: connection.remoteAddr.protoNames()
    });
  }
  
  return {
    peerId: node.peerId.toString(),
    addresses: node.getMultiaddrs().map(addr => addr.toString()),
    connections: connections,
    connectionCount: connections.length,
    protocols: node.getProtocols(),
    peers: node.getPeers().map(p => p.toString())
  };
}

/**
 * Announce our presence to the DHT
 * 
 * @param {object} node - libp2p node instance
 */
export async function announceToNetwork(node) {
  try {
    console.log('[Announce] 📢 Announcing to DHT...');
    
    // Get our multiaddrs
    const multiaddrs = node.getMultiaddrs();
    console.log('[Announce] Our addresses:', multiaddrs.map(a => a.toString()));
    
    // In browser DHT client mode, we can't directly provide
    // But we can ensure we're connected to the bootstrap nodes
    // which will help with peer discovery
    
    // Get bootstrap connections
    const connections = node.getConnections();
    const bootstrapConnections = connections.filter(conn => {
      const addr = conn.remoteAddr.toString();
      return BOOTSTRAP_PEERS.some(bootstrap => addr.includes(bootstrap.split('/').pop()));
    });
    
    if (bootstrapConnections.length > 0) {
      console.log(`[Announce] ✅ Connected to ${bootstrapConnections.length} bootstrap node(s)`);
      
      // The identify protocol should automatically exchange our addresses
      // with connected peers, making us discoverable
      console.log('[Announce] 🎯 Peer info shared via identify protocol');
    } else {
      console.log('[Announce] ⚠️ Not connected to any bootstrap nodes');
    }
    
    return true;
  } catch (error) {
    console.error('[Announce] ❌ Failed to announce:', error);
    throw error;
  }
}

/**
 * Gracefully stop the libp2p node
 * 
 * @param {object} node - libp2p node instance
 */
export async function stopNode(node) {
  try {
    await node.stop();
    console.log('Node stopped successfully');
  } catch (error) {
    console.error('Error stopping node:', error);
  }
}