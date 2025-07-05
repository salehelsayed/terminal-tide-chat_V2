# P2P Chat Terminal

A decentralized peer-to-peer chat application built with libp2p that runs in web browsers. Chat directly with other users without any central servers using WebRTC and DHT for peer discovery.

## Features

- **Decentralized**: No central servers required
- **WebRTC Communication**: Direct browser-to-browser messaging
- **DHT Peer Discovery**: Find peers automatically using distributed hash table
- **Terminal Interface**: Classic green-on-black terminal styling
- **Persistent Identity**: Ed25519 keypairs stored locally
- **Real-time Chat**: Instant messaging with online user lists

## Prerequisites

- Node.js 18+ 
- npm or yarn package manager
- Modern web browser with WebRTC support
- HTTPS environment (required for WebRTC)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd terminal-tide-chat_V2
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

### Development Mode
```bash
npm run dev
```
This starts the development server at `https://localhost:9000`

### Production Mode
```bash
npm run build
npm start
```

### Available Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues

## Usage

1. Open your browser and navigate to `https://localhost:9000`
2. Accept the self-signed certificate warning (required for WebRTC)
3. Your peer ID will be automatically generated and displayed
4. Set your nickname in the left panel
5. Wait for peers to connect via DHT discovery
6. Start chatting!

### Chat Commands

- `/help` - Show available commands
- `/nick <nickname>` - Set your nickname
- `/connect <peer-id>` - Connect to a specific peer
- `/debug` - Toggle debug panel
- `/clear` - Clear chat history

### Adding Friends

1. Get a peer ID from another user
2. Enter it in the "Add Friend" input field
3. Click "Add Friend" to establish connection

## Network Requirements

- **HTTPS**: Required for WebRTC functionality
- **Firewall**: May need to allow WebRTC traffic
- **NAT Traversal**: Uses STUN/TURN for connection establishment

## Troubleshooting

**Connection Issues:**
- Ensure HTTPS is enabled (WebRTC requirement)
- Check browser WebRTC support
- Verify firewall/NAT settings

**No Peers Found:**
- DHT discovery can take time
- Try manually connecting via peer ID
- Check network connectivity

**Chat Not Working:**
- Refresh the page to reinitialize
- Check browser console for errors
- Verify WebRTC permissions

## Development

The application uses:
- **libp2p** for P2P networking
- **WebRTC** for direct browser communication
- **Webpack** for bundling
- **Jest** for testing

Key directories:
- `src/` - Application source code
- `src/components/` - UI components
- `src/lib/` - Core P2P functionality
- `tests/` - Unit tests
- `examples/` - Example implementations

## License

MIT License - see LICENSE file for details 