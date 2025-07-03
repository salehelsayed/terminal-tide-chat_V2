name: "P2P Chat Application - libp2p Implementation"
description: |

## Purpose
Complete implementation of a peer-to-peer chat application using libp2p with WebRTC transport, DHT discovery, and terminal-style UI. This PRP provides all necessary context for one-pass implementation success.

## Core Principles
1. **Context is King**: All libp2p patterns, gotchas, and examples included
2. **Validation Loops**: Executable tests with Jest for each component
3. **Information Dense**: Real code patterns from examples
4. **Progressive Success**: Core connectivity first, then features
5. **Global rules**: Follow all rules in CLAUDE.md

---

## Goal
Build a decentralized P2P chat application that:
- Connects directly between browsers using WebRTC/libp2p
- Discovers peers via DHT without central server dependency
- Provides persistent identity via Ed25519 keypairs
- Offers terminal-style UI with public channels and DMs
- Handles connection drops gracefully with circuit relay fallback

## Why
- **Business value**: Enable censorship-resistant, serverless communication
- **User impact**: Privacy-focused chat with no central point of failure
- **Integration**: Foundation for future P2P features (file sharing, voice)
- **Problems solved**: Server costs, privacy concerns, centralized control

## What
Browser-based P2P chat with:
- WebRTC direct connections with STUN/TURN fallback
- DHT peer discovery via bootstrap nodes
- Local storage for keys and chat history
- Terminal UI with three-panel layout
- Public channels and private messaging
- Friend management by PeerID

### Success Criteria
- [ ] Two browsers can discover and connect via PeerID
- [ ] Messages reliably delivered in both directions
- [ ] Connections persist through temporary network issues
- [ ] Chat history persists in local storage
- [ ] UI updates reflect connection state in real-time

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- url: https://docs.libp2p.io
  why: Main documentation portal for concepts and guides
  
- url: https://github.com/libp2p/js-libp2p
  why: JavaScript implementation reference and API docs
  
- file: /mnt/c/Users/s/Desktop/ADHOC/Context-Engineering-Intro/examples/chat-app-example.js
  why: Working chat implementation pattern with stream handling
  
- file: /mnt/c/Users/s/Desktop/ADHOC/Context-Engineering-Intro/examples/relay-example.js
  why: Circuit relay setup for NAT traversal
  
- file: /mnt/c/Users/s/Desktop/ADHOC/Context-Engineering-Intro/examples/gen-key-example.js
  why: Key generation and PeerID derivation pattern
  
- url: https://github.com/libp2p/js-libp2p-example-discovery-mechanisms
  why: Peer discovery patterns including DHT setup
  
- url: https://github.com/libp2p/js-libp2p-example-webrtc-private-to-private
  why: WebRTC transport configuration for browsers

- doc: https://github.com/libp2p/js-libp2p/blob/main/doc/CONFIGURATION.md
  section: Transports and Stream Muxers
  critical: WebRTC requires specific ICE server configuration
```

### Current Codebase tree
```bash
.
├── CLAUDE.md
├── INITIAL.md
├── LICENSE
├── PRPs/
│   ├── EXAMPLE_multi_agent_prp.md
│   └── templates/
│       └── prp_base.md
├── README.md
└── examples/
    ├── README.md
    ├── chat-app-example.js
    ├── chat-app.html
    ├── gen-key-example.js
    ├── pub-sub.js
    └── relay-example.js
```

### Desired Codebase tree with files to be added
```bash
.
├── src/
│   ├── index.html              # Main UI with terminal styling
│   ├── index.js                # Application entry point
│   ├── styles.css              # Terminal-style CSS
│   ├── lib/
│   │   ├── p2p-node.js         # libp2p node creation and config
│   │   ├── chat-protocol.js    # Chat protocol handler
│   │   ├── key-manager.js      # Key storage/retrieval
│   │   ├── storage.js          # Local storage wrapper
│   │   └── ui-manager.js       # UI state management
│   └── components/
│       ├── terminal.js         # Terminal UI component
│       ├── user-list.js        # Online users panel
│       ├── settings.js         # Settings panel
│       └── debug-panel.js      # Debug info display
├── tests/
│   ├── p2p-node.test.js
│   ├── chat-protocol.test.js
│   ├── key-manager.test.js
│   └── storage.test.js
├── package.json
├── webpack.config.js           # Bundle for browser
└── jest.config.js
```

### Known Gotchas & Library Quirks
```javascript
// CRITICAL: libp2p in browsers requires specific setup
 1. WebRTC needs STUN/TURN servers for NAT traversal
 2. Must use WSS (secure websockets) for bootstrap nodes
 3. Browser nodes should run in clientMode for DHT
 4. Keys are 64 bytes (32 seed + 32 public) not just 32
 5. Streams must be properly closed to prevent memory leaks
 6. Length-prefix encoding required for message framing
 7. Single chat session per peer - prevent duplicate streams
 8. Circuit relay essential for restrictive NATs
 9. Use yamux for stream multiplexing with keepalive
 10. Bootstrap list needs periodic refresh (60s interval)
```

## Implementation Blueprint

### Data models and structure

```javascript
// Message format (follows Matrix-like structure)
{
  type: 'm.room.message',     // or 'hello' for handshake
  sender: 'QmPeerId...',      // Sender's PeerID
  room_id: 'room_hash',       // Deterministic from sorted peer IDs
  origin_ts: 1234567890,      // Unix timestamp
  seq: 1,                     // Message sequence number
  event_id: 'unique_id',      // Unique message ID
  content: {
    msgtype: 'm.text',
    body: 'Hello world'
  }
}

// Handshake format
{
  type: 'hello',
  sender: 'QmPeerId...',
  protocol_version: 'length-prefixed-v1',
  capabilities: { v: 1, maxFrame: 131072 }
}

// Local storage structure
{
  'libp2p-keys': {
    privateKey: Uint8Array(64),  // Ed25519 private key
    peerId: 'QmPeerId...'
  },
  'libp2p-nickname': 'Alice',
  'libp2p-friends': ['QmPeerIdBob...', 'QmPeerIdCarol...'],
  'libp2p-chat-history': {
    'room_hash': [messages...]
  }
}
```

### List of tasks to be completed in order

```yaml
Task 1 - Core Project Setup:
CREATE package.json:
  - Dependencies: libp2p, @libp2p/webrtc, @libp2p/websockets, @libp2p/kad-dht
  - Dev dependencies: webpack, jest, @testing-library/dom
  - Scripts: start, build, test, dev

CREATE webpack.config.js:
  - Bundle for browser with polyfills
  - Dev server with HTTPS for WebRTC
  - Source maps for debugging

Task 2 - Key Management:
CREATE src/lib/key-manager.js:
  - PATTERN: Use examples/gen-key-example.js
  - Generate Ed25519 keys
  - Store/retrieve from localStorage
  - Export/import functionality
  - Derive PeerID from keys

Task 3 - Storage Layer:
CREATE src/lib/storage.js:
  - Wrapper for localStorage with JSON serialization
  - Chat history management
  - Friend list persistence
  - Settings storage

Task 4 - P2P Node Configuration:
CREATE src/lib/p2p-node.js:
  - PATTERN: Combine examples/chat-app-example.js and relay-example.js
  - WebRTC transport with ICE servers
  - WebSocket transport for bootstrap
  - Circuit relay transport
  - DHT in client mode
  - Bootstrap peer list

Task 5 - Chat Protocol:
CREATE src/lib/chat-protocol.js:
  - PATTERN: Use stream handling from examples/chat-app-example.js
  - Protocol handler registration
  - Message encoding/decoding with length-prefix
  - Stream lifecycle management
  - Handshake implementation
  - Single session per peer enforcement

Task 6 - Terminal UI:
CREATE src/index.html:
  - Three-panel layout
  - Terminal-style design
  - Input handling
  - Slash command support

CREATE src/styles.css:
  - Monospace fonts
  - Green-on-black terminal theme
  - Responsive panels
  - Animation for connection states

Task 7 - UI Components:
CREATE src/components/terminal.js:
  - Message display with timestamps
  - System message formatting
  - Command parsing
  - Auto-scroll behavior

CREATE src/components/user-list.js:
  - Online peer display
  - Nickname resolution
  - Click to DM functionality
  - Connection status indicators

CREATE src/components/settings.js:
  - Tabbed interface (General, Display, Audio, Files)
  - Nickname management
  - Key export/import
  - Network stats display

CREATE src/components/debug-panel.js:
  - Node info display
  - Active connections
  - Protocol details
  - Raw message sending

Task 8 - Main Application:
CREATE src/index.js:
  - Initialize libp2p node
  - Connect UI components
  - Event handling
  - Bootstrap connection
  - Error boundaries

Task 9 - Tests:
CREATE tests/*.test.js:
  - Unit tests for each module
  - Mock libp2p for testing
  - UI component tests
  - Integration test for message flow
```

### Per task pseudocode

```javascript
// Task 2 - Key Manager
class KeyManager {
  async generateKeys() {
    // PATTERN: From gen-key-example.js
    const privateKey = await generateKeyPair('Ed25519')
    const peerId = peerIdFromPrivateKey(privateKey)
    
    // CRITICAL: Store full 64-byte key
    storage.set('libp2p-keys', {
      privateKey: privateKey.raw,
      peerId: peerId.toString()
    })
    return { privateKey, peerId }
  }
  
  async loadKeys() {
    const stored = storage.get('libp2p-keys')
    if (!stored) return null
    
    // GOTCHA: Must use privateKeyFromRaw
    const privateKey = privateKeyFromRaw(stored.privateKey)
    const peerId = peerIdFromPrivateKey(privateKey)
    return { privateKey, peerId }
  }
}

// Task 4 - P2P Node
async function createP2PNode(privateKey) {
  return await createLibp2p({
    privateKey,
    addresses: {
      listen: ['/webrtc', '/p2p-circuit']
    },
    transports: [
      // CRITICAL: Order matters - circuit relay first
      circuitRelayTransport({ discoverRelays: 2 }),
      webRTC({
        rtcConfiguration: {
          iceServers: [{
            urls: ['stun:stun.l.google.com:19302']
          }]
        }
      }),
      webSockets() // For bootstrap only
    ],
    streamMuxers: [
      // GOTCHA: Need keepalive for long connections
      yamux({
        enableKeepAlive: true,
        keepAliveInterval: 15000
      })
    ],
    connectionEncrypters: [noise()],
    services: {
      // CRITICAL: Client mode for browser DHT
      dht: kadDHT({ clientMode: true }),
      identify: identify(),
      identifyPush: identifyPush()
    },
    peerDiscovery: [
      bootstrap({
        list: BOOTSTRAP_PEERS,
        interval: 60000 // Refresh hourly
      })
    ]
  })
}

// Task 5 - Chat Protocol
class ChatProtocol {
  constructor(node, storage) {
    this.sessions = new Map() // One per peer
    
    // PATTERN: From chat-app-example.js
    node.handle(CHAT_PROTOCOL, this.handleStream, {
      maxInboundStreams: 32,
      runOnLimitedConnection: true
    })
  }
  
  async handleStream({ stream, connection }) {
    const peerId = connection.remotePeer.toString()
    
    // CRITICAL: Prevent duplicate sessions
    if (this.sessions.has(peerId)) {
      await stream.close()
      return
    }
    
    const session = new ChatSession(stream, peerId)
    this.sessions.set(peerId, session)
    
    // GOTCHA: Clean up on close
    stream.addEventListener('close', () => {
      this.sessions.delete(peerId)
    })
  }
}
```

### Integration Points
```yaml
BROWSER APIs:
  - localStorage: Keys and chat history
  - WebRTC: getUserMedia not needed (data only)
  - Crypto: SubtleCrypto for additional encryption
  
NETWORK:
  - Bootstrap: wss://bootstrap.libp2p.io
  - DHT: /dns4/mknoun.xyz/tcp/4001/wss/p2p/12D3KooW...
  - STUN: stun:stun.l.google.com:19302
  
UI EVENTS:
  - node events: peer:discovery, peer:connect, peer:disconnect
  - protocol events: message, handshake, error
  - ui events: send-message, change-room, add-friend
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Install dependencies first
npm install

# Lint JavaScript
npx eslint src/**/*.js --fix

# Expected: No errors. If errors, fix based on messages.
```

### Level 2: Unit Tests
```javascript
// tests/key-manager.test.js
describe('KeyManager', () => {
  test('generates valid Ed25519 keys', async () => {
    const km = new KeyManager()
    const { privateKey, peerId } = await km.generateKeys()
    
    expect(privateKey.type).toBe('Ed25519')
    expect(privateKey.raw).toHaveLength(64)
    expect(peerId.toString()).toMatch(/^Qm/)
  })
  
  test('persists and retrieves keys', async () => {
    const km = new KeyManager()
    const generated = await km.generateKeys()
    const loaded = await km.loadKeys()
    
    expect(loaded.peerId.toString()).toBe(generated.peerId.toString())
  })
})

// tests/chat-protocol.test.js
describe('ChatProtocol', () => {
  test('handles handshake correctly', async () => {
    const protocol = new ChatProtocol(mockNode, mockStorage)
    const result = await protocol.handleHandshake(mockHandshakeMsg)
    
    expect(result.type).toBe('hello')
    expect(result.protocol_version).toBe('length-prefixed-v1')
  })
  
  test('prevents duplicate sessions', async () => {
    const protocol = new ChatProtocol(mockNode, mockStorage)
    await protocol.handleStream(mockStream1)
    await protocol.handleStream(mockStream2) // Same peer
    
    expect(protocol.sessions.size).toBe(1)
  })
})
```

```bash
# Run tests iteratively
npm test -- --watch

# Full test run
npm test -- --coverage
```

### Level 3: Integration Test
```bash
# Build the application
npm run build

# Start dev server (needs HTTPS for WebRTC)
npm run dev

# Open two browser windows
# 1. First browser: Generate identity, copy PeerID
# 2. Second browser: Add friend using PeerID
# 3. Verify connection established
# 4. Send message, verify delivery
# 5. Check localStorage for persistence
```

### Level 4: Network Test
```javascript
// Manual test script
const node1 = await createP2PNode(key1)
const node2 = await createP2PNode(key2)

// Start both nodes
await node1.start()
await node2.start()

// Connect via relay
await node1.dial(node2.peerId)

// Open chat stream
const stream = await node1.dialProtocol(node2.peerId, CHAT_PROTOCOL)

// Send test message
await sendMessage(stream, { type: 'test', body: 'Hello P2P!' })
```

## Final Validation Checklist
- [ ] Two browsers connect via PeerID: Test with friend add
- [ ] Messages delivered reliably: 10 messages, 0 drops
- [ ] Relay fallback works: Block direct connection, test relay
- [ ] Chat history persists: Refresh page, verify history
- [ ] UI updates properly: Connection indicators accurate
- [ ] Keys export/import: Test identity migration
- [ ] No memory leaks: Monitor DevTools memory over 30min
- [ ] Error handling: Disconnect network, verify graceful degradation

---

## Anti-Patterns to Avoid
- ❌ Don't use HTTP - WebRTC requires HTTPS
- ❌ Don't skip handshake - Protocol version matters
- ❌ Don't allow multiple sessions per peer
- ❌ Don't forget to close streams and pushables
- ❌ Don't use sync crypto - Use libp2p's async methods
- ❌ Don't hardcode bootstrap peers - Make configurable
- ❌ Don't store keys in plaintext - Consider encryption
- ❌ Don't trust peer nicknames - Verify against PeerID

## Confidence Score: 9/10
This PRP includes all necessary libp2p patterns, working examples, common gotchas, and validation steps for successful one-pass implementation.