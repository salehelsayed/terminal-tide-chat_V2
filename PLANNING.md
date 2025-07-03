# P2P Chat Application - Planning Document

## Architecture Overview

### Core Technologies
- **libp2p**: Modular P2P networking stack
- **WebRTC**: Browser-to-browser communication
- **Kademlia DHT**: Distributed peer discovery
- **Ed25519**: Cryptographic identity
- **LocalStorage**: Client-side persistence

### Design Principles
1. **Decentralization First**: No central servers except bootstrap nodes
2. **Privacy by Design**: Local storage only, no server persistence
3. **User Experience**: Terminal aesthetic with modern functionality
4. **Modularity**: Clean separation of concerns
5. **Resilience**: Graceful handling of network issues

## Component Architecture

### Library Layer (`src/lib/`)
- **p2p-node.js**: libp2p node configuration and lifecycle
- **chat-protocol.js**: Custom chat protocol over libp2p streams
- **key-manager.js**: Cryptographic key generation and storage
- **storage.js**: LocalStorage abstraction with specialized managers
- **ui-manager.js**: Coordinates UI components and state

### UI Components (`src/components/`)
- **terminal.js**: Main chat interface with command processing
- **user-list.js**: Online peers and friend management
- **settings.js**: Tabbed preferences interface
- **debug-panel.js**: Node statistics and diagnostics

### Application Entry (`src/index.js`)
- Initializes all components
- Manages application lifecycle
- Handles cross-component events
- Provides debugging interface

## Data Flow

### Message Flow
1. User types message in terminal
2. Terminal component emits message event
3. Main app determines target (broadcast/DM)
4. Chat protocol sends via libp2p stream
5. Remote peer receives and displays
6. Both peers store in local history

### Connection Flow
1. Node starts with bootstrap connection
2. DHT announces our presence
3. Peers discover via DHT or direct dial
4. WebRTC connection established
5. Chat protocol handshake
6. Session ready for messages

## Protocol Design

### Chat Protocol `/chat/1.0.0`
- Length-prefixed JSON messages
- Handshake with capabilities
- Message types: chat, handshake, nickname, typing
- Single session per peer enforcement
- Automatic reconnection handling

### Message Schema
```javascript
{
  type: 'm.room.message',
  sender: 'QmPeerId...',
  room_id: 'deterministic-hash',
  origin_ts: 1234567890,
  seq: 1,
  event_id: 'unique-id',
  content: {
    msgtype: 'm.text',
    body: 'Message content'
  }
}
```

## Security Model

### Identity
- Ed25519 keypairs (64 bytes)
- PeerID derived from public key
- Keys stored in localStorage
- Export/import for backup

### Transport Security
- Noise protocol encryption
- TLS for WebSocket connections
- WebRTC DTLS encryption

### Trust Model
- Trust on first use (TOFU)
- No identity verification
- Nicknames not cryptographically bound
- Friends list locally managed

## UI/UX Design

### Terminal Aesthetic
- Monospace fonts throughout
- Green-on-black color scheme
- ASCII art decorations
- Command-line interaction
- Keyboard-first navigation

### Layout
```
┌─────────────────────────────────────────────────┐
│                  Header Bar                      │
├──────────┬────────────────────────┬─────────────┤
│          │                        │             │
│ Settings │    Terminal/Chat       │  User List  │
│  Panel   │       Window           │    Panel    │
│          │                        │             │
└──────────┴────────────────────────┴─────────────┘
                  [Debug Panel - Hidden]
```

## Performance Considerations

### Connection Limits
- Max 50 connections (configurable)
- Min 2 connections maintained
- Auto-dial for resilience
- Connection manager pruning

### Message Handling
- 1MB max message size
- 1000 messages per room history
- Streaming for large data
- Length-prefix framing

### Resource Management
- Stream cleanup on disconnect
- Pushable closure handling
- Event listener cleanup
- Memory leak prevention

## Testing Strategy

### Unit Tests
- Key management operations
- Storage layer functionality
- Protocol message handling
- Component isolation

### Integration Tests
- Node connection lifecycle
- Message flow end-to-end
- UI component interaction
- Error recovery paths

### Manual Testing
- Cross-browser compatibility
- NAT traversal scenarios
- Network interruption handling
- Performance monitoring

## Deployment Considerations

### Browser Requirements
- WebRTC support (Chrome 90+, Firefox 85+, Safari 15+)
- LocalStorage availability
- HTTPS for production
- Secure contexts only

### Infrastructure
- Bootstrap nodes required
- STUN/TURN servers for NAT
- No backend servers needed
- Static file hosting sufficient

## Future Roadmap

### Phase 1: Core Features ✅
- Basic P2P connectivity
- Text messaging
- Friend management
- Settings persistence

### Phase 2: Enhanced Features
- File sharing protocol
- Voice/video calls
- Group chat rooms
- Message search

### Phase 3: Advanced Features
- Mobile PWA support
- Offline message queue
- Plugin system
- Federation support