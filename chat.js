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
let lastLoadedMessageId = null;
let loadingMoreMessages = false;
let messagesSubscription = null;
let reactionsSubscription = null;
let onlineUsersSubscription = null;
let lastKnownUserId = null; // track for presence cleanup on signout

document.addEventListener('DOMContentLoaded', () => {
  // Supabase references for chat functionality
  const supabase = window.supabase;

  let currentUser = null;

  // Track online users count with real-time updates
  function initializeOnlineUsers() {
    if (!onlineCount) return;

    // Subscribe to online users changes
    onlineUsersSubscription = supabase
      .channel('online_users')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'online_users' },
        () => updateOnlineCount()
      )
      .subscribe();

    updateOnlineCount();
  }

  async function updateOnlineCount() {
    try {
      // Get users active in the last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('online_users')
        .select('user_id')
        .gte('last_active', fiveMinutesAgo);

      if (error) throw error;

      if (onlineCount) {
        onlineCount.textContent = (data?.length || 0).toString();
      }
    } catch (error) {
      console.error('Error updating online count:', error);
      if (onlineCount) onlineCount.textContent = '0';
    }
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

      let query = supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (lastLoadedMessageId) {
        const { data: lastMessage } = await supabase
          .from('chat_messages')
          .select('created_at')
          .eq('id', lastLoadedMessageId)
          .single();
        
        if (lastMessage) {
          query = query.lt('created_at', lastMessage.created_at);
        }
      }

      const { data: messages, error } = await query;

      if (error) throw error;

      // Remove loading indicator
      loadingDiv.remove();

      if (messages && messages.length > 0) {
        lastLoadedMessageId = messages[messages.length - 1].id;
        
        // Add messages to DOM (reverse order since we got them in desc order)
        messages.reverse().forEach(message => {
          const messageDiv = createMessageElement(message);
          chatMessages.insertBefore(messageDiv, chatMessages.firstChild);
        });
      }

    } catch (error) {
      console.error('Error loading previous messages:', error);
    } finally {
      loadingMoreMessages = false;
    }
  }

  // Add scroll handler for infinite scroll
  if (chatMessages) {
    chatMessages.addEventListener('scroll', () => {
      if (chatMessages.scrollTop === 0) loadPreviousMessages();
    });
  }

  // Enhanced message creation function
  function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.id = `message-${message.id}`;

    const time = new Date(message.created_at).toLocaleTimeString();

    messageDiv.innerHTML = `
      <div class="message-header">
        <img src="${message.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${message.user_id}`}" 
             alt="${message.username}" class="message-avatar"
             onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
        <span class="message-username">${message.username || 'Anonymous'}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-content">
        ${filterMessage(message.content)}
        <div class="message-actions">
          <button class="reaction-btn" data-message-id="${message.id}">
            <i class="far fa-smile"></i>
          </button>
          ${currentUser && message.user_id === currentUser.id ? `
            <button class="delete-msg-btn" data-message-id="${message.id}">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="message-reactions" id="reactions-${message.id}"></div>
    `;

    // Add event listeners after creating the element
    setTimeout(() => {
      const reactionBtn = messageDiv.querySelector('.reaction-btn');
      const deleteBtn = messageDiv.querySelector('.delete-msg-btn');
      
      if (reactionBtn) {
        reactionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showReactionPicker(message.id, reactionBtn);
        });
      }
      
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteMessage(message.id);
        });
      }
    }, 100);

    // Load reactions for this message immediately
    setTimeout(() => updateMessageReactions(message.id), 200);

    return messageDiv;
  }

  // Listen for Supabase auth state changes
  window.supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user || null;
    currentUser = user;
    if (user) lastKnownUserId = user.id;
    
    console.log('Chat auth state changed:', event, user?.id);
    
    if (user) {
      // Enable chat functionality
      if (chatInput) chatInput.disabled = false;
      if (sendMessage) sendMessage.disabled = false;
      if (chatLoginPrompt) chatLoginPrompt.classList.remove('visible');

      // Set up presence system using Supabase
      await updateUserPresence(user);

      // Start periodic presence updates
      setInterval(() => {
        if (currentUser) {
          updateUserPresence(currentUser);
        }
      }, 30000); // Update every 30 seconds

    } else {
      // Disable chat for logged out users
      if (chatInput) chatInput.disabled = true;
      if (sendMessage) sendMessage.disabled = true;
      if (chatLoginPrompt) chatLoginPrompt.classList.add('visible');
      
      // Clear current user
      currentUser = null;

      // Remove user from online users (use last known id since session is gone)
      const toRemoveId = lastKnownUserId;
      if (toRemoveId) {
        try { await supabase.from('online_users').delete().eq('user_id', toRemoveId); } catch (e) { console.warn('Error removing user presence:', e); }
      }
    }
  });

  // Update user presence in Supabase
  async function updateUserPresence(user) {
    try {
      // Get profile data from Supabase
      const profileData = await window.loadUserProfile(user.id);
      const username = profileData?.username || user.user_metadata?.username || user.email.split('@')[0];
      const avatarUrl = profileData?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;

      const { error } = await supabase
        .from('online_users')
        .upsert({
          user_id: user.id,
          username: username,
          avatar_url: avatarUrl,
          last_active: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating user presence:', error);
    }
  }

  // Enhanced message sending with Supabase
  async function sendChatMessage() {
    try {
      if (!chatInput || !chatInput.value.trim()) return;
      
      // Get current user from Supabase
      const { data: { session } } = await window.supabase.auth.getSession();
      const user = session?.user;
      
      if (!user) {
        showToast('Please sign in to send messages', 'warning');
        return;
      }

      const now = Date.now();
      if (now - lastMessageTime < 2000) {
        showToast('Please wait a moment before sending another message', 'warning');
        return;
      }

      const messageContent = chatInput.value.trim();
      if (messageContent.length > 500) {
        showToast(`Message too long. Maximum 500 characters allowed.`, 'warning');
        return;
      }

      // Show optimistic UI update
      const tempMessage = createOptimisticMessage(messageContent, user);
      chatMessages.appendChild(tempMessage);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Get latest profile data from Supabase
      let profileData = null;
      try {
        profileData = await window.loadUserProfile(user.id);
      } catch (error) {
        console.warn('Could not load profile data:', error);
      }
      
      const username = profileData?.username || user.user_metadata?.username || user.email.split('@')[0];
      const avatarUrl = profileData?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;

      if (sendMessage) sendMessage.disabled = true;

      // Add message with filtered content to Supabase
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          user_id: user.id,
          username: username,
          avatar_url: avatarUrl,
          content: filterMessage(messageContent)
        });

      if (error) throw error;

      lastMessageTime = now;
      
      if (chatInput) {
        chatInput.value = '';
        chatInput.focus();
      }
      
      // Remove optimistic message when real message arrives
      setTimeout(() => {
        if (tempMessage.parentNode) {
          tempMessage.remove();
        }
      }, 1000);
      
      // Update user presence
      await updateUserPresence(user);
      
    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Failed to send message. Please try again.', 'error');
    } finally {
      if (sendMessage) sendMessage.disabled = false;
    }
  }

  let lastMessageTime = 0;

  // Create optimistic message for immediate feedback using Supabase user data
  function createOptimisticMessage(content, user) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message optimistic';
    messageDiv.style.opacity = '0.7';
    
    const time = new Date().toLocaleTimeString();
    
    // Use Supabase user data for optimistic message
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;
    const username = user.user_metadata?.username || user.email.split('@')[0];

    messageDiv.innerHTML = `
      <div class="message-header">
        <img src="${avatarUrl}" alt="${username}" class="message-avatar">
        <span class="message-username">${username}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-content">
        ${filterMessage(content)}
        <i class="fas fa-clock" style="margin-left: 10px; opacity: 0.5;" title="Sending..."></i>
      </div>
    `;

    return messageDiv;
  }

  // Enhanced message deletion with Supabase
  window.deleteMessage = async function(messageId) {
    try {
      const { data: { session } } = await window.supabase.auth.getSession();
      const user = session?.user;
      
      if (!user) return;

      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', user.id);

      if (error) throw error;
      
    } catch (error) {
      console.error('Error deleting message:', error);
      showToast('Failed to delete message. Please try again.', 'error');
    }
  };

  // Initialize chat with first page of messages
  async function initializeChat() {
    try {
      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(MESSAGE_PAGE_SIZE);

      if (error) throw error;

      if (messages && messages.length > 0) {
        lastLoadedMessageId = messages[0].id;
        chatMessages.innerHTML = '';
        messages.forEach(message => {
          const messageDiv = createMessageElement(message);
          chatMessages.appendChild(messageDiv);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

      // Subscribe to new messages
      messagesSubscription = supabase
        .channel('chat_messages')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const message = payload.new;
            // Only add new messages that are after our last loaded message
            if (!lastLoadedMessageId || message.created_at > new Date().toISOString()) {
              const messageDiv = createMessageElement(message);
              chatMessages.appendChild(messageDiv);
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
          }
        )
        .on('postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const messageId = payload.old.id;
            const messageElement = document.getElementById(`message-${messageId}`);
            if (messageElement) {
              messageElement.style.animation = 'fadeOut 0.3s ease';
              setTimeout(() => messageElement.remove(), 300);
            }
          }
        )
        .subscribe();

      // Subscribe to reaction changes with more specific handling
      reactionsSubscription = supabase
        .channel('message_reactions')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'message_reactions' },
          (payload) => {
            const messageId = payload.new?.message_id;
            if (messageId) {
              updateMessageReactions(messageId);
            }
          }
        )
        .on('postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'message_reactions' },
          (payload) => {
            const messageId = payload.old?.message_id;
            if (messageId) {
              updateMessageReactions(messageId);
            }
          }
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'message_reactions' },
          (payload) => {
            const messageId = payload.new?.message_id || payload.old?.message_id;
            if (messageId) {
              updateMessageReactions(messageId);
            }
          }
        )
        .subscribe();

    } catch (error) {
      console.error('Error initializing chat:', error);
    }
  }

  // Initialize chat when component loads
  initializeChat();

  // Add global event delegation for reaction buttons
  document.addEventListener('click', (e) => {
    if (e.target.closest('.reaction-btn')) {
      const btn = e.target.closest('.reaction-btn');
      const messageId = btn.dataset.messageId;
      if (messageId) {
        e.stopPropagation();
        showReactionPicker(messageId, btn);
      }
    }
    
    if (e.target.closest('.delete-msg-btn')) {
      const btn = e.target.closest('.delete-msg-btn');
      const messageId = btn.dataset.messageId;
      if (messageId) {
        e.stopPropagation();
        deleteMessage(messageId);
      }
    }
  });

  // Ensure chat starts minimized by default
  if (chatContainer) {
    chatContainer.classList.remove('maximized');
    chatContainer.classList.add('minimized');
    minimizeBtn.innerHTML = '<i class="fas fa-expand"></i>';
  }

  // Event listeners for sending messages (null-safe)
  if (sendMessage) sendMessage.addEventListener('click', sendChatMessage);
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }

  // Toggle chat: handle both .maximized and .minimized
  function toggleChat() {
    if (!chatContainer) return;
    
    const icon = minimizeBtn.querySelector('i');
    if (chatContainer.classList.contains('maximized')) {
      // collapse
      chatContainer.classList.remove('maximized');
      chatContainer.classList.add('minimized');
      if (icon) {
        icon.classList.remove('fa-minus');
        icon.classList.add('fa-expand');
      }
    } else {
      // expand
      chatContainer.classList.add('maximized');
      chatContainer.classList.remove('minimized');
      if (icon) {
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-minus');
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
  if (chatInput) chatInput.style.paddingLeft = '40px';

  // Insert emoji button before chat input
  if (chatInput) {
    chatInput.parentNode.insertBefore(emojiPickerBtn, chatInput);
  }

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
      if (chatInput) chatInput.parentNode.appendChild(activePicker);
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
      emojiBtn.innerHTML = code;
      emojiBtn.title = label;
      emojiBtn.setAttribute('aria-label', label);
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
        emojiBtn.style.background = 'rgba(255,255,255,0.2)';
      };
      
      emojiBtn.onmouseout = () => {
        emojiBtn.style.transform = 'scale(1)';
        emojiBtn.style.background = 'rgba(255,255,255,0.05)';
      };
      
      emojiBtn.onclick = async (e) => {
        e.stopPropagation();
        const { data: { session } } = await window.supabase.auth.getSession();
        if (session?.user) {
          await addReaction(messageId, code);
        } else {
          showToast('Please sign in to react to messages', 'warning');
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
    const pickerWidth = availableReactions.length * 48 + 20;
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

  // Update addReaction function for Supabase
  async function addReaction(messageId, emoji) {
    try {
      const { data: { session } } = await window.supabase.auth.getSession();
      const user = session?.user;
      
      if (!user) {
        showToast('Please sign in to react to messages', 'warning');
        return;
      }

      // Check if reaction already exists
      const { data: existingReaction, error: checkError } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingReaction) {
        // Remove reaction if it already exists
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existingReaction.id);

        if (error) throw error;
      } else {
        // Add new reaction
        const { error } = await supabase
          .from('message_reactions')
          .insert({
            message_id: messageId,
            user_id: user.id,
            emoji: emoji,
            created_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      // Immediately update reactions display
      await updateMessageReactions(messageId);

    } catch (error) {
      console.error('Error adding reaction:', error);
      showToast('Failed to add reaction. Please try again.', 'error');
    }
  }

  // Update updateMessageReactions function for Supabase
  async function updateMessageReactions(messageId) {
    const messageElem = document.getElementById(`message-${messageId}`);
    if (!messageElem) return;

    try {
      const { data: reactions, error } = await supabase
        .from('message_reactions')
        .select(`
          id,
          emoji,
          user_id,
          created_at
        `)
        .eq('message_id', messageId);

      if (error) {
        console.error('Error fetching reactions:', error);
        return;
      }
      
      let reactionContainer = messageElem.querySelector('.message-reactions');
      if (!reactionContainer) {
        reactionContainer = document.createElement('div');
        reactionContainer.className = 'message-reactions';
        reactionContainer.id = `reactions-${messageId}`;
        messageElem.appendChild(reactionContainer);
      }

      // Group reactions by emoji
      const reactionCounts = {};
      if (reactions && reactions.length > 0) {
        reactions.forEach((reaction) => {
          if (!reactionCounts[reaction.emoji]) {
            reactionCounts[reaction.emoji] = {
              count: 0,
              users: [],
              hasMyReaction: false
            };
          }
          reactionCounts[reaction.emoji].count++;
          reactionCounts[reaction.emoji].users.push(reaction.user_id);
          
          if (currentUser && reaction.user_id === currentUser.id) {
            reactionCounts[reaction.emoji].hasMyReaction = true;
          }
        });
      }

      // Update reaction display
      reactionContainer.innerHTML = '';
      Object.entries(reactionCounts).forEach(([emoji, data]) => {
        const bubble = document.createElement('div');
        bubble.className = `reaction-bubble${data.hasMyReaction ? ' my-reaction' : ''}`;
        bubble.innerHTML = `<span class="emoji">${emoji}</span> <span class="count">${data.count}</span>`;
        bubble.title = `${data.count} reaction${data.count > 1 ? 's' : ''}`;
        bubble.onclick = async (e) => {
          e.stopPropagation();
          if (currentUser) {
            await addReaction(messageId, emoji);
          } else {
            showToast('Please sign in to react to messages', 'warning');
          }
        };
        reactionContainer.appendChild(bubble);
      });

      // Show/hide reaction container
      if (Object.keys(reactionCounts).length > 0) {
        reactionContainer.style.display = 'flex';
      } else {
        reactionContainer.style.display = 'none';
      }

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

  // Cleanup function
  window.addEventListener('beforeunload', async () => {
    if (currentUser) {
      try {
        await supabase
          .from('online_users')
          .delete()
          .eq('user_id', currentUser.id);
      } catch (error) {
        console.warn('Error cleaning up user presence:', error);
      }
    }
    
    // Unsubscribe from all channels
    if (messagesSubscription) {
      supabase.removeChannel(messagesSubscription);
    }
    if (reactionsSubscription) {
      supabase.removeChannel(reactionsSubscription);
    }
    if (onlineUsersSubscription) {
      supabase.removeChannel(onlineUsersSubscription);
    }
  });
});