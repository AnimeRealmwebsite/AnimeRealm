const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendMessage = document.getElementById('sendMessage');
const chatLoginPrompt = document.getElementById('chatLoginPrompt');
const onlineCount = document.getElementById('onlineCount');
const chatContainer = document.querySelector('.chat-container');
const minimizeBtn = document.getElementById('minimizeChat');
const chatHeader = document.querySelector('.chat-header');

// Add before document.addEventListener()
const BAD_WORDS = ['fuck', 'shit', 'damn', 'bastard', 'cunt', 'bitch']; // Expand this list as needed
const MESSAGE_PAGE_SIZE = 20;
let lastLoadedMessageKey = null;
let loadingMoreMessages = false;

document.addEventListener('DOMContentLoaded', () => {
  // Firebase references
  const messagesRef = firebase.database().ref('messages');
  const onlineUsersRef = firebase.database().ref('online_users');
  const connectedRef = firebase.database().ref('.info/connected');

  let currentUser = null;

  // Track online users count with real-time updates
  function initializeOnlineUsers() {
    if (!onlineCount) return;

    onlineUsersRef.on('value', (snapshot) => {
      try {
        let count = 0;
        if (snapshot && snapshot.exists()) {
          snapshot.forEach(() => {
            count++;
          });
        }
        if (onlineCount) onlineCount.textContent = count.toString();
      } catch (error) {
        console.error('Error updating online count:', error);
        if (onlineCount) onlineCount.textContent = '0';
      }
    }, (error) => {
      // Handle permission errors silently
      if (error && error.code === 'PERMISSION_DENIED') {
        if (onlineCount) onlineCount.textContent = '?';
      }
    });
  }

  // Initialize online users tracking
  initializeOnlineUsers();

  // Enhanced message filtering
  function filterMessage(text) {
    // Replace bad words with asterisks
    let filtered = text;
    BAD_WORDS.forEach(word => {
      const regex = new RegExp(word, 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    });
    return filtered;
  }

  // Load previous messages with pagination
  async function loadPreviousMessages() {
    if (loadingMoreMessages) return;
    
    try {
      loadingMoreMessages = true;
      
      // Add loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading-message';
      loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading previous messages...';
      chatMessages.insertBefore(loadingDiv, chatMessages.firstChild);

      let query = firebase.database()
        .ref('messages')
        .orderByKey()
        .limitToLast(MESSAGE_PAGE_SIZE);

      if (lastLoadedMessageKey) {
        query = query.endBefore(lastLoadedMessageKey);
      }

      const snapshot = await query.once('value');
      const messages = [];
      
      snapshot.forEach(childSnapshot => {
        messages.unshift({
          key: childSnapshot.key,
          ...childSnapshot.val()
        });
      });

      if (messages.length > 0) {
        lastLoadedMessageKey = messages[0].key;
      }

      // Remove loading indicator
      loadingDiv.remove();

      // Add messages to DOM
      messages.forEach(message => {
        const messageDiv = createMessageElement(message);
        chatMessages.insertBefore(messageDiv, chatMessages.firstChild);
      });

    } catch (error) {
      console.error('Error loading previous messages:', error);
    } finally {
      loadingMoreMessages = false;
    }
  }

  // Add scroll handler for infinite scroll
  chatMessages.addEventListener('scroll', () => {
    if (chatMessages.scrollTop === 0) {
      loadPreviousMessages();
    }
  });

  // Enhanced message creation function
  function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.id = `message-${message.key}`;

    const time = new Date(message.timestamp || Date.now()).toLocaleTimeString();
    
    // Get profile data if available
    let profileData = {};
    try {
      if (message.uid) {
        const storedProfile = localStorage.getItem(`profile_${message.uid}`);
        if (storedProfile) {
          profileData = JSON.parse(storedProfile);
        }
      }
    } catch (error) {
      console.error('Error loading profile data:', error);
    }

    const avatarUrl = profileData.avatar || message.avatar || 
                     `https://images.ai-tube.com/avatar/${message.username || 'default'}`;

    messageDiv.innerHTML = `
      <div class="message-header">
        <img src="${avatarUrl}" alt="${message.username}" class="message-avatar"
             onerror="this.src='https://images.ai-tube.com/avatar/default'">
        <span class="message-username">${message.username || 'Anonymous'}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-content">
        ${filterMessage(message.content)}
        <div class="message-actions">
          <button class="reaction-btn" onclick="showReactionPicker('${message.key}', this)">
            <i class="far fa-smile"></i>
          </button>
          ${currentUser && message.uid === currentUser.uid ? `
            <button class="delete-msg-btn" onclick="deleteMessage('${message.key}')">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="message-reactions"></div>
    `;

    return messageDiv;
  }

  // Enhanced message sending with rate limiting and length restrictions
  const MESSAGE_COOLDOWN = 2000; // 2 seconds between messages
  const MAX_MESSAGE_LENGTH = 500;
  let lastMessageTime = 0;

  async function sendChatMessage() {
    try {
      if (!chatInput || !chatInput.value.trim() || !currentUser) return;

      const now = Date.now();
      if (now - lastMessageTime < MESSAGE_COOLDOWN) {
        alert('Please wait a moment before sending another message');
        return;
      }

      const messageContent = chatInput.value.trim();
      if (messageContent.length > MAX_MESSAGE_LENGTH) {
        alert(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`);
        return;
      }

      // Get latest profile data
      let profileData = {};
      try {
        profileData = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
      } catch (error) {
        console.error('Error parsing profile data:', error);
      }

      const username = profileData.username || 
                      currentUser.displayName || 
                      (currentUser.email ? currentUser.email.split('@')[0] : 'Anonymous');
      const avatarUrl = profileData.avatar || 
                       currentUser.photoURL || 
                       `https://images.ai-tube.com/avatar/${username}`;

      if (sendMessage) sendMessage.disabled = true;

      // Add message with filtered content
      await messagesRef.push({
        uid: currentUser.uid,
        username: username,
        avatar: avatarUrl,
        content: filterMessage(messageContent),
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      lastMessageTime = now;
      
      if (chatInput) {
        chatInput.value = '';
        chatInput.focus();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      if (sendMessage) sendMessage.disabled = false;
    }
  }

  // Enhanced message deletion with real-time updates
  window.deleteMessage = async function(messageId) {
    if (!currentUser) return;

    try {
      const messageRef = firebase.database().ref(`messages/${messageId}`);
      const snapshot = await messageRef.once('value');
      const message = snapshot.val();

      if (message && message.uid === currentUser.uid) {
        await messageRef.remove();
        
        // Remove message element from DOM
        const messageElement = document.getElementById(`message-${messageId}`);
        if (messageElement) {
          messageElement.style.animation = 'fadeOut 0.3s ease';
          setTimeout(() => messageElement.remove(), 300);
        }
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message. Please try again.');
    }
  };

  // Initialize chat with first page of messages
  async function initializeChat() {
    try {
      const query = firebase.database()
        .ref('messages')
        .orderByKey()
        .limitToLast(MESSAGE_PAGE_SIZE);

      const snapshot = await query.once('value');
      const messages = [];

      snapshot.forEach(childSnapshot => {
        messages.push({
          key: childSnapshot.key,
          ...childSnapshot.val()
        });
      });

      if (messages.length > 0) {
        lastLoadedMessageKey = messages[0].key;
        chatMessages.innerHTML = '';
        messages.forEach(message => {
          const messageDiv = createMessageElement(message);
          chatMessages.appendChild(messageDiv);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } catch (error) {
      console.error('Error initializing chat:', error);
    }
  }

  // Listen for new messages
  messagesRef.on('child_added', (snapshot) => {
    const message = {
      key: snapshot.key,
      ...snapshot.val()
    };

    // Only add new messages that are after our last loaded message
    if (!lastLoadedMessageKey || message.key > lastLoadedMessageKey) {
      const messageDiv = createMessageElement(message);
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });

  // Listen for deleted messages
  messagesRef.on('child_removed', (snapshot) => {
    const messageId = snapshot.key;
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => messageElement.remove(), 300);
    }
  });

  // Initialize chat when component loads
  initializeChat();

  // Ensure chat starts minimized by default
  if (chatContainer) {
    chatContainer.classList.remove('maximized'); // Remove maximized class if present
    minimizeBtn.innerHTML = '<i class="fas fa-expand"></i>'; // Set correct initial icon
  }

  // Firebase auth state change listener with enhanced presence
  firebase.auth().onAuthStateChanged((user) => {
    currentUser = user;
    
    if (user) {
      // Enable chat functionality
      if (chatInput) chatInput.disabled = false;
      if (sendMessage) sendMessage.disabled = false;
      if (chatLoginPrompt) chatLoginPrompt.classList.remove('visible');

      // Set up presence system
      const userStatusRef = onlineUsersRef.child(user.uid);

      // When connected, update user status
      connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
          // Remove old status on disconnect
          userStatusRef.onDisconnect().remove();

          // Get profile data for username
          let profileData = {};
          try {
            profileData = JSON.parse(localStorage.getItem(`profile_${user.uid}`) || '{}');
          } catch (error) {
            console.warn('Error parsing profile data:', error);
            profileData = {};
          }

          // Set the current status with profile or Google data
          const username = profileData.username || 
                          user.displayName || 
                          (user.email ? user.email.split('@')[0] : 'Anonymous');
          const avatarUrl = profileData.avatar || 
                           user.photoURL || 
                           `https://images.ai-tube.com/avatar/${username}`;

          userStatusRef.set({
            uid: user.uid,
            username: username,
            avatar: avatarUrl,
            email: user.email,
            online: true,
            lastActive: firebase.database.ServerValue.TIMESTAMP
          });
        }
      });

    } else {
      // Disable chat for logged out users
      if (chatInput) chatInput.disabled = true;
      if (sendMessage) sendMessage.disabled = true;
      if (chatLoginPrompt) chatLoginPrompt.classList.add('visible');
    }
  });

  // Event listeners for sending messages
  sendMessage.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });

  // Update minimize button icon to show expand by default
  if (minimizeBtn) {
    //minimizeBtn.innerHTML = '<i class="fas fa-expand"></i>'; // Already set above
  }

  // Update toggle chat function
  function toggleChat() {
    if (chatContainer) {
      chatContainer.classList.toggle('maximized');
      
      const icon = minimizeBtn?.querySelector('i');
      if (icon) {
        // Toggle between minus and expand icons
        if (chatContainer.classList.contains('maximized')) {
          icon.classList.remove('fa-expand');
          icon.classList.add('fa-minus');
        } else {
          icon.classList.remove('fa-minus');
          icon.classList.add('fa-expand');
        }
      }
    }
  }

  // Keep existing event listeners but remove any default maximize state
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleChat();
    });
  }
  
  if (chatHeader) {
    chatHeader.addEventListener('click', () => {
      toggleChat();
    });
  }

  // Add emoji picker popup for message input
  const emojiPickerBtn = document.createElement('button');
  emojiPickerBtn.className = 'emoji-picker-btn';
  emojiPickerBtn.innerHTML = '<i class="far fa-smile"></i>';
  emojiPickerBtn.style.cssText = `
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 5px;
    font-size: 1.2rem;
    z-index: 2;
  `;

  // Adjust chat input padding to make room for emoji button
  chatInput.style.paddingLeft = '40px';

  // Insert emoji button before chat input
  chatInput.parentNode.insertBefore(emojiPickerBtn, chatInput);

  // Create emoji picker
  function createEmojiPicker() {
    const picker = document.createElement('div');
    picker.className = 'chat-emoji-picker';
    picker.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 0;
      background: var(--surface-color);
      border-radius: 8px;
      padding: 10px;
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 5px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      z-index: 1000;
      margin-bottom: 10px;
      max-height: 200px;
      overflow-y: auto;
      overflow-x: hidden;
      width: 300px;
      border: 1px solid var(--border-color);
    `;

    // Common emojis
    const emojis = [
      '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊',
      '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘',
      '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪',
      '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒',
      '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖',
      '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡',
      '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰',
      '👋', '🤚', '✋', '🖐️', '👌', '🤌', '🤏', '✌️',
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤',
      '👍', '👎', '👏', '🙌', '🤝', '🤗', '🫂', '💪'
    ];

    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.textContent = emoji;
      btn.style.cssText = `
        background: none;
        border: none;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 5px;
        border-radius: 4px;
        transition: background-color 0.3s ease;
      `;
      btn.onmouseover = () => btn.style.backgroundColor = 'rgba(255,255,255,0.1)';
      btn.onmouseout = () => btn.style.backgroundColor = 'transparent';
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!chatInput) return;
        
        const cursorPos = chatInput.selectionStart || chatInput.value.length;
        const textBefore = chatInput.value.substring(0, cursorPos);
        const textAfter = chatInput.value.substring(cursorPos);
        chatInput.value = textBefore + emoji + textAfter;
        chatInput.focus();
        
        try {
          chatInput.selectionStart = cursorPos + emoji.length;
          chatInput.selectionEnd = cursorPos + emoji.length;
        } catch (err) {
          console.warn('Error setting selection range:', err);
        }
        
        if (picker.parentNode) {
          picker.remove();
        }
        activePicker = null;
      };
      picker.appendChild(btn);
    });

    return picker;
  }

  // Toggle emoji picker
  let activePicker = null;
  emojiPickerBtn.onclick = (e) => {
    e.stopPropagation();
    if (activePicker) {
      activePicker.remove();
      activePicker = null;
    } else {
      activePicker = createEmojiPicker();
      chatInput.parentNode.appendChild(activePicker);
    }
  };

  // Close picker when clicking outside
  document.addEventListener('click', (e) => {
    if (activePicker && !activePicker.contains(e.target) && e.target !== emojiPickerBtn) {
      activePicker.remove();
      activePicker = null;
    }
  });

  // Update the available reactions array with emoji codes
  const availableReactions = [
    {code: '👍', label: 'thumbs up'},
    {code: '❤️', label: 'heart'},
    {code: '😄', label: 'smile'},
    {code: '😮', label: 'wow'},
    {code: '😢', label: 'sad'},
    {code: '😡', label: 'angry'},
    {code: '🎉', label: 'party'},
    {code: '👏', label: 'clap'},
  ];

  // Update showReactionPicker function
  window.showReactionPicker = function(messageId, button) {
    // Remove any existing pickers first
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.cssText = `
      position: fixed; 
      background: var(--surface-color);
      padding: 10px;
      border-radius: 30px;
      display: flex;
      gap: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      z-index: 2000;
      border: 1px solid var(--border-color);
    `;
    
    availableReactions.forEach(({code, label}) => {
      const emojiBtn = document.createElement('button');
      emojiBtn.className = 'emoji-btn';
      emojiBtn.innerHTML = code; // Use innerHTML to properly render emoji
      emojiBtn.title = label; // Add tooltip
      emojiBtn.setAttribute('aria-label', label); // Add accessibility label
      emojiBtn.style.cssText = `
        background: rgba(255,255,255,0.05);
        border: none;
        padding: 8px;
        cursor: pointer;
        font-size: 18px;
        border-radius: 50%;
        transition: all 0.2s ease;
        height: 40px;
        width: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Symbol", sans-serif;
      `;
      
      emojiBtn.onmouseover = () => {
        emojiBtn.style.transform = 'scale(1.2)';
        emojiBtn.style.background = 'rgba(255,255,255,0.1)';
      };
      
      emojiBtn.onmouseout = () => {
        emojiBtn.style.transform = 'scale(1)';
        emojiBtn.style.background = 'rgba(255,255,255,0.05)';
      };
      
      emojiBtn.onclick = async (e) => {
        e.stopPropagation();
        if (firebase.auth().currentUser) {
          await addReaction(messageId, code);
        } else {
          alert('Please sign in to react to messages');
        }
        picker.remove();
      };
      
      picker.appendChild(emojiBtn);
    });

    // Position picker relative to button
    const rect = button.getBoundingClientRect();
    picker.style.position = 'fixed';
    
    // Position above or below based on space available
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    
    if (spaceAbove > spaceBelow) {
      picker.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
    } else {
      picker.style.top = (rect.bottom + 10) + 'px';
    }
    
    // Center horizontally relative to button
    const pickerWidth = availableReactions.length * 48 + 20; // Estimate width
    picker.style.left = Math.max(10, Math.min(
      window.innerWidth - pickerWidth - 10,
      rect.left - (pickerWidth / 2) + (rect.width / 2)
    )) + 'px';
    
    document.body.appendChild(picker);

    // Close picker when clicking outside
    function closePicker(e) {
      if (!picker.contains(e.target) && e.target !== button) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    }
    
    setTimeout(() => document.addEventListener('click', closePicker), 100);
  };

  // Update addReaction function
  async function addReaction(messageId, emoji) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
      const messageRef = firebase.database().ref(`messages/${messageId}/reactions`);
      const reactionId = `${emoji}_${user.uid}`;
      const reactionRef = messageRef.child(reactionId);
      
      // Get user profile data
      let profileData = {};
      try {
        const storedProfile = localStorage.getItem(`profile_${user.uid}`);
        if (storedProfile) {
          profileData = JSON.parse(storedProfile);
        }
      } catch (error) {
        console.warn('Error loading profile for reaction:', error);
      }

      const snapshot = await reactionRef.once('value');
      
      if (snapshot.exists()) {
        // Remove reaction if it already exists
        await reactionRef.remove();
      } else {
        // Add new reaction
        await reactionRef.set({
          emoji: emoji,
          userId: user.uid,
          username: profileData.username || user.displayName || user.email.split('@')[0],
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
      }

      // Update message UI
      updateMessageReactions(messageId);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }

  // Update updateMessageReactions function to properly render emojis
  async function updateMessageReactions(messageId) {
    const messageElem = document.getElementById(`message-${messageId}`);
    if (!messageElem) return;

    try {
      const reactionsRef = firebase.database().ref(`messages/${messageId}/reactions`);
      const snapshot = await reactionsRef.once('value');
      
      let reactionContainer = messageElem.querySelector('.message-reactions');
      if (!reactionContainer) {
        reactionContainer = document.createElement('div');
        reactionContainer.className = 'message-reactions';
        messageElem.appendChild(reactionContainer);
      }

      // Group reactions by emoji
      const reactionCounts = {};
      snapshot.forEach((reaction) => {
        const data = reaction.val();
        if (!reactionCounts[data.emoji]) {
          reactionCounts[data.emoji] = {
            count: 0,
            users: [],
            hasMyReaction: false
          };
        }
        reactionCounts[data.emoji].count++;
        reactionCounts[data.emoji].users.push(data.username);
        
        if (firebase.auth().currentUser && data.userId === firebase.auth().currentUser.uid) {
          reactionCounts[data.emoji].hasMyReaction = true;
        }
      });

      // Update reaction display
      reactionContainer.innerHTML = '';
      Object.entries(reactionCounts).forEach(([emoji, data]) => {
        const bubble = document.createElement('div');
        bubble.className = `reaction-bubble${data.hasMyReaction ? ' my-reaction' : ''}`;
        bubble.innerHTML = `<span class="emoji">${emoji}</span> <span class="count">${data.count}</span>`;
        bubble.title = `Reacted by: ${data.users.join(', ')}`;
        bubble.onclick = (e) => {
          e.stopPropagation();
          if (firebase.auth().currentUser) {
            addReaction(messageId, emoji);
          } else {
            alert('Please sign in to react to messages');
          }
        };
        reactionContainer.appendChild(bubble);
      });

    } catch (error) {
      console.error('Error updating reactions:', error);
    }
  }

  // Update reaction bubble styles to ensure proper emoji display
  const reactionStyles = document.createElement('style');
  reactionStyles.textContent = `
    .reaction-bubble {
      display: inline-flex;
      align-items: center;
      background: rgba(var(--primary-color-rgb), 0.1);
      border: 1px solid rgba(var(--primary-color-rgb), 0.2);
      padding: 4px 8px;
      border-radius: 20px;
      font-size: 14px;
      margin: 2px;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
      font-family: "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Symbol", sans-serif;
    }

    .reaction-bubble:hover {
      background: rgba(var(--primary-color-rgb), 0.2);
      transform: scale(1.05);
    }

    .reaction-bubble.my-reaction {
      background: rgba(var(--primary-color-rgb), 0.3);
      border-color: var(--primary-color);
    }

    .message-reactions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
      padding-left: 40px;
    }

    .emoji-btn {
      font-family: "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Symbol", sans-serif;
    }

    .emoji-btn:hover {
      transform: scale(1.2);
      background: rgba(255,255,255,0.2);
    }
  `;

  document.head.appendChild(reactionStyles);

  // Add reaction listener to database
  firebase.database().ref('messages').on('child_changed', (snapshot) => {
    const messageId = snapshot.key;
    const messageData = snapshot.val();
    
    if (messageData.reactions) {
      updateMessageReactions(messageId);
    }
  });

  // Cleanup function
  window.addEventListener('unload', () => {
    if (currentUser) {
      const userRef = onlineUsersRef.child(currentUser.uid);
      userRef.remove();
    }
  });
});