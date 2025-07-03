## FEATURE:


### 1. Core P2P Networking & Connectivity
- **Decentralized Connection**: Connects to a peer-to-peer network using `libp2p`, eliminating the need for a central server.
- **Peer Discovery via DHT**: The application publishes its address to a public DHT server (`/dns4/mknoun.xyz/tcp/4001/wss/p2p/12D3KooWGMYMmN1RGUYjWaSV6P3XtnBjwnosnJGNMnttfVCRnd6g`) allowing other users to find and connect to it using its PeerID.
- **Robust Connection Handling**: `libp2p` manages multiple, bidirectional chat streams simultaneously. It is designed to gracefully handle dropped connections, multiple connection attempts from the same peer, and maintain a stable 1:1 connection with peers, using a relay to assist with NAT traversal and keeping peers connected even when they are temporarily offline.
- **WebRTC Transport**: Utilizes WebRTC for direct browser-to-browser communication channels.

### 2. User Identity & Profile
- **First-Time Setup**: On the first login, the application generates a unique PeerID and saves the cryptographic keys (public/private) to the browser's local storage. It then prompts the user for a nickname to be published on the network alongside their PeerID.
- **Key Management**: Users can export their private/public keys for backup and import them into other browsers or devices to retain their identity.
- **Nickname Management**: Users can change their display name at any time.
- **Persistent Peer ID**: The user's PeerID remains consistent as long as the keys are present in local storage.

### 3. Social Features
- **Friend Management**: Users can add friends by their PeerID. Once a friend is added and online, the application retrieves their current nickname and displays it in the UI.

### 4. Chat & Communication
- **Local Chat History**: All chat history is saved locally in the browser, ensuring privacy and offline access to past conversations.
- **Terminal-Style UI**: A classic, terminal-like interface for all interactions.
- **Public Channels**: Users join a main public channel (e.g., `#Terminal`) upon connection to chat with all connected peers.
- **Direct Messaging**: Ability to initiate one-on-one private conversations with other users from the user list.
- **System Messages**: The terminal displays system messages for important events like connection status, user joins, and errors.

### 4. Application Interface
- **Three-Panel Layout**: 
  - **Left Panel**: Contains system settings, user profile, network statistics, and node information.
  - **Center Panel**: The main chat and terminal view.
  - **Right Panel**: A list of online users/friends.
- **System Settings Tabs**: Settings are organized into tabs: General, Display, Audio, and Files.
- **Network & Node Stats**: The UI displays real-time network stats like the number of peer connections, protocol version, and latency (ping). It also shows detailed information about the local `libp2p` node.

### 5. Advanced Features & Debugging
- **Slash Commands**: The application supports slash commands for executing actions (e.g., `/help`).
- **Debug Panel**: A special `/debug` command toggles a powerful debug panel that shows detailed information about the internal `libp2p` node, including its ID, addresses, and active connections. This panel also allows sending raw messages for testing.

## EXAMPLES:
In the `examples/` folder, there is a README for you to read to understand what the example is all about.

Don't copy any of these examples directly, it is for a different project entirely. But use this as inspiration and for best practices.

## DOCUMENTATION:


DO NOT search the web. You have access to a local MCP server called "libp2p-docs" with these tools:
- fetch_docs: fetches documentation from predefined sources
- search_docs: searches libp2p documentation
- list_examples: lists available examples
- get_readme: gets README files

EXAMPLES:
# Instead of fetching entire repos, list files first
Use list_files with source="github_docs" to see available documentation files

# Then fetch specific files
Use fetch_docs with source="github_docs" and path="CONFIGURATION.md"

# Or get summaries
Use fetch_docs with source="github_main" and summary=true

# Or fetch specific sections
Use fetch_docs with source="github_main" path="README.md" section="Getting Started"



Use the fetch_docs tool with source="github_main" to get libp2p documentation.

## OTHER CONSIDERATIONS:

When debuging, fix the disease , not the symptoms. avoid complexit. 