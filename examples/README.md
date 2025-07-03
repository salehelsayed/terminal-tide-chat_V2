# Libp2p Examples

This directory contains practical examples demonstrating key libp2p concepts and implementations.

## Examples

### gen-key-example.js
This file demonstrates key generation using Libp2p's crypto utilities, specifically generating an Ed25519 private key, exporting it as a Uint8Array, and deriving a Peer ID, which is useful for understanding peer identity creation in decentralized networks.

### pub-sub.js
This file demonstrates publish-subscribe messaging using libp2p's gossipsub protocol, showing how peers can subscribe to topics, publish messages, and handle peer discovery for decentralized communication patterns.

### chat-app-example.js
This file sets up a Libp2p node for P2P communication, handles peer discovery, connection management, pubsub messaging for chat, and integrates with the HTML UI to enable real-time chatting, including functions for sending/receiving messages and managing user interfaces.

### chat-app.html
This file is an HTML template for a P2P chat application UI, including CSS for styling components like the sidebar (for user lists), chat area (for messages), and input fields, with dynamic elements for real-time interactions.

### relay-example.js
This file demonstrates circuit relay functionality in libp2p, showing how peers can communicate through relay nodes when direct connections aren't possible, enabling connectivity across NATs and firewalls in decentralized networks.
