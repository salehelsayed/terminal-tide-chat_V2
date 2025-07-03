/**
 * Browser P2P Chat Application
 * ----------------------------
 * Works with chat-web-app.html
 */

import { createLibp2p } from 'libp2p'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { identify, identifyPush } from '@libp2p/identify'
import { kadDHT } from '@libp2p/kad-dht'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { dcutr } from '@libp2p/dcutr'
import { ping } from '@libp2p/ping'
import { fetch } from '@libp2p/fetch'
import * as lp from 'it-length-prefixed'
import { pipe } from 'it-pipe'
import { pushable } from 'it-pushable'
import { fromString as uint8ArrayFromString, toString as uint8ArrayToString } from 'uint8arrays'
import { peerIdFromString } from '@libp2p/peer-id'
import { unmarshalEd25519PrivateKey } from '@libp2p/crypto/keys'
import { multiaddr } from '@multiformats/multiaddr'

/* -------------------------------------------------- */
/*  Configuration                                     */
/* -------------------------------------------------- */

// Node A private key (node-sala7)
const nodePrivateKey = Uint8Array.from([
  76, 38, 204, 96, 164, 167, 113, 41, 252, 16, 182,
  1, 110, 72, 53, 157, 31, 18, 110, 251, 39, 137,
  105, 189, 127, 104, 156, 189, 242, 161, 125, 128, 87,
  170, 160, 46, 231, 77, 115, 48, 191, 223, 177, 55,
  76, 102, 24, 134, 103, 190, 172, 17, 57, 205, 103,
  183, 190, 73, 215, 13, 223, 184, 222, 212
])

// Target peer to dial (node-3abed)
const TARGET_PEER_ID = '12D3KooWRpruuUZiWpTtmdELbwMYUbUDUzDt3e1q6Tbueg6np6ih'

const BOOTSTRAP_PEERS = [
  '/dns4/mknoun.xyz/tcp/4001/wss/p2p/12D3KooWGMYMmN1RGUYjWaSV6P3XtnBjwnosnJGNMnttfVCRnd6g'
]

const CHAT_PROTOCOL = '/chat/1.0.0'
const LENGTH_PREFIXED_V1 = 'length-prefixed-v1'

/* -------------------------------------------------- */
/*  Room ID generation                                */
/* -------------------------------------------------- */

function xxHash32(data, seed = 0) {
  let h32 = (seed + 0x165667B1) >>> 0;
  for (let i = 0; i < data.length; i++) {
    h32 = Math.imul(h32 ^ data.charCodeAt(i), 0x85EBCA6B);
  }
  h32 ^= data.length;
  h32 = Math.imul(h32 ^ (h32 >>> 16), 0x85EBCA6B);
  h32 = Math.imul(h32 ^ (h32 >>> 13), 0xC2B2AE35);
  return (h32 ^ (h32 >>> 16)) >>> 0;
}

function roomIdForPeers(peerA, peerB) {
  const [low, high] = [peerA, peerB].sort();
  const base = `${low}:${high}`;
  const h1 = xxHash32(base, 0).toString(16).padStart(8, '0');
  const h2 = xxHash32(base, 0x9e3779b9).toString(16).padStart(8, '0');
  return `!dm_${h1}${h2}`;
}

/* -------------------------------------------------- */
/*  Chat Session Manager                              */
/* -------------------------------------------------- */

class ChatSession {
  constructor(node) {
    this.node = node
    this.stream = null
    this.outbound = null
    this.handshakeDone = false
    this.remotePeerId = null
    this.roomId = null
    this.seq = 1
    this.isSettingUpStream = false // Add lock to prevent race conditions
  }

  async handleIncomingStream(stream, connection) {
    const remotePeerId = connection.remotePeer.toString()
    console.log('\n[Browser] 📨 INCOMING STREAM HANDLER CALLED')
    console.log('[Browser] 📨 From peer:', remotePeerId)
    console.log('[Browser] 📨 Stream direction:', stream.stat?.direction)
    console.log('[Browser] 📨 Stream ID:', stream.id)
    console.log('[Browser] 📨 Current session state:', {
      hasStream: !!this.stream,
      currentRemotePeer: this.remotePeerId,
      isActive: this.isActive()
    })
    
    // If we already have a stream with this peer, ignore the duplicate
    if (this.stream && this.remotePeerId === remotePeerId) {
      console.log('[Browser] ⚠️ Already have active stream with this peer - ignoring duplicate')
      console.log('[Browser] ⚠️ Existing stream ID:', this.stream.id)
      // Don't close the stream immediately - let it timeout naturally
      // This prevents the external node from getting an immediate error
      return
    }
    
    // Close any existing session with a different peer
    if (this.stream && this.remotePeerId !== remotePeerId) {
      console.log('[Browser] Closing existing session with:', this.remotePeerId)
      this.closeExisting()
    }
    
    console.log('[Browser] 📨 Setting up new chat session...')
    this.stream = stream
    this.remotePeerId = remotePeerId
    this.roomId = roomIdForPeers(this.node.peerId.toString(), this.remotePeerId)
    this.outbound = pushable()
    
    // Setup outbound pipe
    pipe(
      this.outbound,
      this.stream.sink
    ).catch(err => {
      console.error('[Browser] Outbound pipe error:', err)
    })

    // Setup inbound pipe
    pipe(
      this.stream.source,
      lp.decode,
      async (source) => {
        for await (const frame of source) {
          const data = uint8ArrayToString(frame.subarray())
          await this.handleMessage(data)
        }
        console.log('[Browser] 📪 Inbound chat stream ended')
        this.close()
      }
    ).catch(err => {
      console.error('[Browser] Inbound pipe error:', err)
    })

    console.log('[Browser] ✅ Chat session established (incoming)')
    console.log('[Browser] 📍 Room ID:', this.roomId)
    
    // Update UI
    if (window.ui) {
      // Add peer if not already in list
      window.ui.addPeer(this.remotePeerId, 'connected')
      window.ui.updatePeerStatus(this.remotePeerId, 'connected')
      // Only auto-select if no chat is currently selected
      if (!window.ui.currentChat) {
        window.ui.selectChat(this.remotePeerId)
      }
    }
  }

  async dialTarget(targetPeerId = TARGET_PEER_ID) {
    // Check if we already have an active stream with ANY peer
    if (this.stream && this.remotePeerId) {
      console.log('[Browser] ⚠️ Chat session already active with:', this.remotePeerId)
      // If trying to dial the same peer we're already connected to, just return
      if (this.remotePeerId === targetPeerId) {
        return
      }
      // Otherwise close existing session first
      this.close()
    }

    try {
      console.log(`\n[Browser] 📞 Attempting to dial target: ${targetPeerId}`)
      
      // Reset handshake flag for new connection
      this.handshakeDone = false
      
      const targetPeer = peerIdFromString(targetPeerId)
      this.stream = await this.node.dialProtocol(targetPeer, CHAT_PROTOCOL)
      this.remotePeerId = targetPeerId
      this.roomId = roomIdForPeers(this.node.peerId.toString(), this.remotePeerId)
      this.outbound = pushable()

      // Setup outbound pipe
      pipe(
        this.outbound,
        this.stream.sink
      ).catch(err => {
        console.error('[Browser] Outbound pipe error:', err)
      })

      // Setup inbound pipe
      pipe(
        this.stream.source,
        lp.decode,
        async (source) => {
          for await (const frame of source) {
            const data = uint8ArrayToString(frame.subarray())
            await this.handleMessage(data)
          }
          console.log('[Browser] 📪 Outbound chat stream ended')
          this.close()
        }
      ).catch(err => {
        console.error('[Browser] Inbound pipe error:', err)
      })

      // Send handshake
      await this.sendHandshake()
      
      console.log('[Browser] ✅ Chat session established (outgoing)')
      console.log('[Browser] 📍 Room ID:', this.roomId)
      
      // Update UI
      if (window.ui) {
        window.ui.updatePeerStatus(this.remotePeerId, 'connected')
        
        // If this is the current chat, update the header
        if (window.ui.currentChat === this.remotePeerId) {
          window.ui.updateChatHeader()
          window.ui.updateInputState()
        }
      }
      
    } catch (err) {
      console.error('[Browser] ❌ Failed to dial target:', err.message)
      this.close()
      
      // Update UI
      if (window.ui) {
        window.ui.updatePeerStatus(targetPeerId, 'disconnected')
        window.ui.showStatus('Failed to connect to peer', 'error')
      }
    }
  }

  async sendHandshake() {
    const handshake = {
      type: 'hello',
      sender: this.node.peerId.toString(),
      protocol_version: LENGTH_PREFIXED_V1,
      capabilities: { v: 1, maxFrame: 131072 }
    }
    
    console.log('[Browser] 📤 Sending handshake:', handshake)
    await this.sendRawMessage(JSON.stringify(handshake))
  }

  async handleMessage(data) {
    console.log('\n[Browser] 📬 HANDLEMESSAGE CALLED')
    console.log('[Browser] 📬 Raw data length:', data.length)
    
    try {
      const msg = JSON.parse(data)
      console.log('[Browser] 📨 Received MolpEvent:', msg)
      console.log('[Browser] 📨 Message type:', msg.type)
      console.log('[Browser] 📨 Current handshake state:', this.handshakeDone)
      
      if (msg.type === 'hello' && !this.handshakeDone) {
        console.log('[Browser] 📨 Processing handshake from:', msg.sender)
        this.handshakeDone = true
        
        // Send handshake response if we haven't sent one yet
        if (this.stream && this.stream.stat && this.stream.stat.direction === 'inbound') {
          console.log('[Browser] 📤 Sending handshake response')
          await this.sendHandshake()
        }
        
        console.log('[Browser] ✅ Handshake complete - using length-prefixed protocol')
        
        // Update UI
        if (window.ui) {
          window.ui.showStatus('Connected to peer', 'connected')
        }
      }
      else if (msg.type === 'm.room.message') {
        console.log(`[Browser] 💬 CHAT MESSAGE RECEIVED from ${msg.sender}:`)
        console.log(`[Browser]    Room: ${msg.room_id}`)
        console.log(`[Browser]    Text: "${msg.content?.body || 'No content'}"`)
        console.log(`[Browser]    Seq: ${msg.seq}, Time: ${new Date(msg.origin_ts).toLocaleTimeString()}`)
        console.log(`[Browser]    Current remotePeerId: ${this.remotePeerId}`)
        
        // Update UI
        if (window.ui && this.remotePeerId) {
          console.log('[Browser] 💬 Adding message to UI for peer:', this.remotePeerId)
          window.ui.addMessage(this.remotePeerId, {
            text: msg.content?.body || '',
            sender: msg.sender,
            timestamp: msg.origin_ts
          }, false)
        } else {
          console.log('[Browser] ⚠️ Cannot add message to UI - no UI or remotePeerId')
        }
      }
      else {
        console.log('[Browser] 🤔 Unknown message type:', msg.type)
      }
      
    } catch (e) {
      console.log('\n[Browser] ❌ MESSAGE PARSE ERROR')
      console.log('[Browser] <-- Raw data:', data)
      console.error('[Browser] Parse error:', e.message)
    }
  }

  async sendChatMessage(text) {
    if (!this.stream || !this.outbound) {
      console.log('[Browser] ❌ No active chat session')
      return false
    }

    const msgObject = {
      type: 'm.room.message',
      sender: this.node.peerId.toString(),
      room_id: this.roomId,
      origin_ts: Date.now(),
      seq: this.seq++,
      event_id: `msg_${Date.now()}_${Math.random()}`,
      content: {
        msgtype: 'm.text',
        body: text.trim(),
      },
    }

    console.log('[Browser] 📤 Sending MolpEvent:', msgObject)
    await this.sendRawMessage(JSON.stringify(msgObject))
    console.log('[Browser] ✅ Message sent using length-prefixed protocol')
    
    // Update UI
    if (window.ui && this.remotePeerId) {
      window.ui.addMessage(this.remotePeerId, {
        text: text.trim(),
        sender: this.node.peerId.toString(),
        timestamp: Date.now()
      }, true)
    }
    
    return true
  }

  async sendRawMessage(data) {
    if (!this.outbound) return
    
    const encoded = uint8ArrayFromString(data)
    const lengthPrefixedFrame = lp.encode.single(encoded)
    this.outbound.push(lengthPrefixedFrame.subarray())
  }

  closeExisting() {
    console.log('[ChatSession] 🔴 CLOSEEXISTING called')
    console.log('[ChatSession] 🔴 Closing session with:', this.remotePeerId)
    
    if (this.outbound) {
      this.outbound.end()
    }
    this.stream = null
    this.outbound = null
    this.handshakeDone = false
    this.remotePeerId = null
    this.roomId = null
  }

  close() {
    const peerId = this.remotePeerId
    this.closeExisting()
    console.log('[Browser] 📪 Chat session closed')
    
    // Update UI
    if (window.ui && peerId) {
      window.ui.updatePeerStatus(peerId, 'disconnected')
      
      // If this was the current chat, update the header and input state
      if (window.ui.currentChat === peerId) {
        window.ui.updateChatHeader()
        window.ui.updateInputState()
      }
    }
  }

  isActive() {
    const active = this.stream !== null && this.outbound !== null
    console.log('[ChatSession] isActive check:', {
      hasStream: !!this.stream,
      hasOutbound: !!this.outbound,
      result: active
    })
    return active
  }

  isActiveWith(peerId) {
    const activeWith = this.isActive() && this.remotePeerId === peerId
    console.log('[ChatSession] isActiveWith check:', {
      peerId,
      currentRemotePeer: this.remotePeerId,
      isActive: this.isActive(),
      result: activeWith
    })
    return activeWith
  }
}

/* -------------------------------------------------- */
/*  UI Manager for existing HTML                      */
/* -------------------------------------------------- */

class UIManager {
  constructor() {
    this.nodeId = document.getElementById('nodeId')
    this.userList = document.getElementById('userList')
    this.chatTitle = document.getElementById('chatTitle')
    this.chatSubtitle = document.getElementById('chatSubtitle')
    this.messagesContainer = document.getElementById('messagesContainer')
    this.noChatSelected = document.getElementById('noChatSelected')
    this.messageInputArea = document.getElementById('messageInputArea')
    this.messageInput = document.getElementById('messageInput')
    this.sendButton = document.getElementById('sendButton')
    this.statusMessages = document.getElementById('statusMessages')
    
    this.activePeers = new Map()
    this.currentChat = null
    this.messages = new Map()
  }

  setNodeId(peerId) {
    this.nodeId.textContent = peerId.substring(0, 8) + '...'
    this.nodeId.title = peerId
  }

  addPeer(peerId, status = 'disconnected') {
    if (!this.activePeers.has(peerId)) {
      this.activePeers.set(peerId, { status, element: null })
      this.messages.set(peerId, [])
      this.renderPeerList()
    }
  }

  updatePeerStatus(peerId, status) {
    if (this.activePeers.has(peerId)) {
      this.activePeers.get(peerId).status = status
      this.renderPeerList()
      
      if (this.currentChat === peerId) {
        this.updateChatHeader()
        this.updateInputState()
      }
    }
  }

  renderPeerList() {
    this.userList.innerHTML = ''
    
    this.activePeers.forEach((peer, peerId) => {
      const userItem = document.createElement('div')
      userItem.className = 'user-item'
      if (this.currentChat === peerId) {
        userItem.classList.add('active')
      }
      
      const avatar = document.createElement('div')
      avatar.className = 'user-avatar'
      avatar.textContent = peerId.substring(0, 2).toUpperCase()
      
      const userInfo = document.createElement('div')
      userInfo.className = 'user-info'
      
      const userName = document.createElement('div')
      userName.className = 'user-name'
      userName.textContent = `Peer ${peerId.substring(0, 8)}...`
      
      const userStatus = document.createElement('div')
      userStatus.className = 'user-status'
      userStatus.textContent = peer.status === 'connected' ? 'Online' : 
                            peer.status === 'connecting' ? 'Connecting...' : 'Offline'
      
      const indicator = document.createElement('div')
      indicator.className = `connection-indicator ${peer.status}`
      
      userInfo.appendChild(userName)
      userInfo.appendChild(userStatus)
      
      userItem.appendChild(avatar)
      userItem.appendChild(userInfo)
      userItem.appendChild(indicator)
      
      userItem.addEventListener('click', () => this.selectChat(peerId))
      
      peer.element = userItem
      this.userList.appendChild(userItem)
    })
  }

  selectChat(peerId) {
    console.log('\n[UI] 🖱️ SELECTCHAT CALLED for peer:', peerId)
    console.log('[UI] 🖱️ Current chat session state:', {
      hasSession: !!window.chatSession,
      isActive: window.chatSession?.isActive(),
      remotePeer: window.chatSession?.remotePeerId,
      isActiveWith: window.chatSession?.isActiveWith(peerId)
    })
    
    this.currentChat = peerId
    this.renderPeerList()
    this.showChat()
    this.updateChatHeader()
    this.renderMessages()
    this.updateInputState()
    
    // Check if we already have an active session with this peer
    if (window.chatSession && window.chatSession.isActiveWith(peerId)) {
      console.log('[UI] ✅ Using existing chat session with:', peerId)
      return
    }
    
    // Don't auto-dial anymore - let the user initiate connection by sending a message
    const peer = this.activePeers.get(peerId)
    console.log('[UI] 🖱️ Peer status:', peer?.status)
    
    if (peer && peer.status === 'connected' && !window.chatSession.isActiveWith(peerId)) {
      console.log('[UI] ⏳ Peer is connected but no chat session')
      console.log('[UI] ⏳ User can send a message to establish connection')
      this.showStatus('Click send to connect and send your message', 'info')
    } else if (peer && peer.status === 'disconnected') {
      console.log('[UI] 📴 Peer is offline')
      console.log('[UI] 📴 User can still type - will try to connect when sending')
    }
  }

  showChat() {
    this.noChatSelected.style.display = 'none'
    this.messageInputArea.style.display = 'block'
  }

  updateChatHeader() {
    if (!this.currentChat) return
    
    const peer = this.activePeers.get(this.currentChat)
    const hasActiveSession = window.chatSession && window.chatSession.isActiveWith(this.currentChat)
    
    this.chatTitle.textContent = `Chat with ${this.currentChat.substring(0, 8)}...`
    
    if (peer.status === 'connected' && hasActiveSession) {
      this.chatSubtitle.textContent = 'Online - Ready to chat'
    } else if (peer.status === 'connected') {
      this.chatSubtitle.textContent = 'Online - Click send to connect'
    } else if (peer.status === 'connecting') {
      this.chatSubtitle.textContent = 'Connecting...'
    } else {
      this.chatSubtitle.textContent = 'Offline - Will try to connect when you send'
    }
  }

  updateInputState() {
    if (!this.currentChat) return
    
    const peer = this.activePeers.get(this.currentChat)
    if (!peer) return
    
    // Always allow typing - we'll handle connection when sending
    this.messageInput.disabled = false
    this.sendButton.disabled = false
    
    // Update placeholder based on connection status
    const hasActiveSession = window.chatSession && window.chatSession.isActiveWith(this.currentChat)
    
    if (peer.status === 'connected' && hasActiveSession) {
      this.messageInput.placeholder = 'Type your message...'
    } else if (peer.status === 'connected') {
      this.messageInput.placeholder = 'Type your message (will connect when sending)...'
    } else {
      this.messageInput.placeholder = 'Type your message (offline - will try to connect)...'
    }
  }

  addMessage(peerId, message, isOwn = false) {
    console.log('[UI] 📝 ADDMESSAGE called:', {
      peerId,
      isOwn,
      text: message.text,
      sender: message.sender
    })
    
    if (!this.messages.has(peerId)) {
      console.log('[UI] 📝 Creating new message array for peer:', peerId)
      this.messages.set(peerId, [])
    }
    
    this.messages.get(peerId).push({
      ...message,
      isOwn,
      timestamp: Date.now()
    })
    
    console.log('[UI] 📝 Total messages for peer:', this.messages.get(peerId).length)
    
    if (this.currentChat === peerId) {
      console.log('[UI] 📝 Rendering messages (current chat)')
      this.renderMessages()
    } else {
      console.log('[UI] 📝 Not rendering (different chat selected)')
    }
  }

  renderMessages() {
    if (!this.currentChat) return
    
    const messages = this.messages.get(this.currentChat) || []
    this.messagesContainer.innerHTML = ''
    
    messages.forEach(msg => {
      const messageDiv = document.createElement('div')
      messageDiv.className = `message ${msg.isOwn ? 'own' : 'other'}`
      
      const bubble = document.createElement('div')
      bubble.className = 'message-bubble'
      
      const text = document.createElement('div')
      text.className = 'message-text'
      text.textContent = msg.text
      
      const time = document.createElement('div')
      time.className = 'message-time'
      time.textContent = new Date(msg.timestamp).toLocaleTimeString()
      
      bubble.appendChild(text)
      bubble.appendChild(time)
      messageDiv.appendChild(bubble)
      
      this.messagesContainer.appendChild(messageDiv)
    })
    
    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
  }

  showStatus(message, type = 'info') {
    const statusDiv = document.createElement('div')
    statusDiv.className = `status-message status-${type}`
    statusDiv.textContent = message
    
    this.statusMessages.appendChild(statusDiv)
    
    setTimeout(() => {
      statusDiv.remove()
    }, 3000)
  }
}

/* -------------------------------------------------- */
/*  Main Browser Node Function                        */
/* -------------------------------------------------- */

async function runBrowserNode() {
  console.log('[Browser] 🚀 Starting P2P chat node...')

  // Initialize UI
  const ui = new UIManager()
  window.ui = ui
  ui.setNodeId('Initializing...')

  // Create the libp2p node
  const node = await createLibp2p({
    privateKey: unmarshalEd25519PrivateKey(nodePrivateKey),
    addresses: {
      listen: [
        '/webrtc',
        '/p2p-circuit'
      ]
    },
    transports: [
      circuitRelayTransport({
        discoverRelays: 2
      }),
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
      webSockets()
    ],
    streamMuxers: [
      yamux({
        enableKeepAlive: true,
        keepAliveInterval: 15000,
        idleTimeout: 300000
      })
    ],
    connectionEncrypters: [noise()],
    peerDiscovery: [
      bootstrap({
        list: BOOTSTRAP_PEERS,
        interval: 60000,
        timeout: 30000
      })
    ],
    services: {
      dht: kadDHT({
        clientMode: false,
        protocol: '/ipfs/lan/kad/1.0.0'
      }),
      identify: identify(),
      identifyPush: identifyPush(),
      ping: ping(),
      dcutr: dcutr(),
      relay: circuitRelayServer({
        advertise: false,
        reservationClearInterval: 600000,
        hopTimeout: 120000
      }),
      fetch: fetch()
    },
    connectionManager: {
      maxConnections: 100,
      minConnections: 5,
      autoDial: true,
      autoDialInterval: 10000,
      maxPeerDisconnects: 5
    }
  })

  // Create chat session manager
  const chatSession = new ChatSession(node)
  window.chatSession = chatSession

  // Add protocol negotiation logging
  const originalHandle = node.handle.bind(node)
  node.handle = function(protocol, handler, options) {
    console.log('[Browser] 🔧 Registering protocol handler for:', protocol)
    return originalHandle(protocol, async (data) => {
      console.log('[Browser] 🔧 Protocol negotiated:', protocol)
      return handler(data)
    }, options)
  }
  
  // Check what protocols the node supports
  console.log('[Browser] 📋 Registering protocols...')
  console.log('[Browser] 📋 Chat protocol:', CHAT_PROTOCOL)
  
  // Setup incoming chat stream handler
  node.handle(
    CHAT_PROTOCOL,
    async ({ stream, connection }) => {
      console.log('[Browser] 🎯 PROTOCOL HANDLER TRIGGERED for:', CHAT_PROTOCOL)
      console.log('[Browser] 🎯 Connection from:', connection.remotePeer.toString())
      await chatSession.handleIncomingStream(stream, connection)
    },
    {
      maxInboundStreams: 32,
      runOnLimitedConnection: true
    }
  )
  console.log('[Browser] ✅ Protocol handler registered for:', CHAT_PROTOCOL)

  // Event listeners
  node.addEventListener('peer:discovery', evt => {
    if (evt.detail && evt.detail.id) {
      const peerId = evt.detail.id.toString()
      console.log('[Browser] 🔍 PEER:DISCOVERY EVENT for:', peerId)
      
      // Only add known peers to UI (not bootstrap nodes)
      if (peerId === TARGET_PEER_ID) {
        console.log('[Browser] 🔍 Adding target peer to UI with disconnected status')
        ui.addPeer(peerId, 'disconnected')
      } else if (peerId.includes('12D3KooWGMYMmN1RGUYjWaSV6P3XtnBjwnosnJGNMnttfVCRnd6g')) {
        console.log('[Browser] 🔍 Ignoring bootstrap node')
      }
    }
  })

  node.addEventListener('peer:connect', (evt) => {
    if (evt.detail) {
      const peerId = evt.detail.toString()
      console.log(`\n[Browser] 🔗 PEER:CONNECT EVENT for: ${peerId}`)
      console.log('[Browser] 🔗 Current chat session:', {
        remotePeer: chatSession.remotePeerId,
        isActive: chatSession.isActive()
      })
      
      // Only update UI for peers we're tracking
      if (ui.activePeers.has(peerId)) {
        console.log('[Browser] 🔗 Updating peer status to connected')
        ui.updatePeerStatus(peerId, 'connected')
      } else {
        console.log('[Browser] 🔗 Peer not in active peers list')
      }
    }
  })

  node.addEventListener('connection:open', evt => {
    const connection = evt.detail
    if (!connection) return
    
    const { remotePeer, remoteAddr } = connection
    console.log(`\n[Browser] 🔗 CONNECTION:OPEN EVENT`)
    console.log(`[Browser] 🔗 Remote peer: ${remotePeer.toString()}`)
    console.log(`[Browser] 🔗 Direction: ${connection.stat?.direction || 'unknown'}`)
    console.log(`[Browser] 🔗 Status: ${connection.status}`)

    if (remoteAddr) {
      console.log(`[Browser] 🔗 Address: ${remoteAddr.toString()}`)
      if (remoteAddr.toString().includes('/p2p-circuit')) {
        console.log('[Browser] => Relay connection')
      } else if (remoteAddr.toString().includes('/webrtc')) {
        console.log('[Browser] => Direct WebRTC connection!')
      } else if (remoteAddr.toString().includes('/wss/')) {
        console.log('[Browser] => WebSocket Secure connection!')
      }
    }
    
    // Check if this is our target peer
    if (remotePeer.toString() === TARGET_PEER_ID) {
      console.log('[Browser] 🎯 This is our target peer!')
    }
  })

  node.addEventListener('peer:disconnect', evt => {
    if (evt.detail) {
      const peerId = evt.detail.toString()
      console.log('[Browser] 📪 Disconnected from peer:', peerId)
      
      // Only update UI for peers we're tracking
      if (ui.activePeers.has(peerId)) {
        ui.updatePeerStatus(peerId, 'disconnected')
      }
    }
  })

  // Start the node
  try {
    console.log('[Browser] 🚀 Starting libp2p node...')
    await node.start()
    console.log('[Browser] ✅ Node started successfully')
    console.log('[Browser] 📋 Supported protocols:', await node.getProtocols())
    ui.setNodeId(node.peerId.toString())
    ui.showStatus('P2P node initialized', 'connected')
  } catch (err) {
    console.error('[Browser] ❌ Failed to start node:', err)
    ui.showStatus('Failed to initialize P2P node', 'error')
    throw err
  }

  console.log('\n[Browser] 📍 Node Info:')
  console.log('[Browser] PeerID:', node.peerId.toString())
  console.log('[Browser] Target PeerID:', TARGET_PEER_ID)
  console.log('[Browser] Listening addresses:')
  node.getMultiaddrs().forEach(ma => {
    console.log('   ' + ma.toString())
  })

  // Manual bootstrap connection
  setTimeout(async () => {
    try {
      console.log('[Browser] 🔗 Attempting bootstrap connection...')
      const wssAddr = multiaddr(BOOTSTRAP_PEERS[0])
      await node.dial(wssAddr)
      console.log('[Browser] ✅ Bootstrap connection successful')
    } catch (err) {
      console.log('[Browser] ⚠️ Bootstrap connection failed:', err.message)
    }
  }, 3000)

  // Add target peer to UI
  if (TARGET_PEER_ID && TARGET_PEER_ID !== node.peerId.toString()) {
    ui.addPeer(TARGET_PEER_ID, 'disconnected')
  }

  // Setup UI event handlers
  ui.sendButton.addEventListener('click', async () => {
    const text = ui.messageInput.value.trim()
    if (!text) return
    
    // Get current chat peer
    const currentPeer = ui.currentChat
    if (!currentPeer) {
      ui.showStatus('Please select a peer to chat with', 'error')
      return
    }
    
    // Save original button text
    const originalButtonText = ui.sendButton.textContent
    
    // Check if we have an active session with this peer
    if (chatSession.isActiveWith(currentPeer)) {
      // Session exists, send message directly
      const sent = await chatSession.sendChatMessage(text)
      if (sent) {
        ui.messageInput.value = ''
        ui.messageInput.focus()
      }
    } else {
      // No active session, need to establish one first
      console.log('[UI] No active session, establishing connection...')
      ui.sendButton.textContent = 'Connecting...'
      ui.sendButton.disabled = true
      
      try {
        // Check if peer is online
        const peer = ui.activePeers.get(currentPeer)
        if (peer && peer.status === 'disconnected') {
          ui.showStatus('Attempting to connect to offline peer...', 'info')
        }
        
        // Dial the peer
        await chatSession.dialTarget(currentPeer)
        
        // Wait a bit for handshake to complete
        let retries = 0
        while (!chatSession.handshakeDone && retries < 10) {
          await new Promise(resolve => setTimeout(resolve, 200))
          retries++
        }
        
        if (chatSession.isActiveWith(currentPeer)) {
          ui.sendButton.textContent = 'Sending...'
          
          // Now send the message
          const sent = await chatSession.sendChatMessage(text)
          if (sent) {
            ui.messageInput.value = ''
            ui.messageInput.focus()
            ui.showStatus('Connected and message sent!', 'connected')
            ui.updatePeerStatus(currentPeer, 'connected')
            ui.updateChatHeader()
          } else {
            ui.showStatus('Failed to send message', 'error')
          }
        } else {
          ui.showStatus('Connection established but handshake failed', 'error')
        }
      } catch (err) {
        console.error('[UI] Failed to establish connection:', err)
        
        // Provide user-friendly error messages
        if (err.message.includes('no valid addresses')) {
          ui.showStatus('Peer is offline - message not sent', 'error')
        } else if (err.message.includes('protocol selection failed')) {
          ui.showStatus('Peer does not support chat protocol', 'error')
        } else {
          ui.showStatus('Connection failed: ' + err.message, 'error')
        }
      } finally {
        // Restore button
        ui.sendButton.textContent = originalButtonText
        ui.sendButton.disabled = false
        ui.updateInputState()
      }
    }
  })

  ui.messageInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ui.sendButton.click()
    }
  })

  // Global functions for console
  window.dialTarget = (peerId) => chatSession.dialTarget(peerId)
  window.sendMessage = (text) => chatSession.sendChatMessage(text)
  window.closeChat = () => chatSession.close()
  window.getStatus = () => ({
    active: chatSession.isActive(),
    remotePeer: chatSession.remotePeerId,
    roomId: chatSession.roomId,
    handshakeDone: chatSession.handshakeDone,
    isActiveWith: (peerId) => chatSession.isActiveWith(peerId)
  })
  window.debugChatState = () => {
    console.log('\n[DEBUG] 🔍 COMPLETE CHAT STATE:')
    console.log('[DEBUG] Chat Session:', {
      hasStream: !!chatSession.stream,
      hasOutbound: !!chatSession.outbound,
      remotePeerId: chatSession.remotePeerId,
      roomId: chatSession.roomId,
      handshakeDone: chatSession.handshakeDone,
      isActive: chatSession.isActive()
    })
    console.log('[DEBUG] UI State:', {
      currentChat: ui.currentChat,
      activePeers: Array.from(ui.activePeers.entries()).map(([id, peer]) => ({
        id,
        status: peer.status
      })),
      messageCount: Array.from(ui.messages.entries()).map(([id, msgs]) => ({
        peerId: id,
        count: msgs.length
      }))
    })
    console.log('[DEBUG] LibP2P Connections:', {
      total: node.getConnections().length,
      peers: node.getConnections().map(conn => ({
        peer: conn.remotePeer.toString(),
        status: conn.status,
        direction: conn.stat.direction
      }))
    })
  }
  
  window.checkProtocols = async () => {
    const protocols = await node.getProtocols()
    console.log('[DEBUG] 📋 Node protocols:', protocols)
    console.log('[DEBUG] 📋 Chat protocol registered:', protocols.includes(CHAT_PROTOCOL))
    
    // Check connections
    const connections = node.getConnections()
    console.log('[DEBUG] 📋 Active connections:', connections.length)
    
    for (const conn of connections) {
      console.log(`[DEBUG] 📋 Connection to ${conn.remotePeer.toString()}:`)
      console.log(`  - Status: ${conn.status}`)
      console.log(`  - Direction: ${conn.stat.direction}`)
      console.log(`  - Streams: ${conn.streams.length}`)
      
      for (const stream of conn.streams) {
        console.log(`  - Stream protocol: ${stream.protocol || 'unknown'}`)
        console.log(`    Direction: ${stream.stat.direction}`)
        console.log(`    Timeline: ${JSON.stringify(stream.stat.timeline)}`)
      }
    }
  }

  console.log('\n[Browser] 💬 Chat ready!')
  console.log('[Browser] Commands:')
  console.log('  window.dialTarget(peerId) - Connect to a specific peer')
  console.log('  window.sendMessage("text") - Send chat message')
  console.log('  window.closeChat() - Close chat session')
  console.log('  window.getStatus() - Get connection status')
  console.log('  window.debugChatState() - Show complete debug info')
  console.log('  window.checkProtocols() - Check protocols and streams')
}

// Auto-initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  runBrowserNode().catch(err => {
    console.error('[Browser] 💥 Fatal error:', err)
  })
})

export { runBrowserNode }