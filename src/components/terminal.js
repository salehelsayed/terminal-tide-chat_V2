/**
 * Terminal UI component for displaying messages and handling commands
 */
export class Terminal {
  constructor(outputElement, inputElement, promptElement) {
    this.output = outputElement;
    this.input = inputElement;
    this.prompt = promptElement;
    this.commandHistory = [];
    this.historyIndex = -1;
    this.commands = new Map();
    
    // Set up input handling
    this.setupInputHandling();
    
    // Register default commands
    this.registerDefaultCommands();
  }
  
  /**
   * Set up input event handling
   */
  setupInputHandling() {
    this.input.addEventListener('keydown', (e) => {
      switch(e.key) {
        case 'Enter':
          this.handleInput();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navigateHistory(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.navigateHistory(1);
          break;
      }
    });
  }
  
  /**
   * Handle input submission
   */
  handleInput() {
    const input = this.input.value.trim();
    if (!input) return;
    
    // Add to history
    this.commandHistory.push(input);
    this.historyIndex = this.commandHistory.length;
    
    // Clear input
    this.input.value = '';
    
    // Display input
    this.displayMessage({
      type: 'input',
      content: input,
      timestamp: Date.now()
    });
    
    // Check if it's a command
    if (input.startsWith('/')) {
      this.handleCommand(input);
    } else {
      // Emit message event
      this.onMessage?.(input);
    }
  }
  
  /**
   * Navigate command history
   * 
   * @param {number} direction - Direction to navigate (-1 for up, 1 for down)
   */
  navigateHistory(direction) {
    if (this.commandHistory.length === 0) return;
    
    this.historyIndex += direction;
    
    if (this.historyIndex < 0) {
      this.historyIndex = 0;
    } else if (this.historyIndex >= this.commandHistory.length) {
      this.historyIndex = this.commandHistory.length;
      this.input.value = '';
      return;
    }
    
    this.input.value = this.commandHistory[this.historyIndex];
  }
  
  /**
   * Handle slash commands
   * 
   * @param {string} input - Command input
   */
  handleCommand(input) {
    const parts = input.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    const handler = this.commands.get(command);
    if (handler) {
      handler(args);
    } else {
      this.displayError(`Unknown command: ${command}. Type /help for available commands.`);
    }
  }
  
  /**
   * Register a command handler
   * 
   * @param {string} command - Command name
   * @param {Function} handler - Command handler function
   * @param {string} description - Command description
   */
  registerCommand(command, handler, description = '') {
    this.commands.set(command, handler);
    if (description) {
      this.commands.set(`${command}_desc`, description);
    }
  }
  
  /**
   * Register default commands
   */
  registerDefaultCommands() {
    // Help command
    this.registerCommand('help', () => {
      const helpText = ['Available commands:'];
      this.commands.forEach((handler, command) => {
        if (!command.endsWith('_desc')) {
          const desc = this.commands.get(`${command}_desc`) || 'No description';
          helpText.push(`  /${command} - ${desc}`);
        }
      });
      this.displaySystem(helpText.join('\n'));
    }, 'Show available commands');
    
    // Clear command
    this.registerCommand('clear', () => {
      this.clear();
    }, 'Clear the terminal');
    
    // Debug command
    this.registerCommand('debug', () => {
      this.onDebugToggle?.();
    }, 'Toggle debug panel');
    
    // Connect command
    this.registerCommand('connect', (args) => {
      if (args.length === 0) {
        this.displayError('Usage: /connect <peer-id>');
        return;
      }
      this.onConnect?.(args[0]);
    }, 'Connect to a peer by ID');
    
    // Nickname command
    this.registerCommand('nick', (args) => {
      if (args.length === 0) {
        this.displayError('Usage: /nick <nickname>');
        return;
      }
      this.onNickname?.(args.join(' '));
    }, 'Change your nickname');
    
    // Join command
    this.registerCommand('join', (args) => {
      if (args.length === 0) {
        this.displayError('Usage: /join <channel>');
        return;
      }
      this.onJoin?.(args[0]);
    }, 'Join a channel');
    
    // DM command
    this.registerCommand('dm', (args) => {
      if (args.length < 2) {
        this.displayError('Usage: /dm <peer-id> <message>');
        return;
      }
      const peerId = args[0];
      const message = args.slice(1).join(' ');
      this.onDirectMessage?.(peerId, message);
    }, 'Send a direct message');
    
    // Reset keys command
    this.registerCommand('resetkeys', () => {
      if (confirm('This will delete your current identity and generate a new one. Continue?')) {
        this.onResetKeys?.();
      }
    }, 'Reset identity keys (WARNING: This will change your Peer ID)');
    
    // Info command
    this.registerCommand('info', () => {
      this.onInfo?.();
    }, 'Show node connection info');
    
    // Chat command
    this.registerCommand('chat', (args) => {
      if (args.length === 0) {
        this.displayError('Usage: /chat <peer-id>');
        return;
      }
      this.onChat?.(args[0]);
    }, 'Start chat session with a peer');
  }
  
  /**
   * Display a message in the terminal
   * 
   * @param {object} message - Message object
   */
  displayMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message fade-in';
    
    const timestamp = new Date(message.timestamp || Date.now()).toLocaleTimeString();
    
    switch(message.type) {
      case 'input':
        messageEl.innerHTML = `
          <span class="message-timestamp">[${timestamp}]</span>
          <span class="input-prompt">&gt;</span>
          <span class="message-content">${this.escapeHtml(message.content)}</span>
        `;
        break;
        
      case 'chat':
        messageEl.innerHTML = `
          <span class="message-timestamp">[${timestamp}]</span>
          <span class="message-sender">${this.escapeHtml(message.sender)}:</span>
          <span class="message-content">${this.escapeHtml(message.content)}</span>
        `;
        break;
        
      case 'system':
        messageEl.innerHTML = `
          <span class="system-message">${this.escapeHtml(message.content)}</span>
        `;
        break;
        
      case 'error':
        messageEl.innerHTML = `
          <span class="error-message">ERROR: ${this.escapeHtml(message.content)}</span>
        `;
        break;
        
      case 'success':
        messageEl.innerHTML = `
          <span class="success-message">${this.escapeHtml(message.content)}</span>
        `;
        break;
    }
    
    this.output.appendChild(messageEl);
    this.scrollToBottom();
  }
  
  /**
   * Display system message
   * 
   * @param {string} content - Message content
   */
  displaySystem(content) {
    this.displayMessage({
      type: 'system',
      content
    });
  }
  
  /**
   * Display error message
   * 
   * @param {string} content - Error message
   */
  displayError(content) {
    this.displayMessage({
      type: 'error',
      content
    });
  }
  
  /**
   * Display success message
   * 
   * @param {string} content - Success message
   */
  displaySuccess(content) {
    this.displayMessage({
      type: 'success',
      content
    });
  }
  
  /**
   * Display chat message
   * 
   * @param {string} sender - Message sender
   * @param {string} content - Message content
   * @param {number} timestamp - Message timestamp
   */
  displayChat(sender, content, timestamp) {
    this.displayMessage({
      type: 'chat',
      sender,
      content,
      timestamp
    });
  }
  
  /**
   * Clear the terminal output
   */
  clear() {
    this.output.innerHTML = '';
    this.displaySystem('Terminal cleared');
  }
  
  /**
   * Scroll to bottom of output
   */
  scrollToBottom() {
    this.output.scrollTop = this.output.scrollHeight;
  }
  
  /**
   * Set prompt text
   * 
   * @param {string} text - Prompt text
   */
  setPrompt(text) {
    this.prompt.textContent = text;
  }
  
  /**
   * Focus input
   */
  focus() {
    this.input.focus();
  }
  
  /**
   * Escape HTML to prevent XSS
   * 
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Set message handler
   * 
   * @param {Function} handler - Message handler
   */
  setMessageHandler(handler) {
    this.onMessage = handler;
  }
  
  /**
   * Set command handlers
   * 
   * @param {object} handlers - Command handler object
   */
  setCommandHandlers(handlers) {
    Object.assign(this, handlers);
  }
}