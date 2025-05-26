document.addEventListener('DOMContentLoaded', () => {
  const profileModal = document.getElementById('profileModal');
  const editProfileLinks = document.querySelectorAll('[data-toggle="modal"][data-target="#profileModal"]');
  const closeBtn = profileModal.querySelector('.close');
  const avatarPreview = document.getElementById('avatarPreview');
  const uploadAvatarBtn = document.getElementById('uploadAvatar');
  const generateAvatarBtn = document.getElementById('generateAvatar');
  const avatarInput = document.getElementById('avatarInput');
  const profileForm = document.getElementById('profileForm');
  const usernameInput = document.getElementById('usernameInput');
  const genderSelect = document.getElementById('genderSelect');
  const bioInput = document.getElementById('bioInput');
  const cancelProfileBtn = document.querySelector('.cancel-profile-btn');
  let originalAvatar = null; // Store original avatar URL when modal opens

  // Enhanced modal handling
  function showProfileModal() {
    profileModal.classList.add('show');
    // Store original avatar when modal opens
    const user = firebase.auth().currentUser;
    if (user) {
      try {
        const profileData = JSON.parse(localStorage.getItem(`profile_${user.uid}`) || '{}');
        originalAvatar = profileData.avatar || null;
      } catch (error) {
        console.error('Error loading original avatar:', error);
      }
    }
    loadUserProfile();
  }

  function hideProfileModal() {
    // Revert any unsaved changes
    if (originalAvatar) {
      document.querySelectorAll('.profile-icon, .user-avatar').forEach(el => {
        if (el) el.src = originalAvatar;
      });
    }
    
    // Clear temporary avatar and original avatar reference
    window.tempGeneratedAvatar = null;
    originalAvatar = null;
    
    // Hide modal
    profileModal.classList.remove('show');
  }

  // Event listeners for modal
  editProfileLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showProfileModal();
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideProfileModal();
    });
  }

  if (cancelProfileBtn) {
    cancelProfileBtn.addEventListener('click', () => {
      // Revert to original avatar
      if (originalAvatar) {
        const avatarPreview = document.getElementById('avatarPreview');
        if (avatarPreview) {
          avatarPreview.src = originalAvatar;
        }
        // Update all avatar instances back to original
        document.querySelectorAll('.profile-icon, .user-avatar').forEach(el => {
          if (el) el.src = originalAvatar;
        });
      }
      
      // Clear temporary avatar
      window.tempGeneratedAvatar = null;
      
      // Close modal
      hideProfileModal();
    });
  }

  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) {
      hideProfileModal();
    }
  });

  // Add rate limiting functionality for avatar generation
  function checkGenerationLimit() {
    const user = firebase.auth().currentUser;
    if (!user) return false;

    const today = new Date().toDateString();
    const limitKey = `avatar_gen_limit_${user.uid}_${today}`;

    let usage = null;
    try {
      usage = JSON.parse(localStorage.getItem(limitKey));
    } catch (e) {
      usage = null;
    }

    if (!usage || usage.date !== today) {
      usage = {
        count: 0,
        date: today
      };
    }

    if (usage.count >= 5) {
      alert('Daily avatar generation limit reached (5/5). Please try again tomorrow.');
      return false;
    }

    usage.count++;
    localStorage.setItem(limitKey, JSON.stringify(usage));

    console.log(`${5 - usage.count} generations remaining today`);
    return true;
  }

  // Add AniList character fetch functionality
  async function fetchRandomAnimeCharacter() {
    const query = `
      query {
        Page(page: ${Math.floor(Math.random() * 50)}, perPage: 1) {
          characters(sort: FAVOURITES_DESC) {
            nodes {
              id
              name {
                full
              }
              gender
              image {
                large
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: query
        })
      });

      const data = await response.json();
      return data.data.Page.characters.nodes[0];
    } catch (error) {
      console.error('Error fetching anime character:', error);
      return null;
    }
  }

  // Rate-limited avatar generation with gender consideration
  async function generateNewAvatar() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    const selectedGender = genderSelect.value;
    if (!selectedGender) {
      alert('Please select a gender before generating an avatar');
      return;
    }

    // Check rate limit
    if (!checkGenerationLimit()) return;

    try {
      generateAvatarBtn.disabled = true;
      generateAvatarBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      // Fetch random anime character with retry logic
      let character = null;
      let attempts = 0;
      while (!character && attempts < 3) {
        character = await fetchRandomAnimeCharacter();
        // Check if character gender matches selected gender (if available)
        if (character && character.gender) {
          const charGender = character.gender.toLowerCase();
          if (selectedGender === 'male' && charGender !== 'male') {
            character = null;
          } else if (selectedGender === 'female' && charGender !== 'female') {
            character = null;
          }
        }
        attempts++;
      }

      if (!character) {
        throw new Error('Failed to find matching character after 3 attempts');
      }

      // Use character image as avatar
      const imageUrl = character.image.large;
      
      // Update preview
      if (avatarPreview) {
        avatarPreview.src = imageUrl;
        // Store as temporary until saved
        window.tempGeneratedAvatar = imageUrl;
      }

      // Add character name as suggested username if username field is empty
      const usernameInput = document.getElementById('usernameInput');
      if (usernameInput && (!usernameInput.value || usernameInput.value.trim() === '')) {
        // Convert character name to valid username format
        const suggestedUsername = character.name.full
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 20); // Limit length
        usernameInput.value = suggestedUsername;
      }

    } catch (error) {
      console.error('Avatar generation error:', error);
      // Fallback to original avatar generation if AniList fails
      const fallbackUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}-${Date.now()}`;
      if (avatarPreview) {
        avatarPreview.src = fallbackUrl;
        window.tempGeneratedAvatar = fallbackUrl;
      }
    } finally {
      generateAvatarBtn.disabled = false;
      generateAvatarBtn.innerHTML = '<i class="fas fa-random"></i>';
    }
  }

  // Enhanced avatar upload handler with proper validation and processing
  async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const user = firebase.auth().currentUser;
    if (!user) {
      alert('Please sign in first');
      return;
    }

    // Improved file validation
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    const maxDimension = 1000; // Max 1000x1000 pixels

    if (!validTypes.includes(file.type)) {
      alert('Please upload a JPEG, PNG, or WebP image.');
      return;
    }

    if (file.size > maxSize) {
      alert('Image must be smaller than 5MB.');
      return;
    }

    try {
      uploadAvatarBtn.disabled = true;
      uploadAvatarBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      const processedImage = await processImage(file, maxDimension);
      
      const reader = new FileReader();
      reader.readAsDataURL(processedImage);
      
      reader.onload = async () => {
        const base64Image = reader.result;
        
        // Only update preview and store temporary value
        if (avatarPreview) {
          avatarPreview.src = base64Image;
        }
        window.tempGeneratedAvatar = base64Image;
      };

    } catch (error) {
      console.error('Avatar upload error:', error);
      alert('Failed to process image. Please try another image.');
      
      // Revert to original avatar on error
      if (avatarPreview && originalAvatar) {
        avatarPreview.src = originalAvatar;
      }
    } finally {
      uploadAvatarBtn.disabled = false;
      uploadAvatarBtn.innerHTML = '<i class="fas fa-upload"></i>';
    }
  }

  // Helper function to process and optimize images
  async function processImage(file, maxDimension) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width;
          let height = img.height;
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          // Create canvas for resizing
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          // Draw and optimize image
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to blob with quality optimization
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to process image'));
            }
          }, 'image/jpeg', 0.8);
          
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // Load user profile data from localStorage with error handling
  function loadUserProfile() {
    const user = firebase.auth().currentUser;
    if (!user) {
      console.error('No user logged in');
      return;
    }

    try {
      // Get user data from localStorage
      let userProfile = {};
      try {
        const profileData = localStorage.getItem(`profile_${user.uid}`);
        if (profileData) {
          userProfile = JSON.parse(profileData);
        } else {
          // Initialize with default data if no profile exists
          userProfile = {
            username: user.displayName || user.email.split('@')[0],
            email: user.email,
            gender: '',
            bio: '',
            createdAt: new Date().toISOString()
          };
          localStorage.setItem(`profile_${user.uid}`, JSON.stringify(userProfile));
        }
      } catch (error) {
        console.error('Error parsing user profile:', error);
        userProfile = {};
      }
      
      // Update form fields safely
      if (usernameInput) usernameInput.value = userProfile.username || '';
      if (genderSelect) genderSelect.value = userProfile.gender || '';
      if (bioInput) bioInput.value = userProfile.bio || '';

      // Update avatar preview
      if (userProfile.avatar && avatarPreview) {
        avatarPreview.src = userProfile.avatar;
        // Update all avatar instances
        document.querySelectorAll('.profile-icon, .user-avatar').forEach(el => {
          if (el) el.src = userProfile.avatar;
        });
      } else if (avatarPreview) {
        const defaultAvatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`;
        avatarPreview.src = defaultAvatarUrl;
        
        // Save this default avatar
        userProfile.avatar = defaultAvatarUrl;
        localStorage.setItem(`profile_${user.uid}`, JSON.stringify(userProfile));
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
    }
  }

  // Enhanced profile update handler with better error checking
  async function handleProfileUpdate(e) {
    e.preventDefault();
    
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        alert('Please sign in first');
        return;
      }

      const username = document.getElementById('usernameInput')?.value?.trim() || '';
      const gender = document.getElementById('genderSelect')?.value || '';
      const bio = document.getElementById('bioInput')?.value?.trim() || '';

      // Input validation
      if (!username) {
        alert('Username is required');
        return;
      }

      if (username.length < 3 || username.length > 20) {
        alert('Username must be between 3 and 20 characters');
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(username)) {
        alert('Username can only contain letters, numbers, and underscores');
        return;
      }

      if (bio && bio.length > 200) {
        alert('Bio must be 200 characters or less');
        return;
      }

      // Show loading state
      const saveButton = document.querySelector('.save-profile-btn');
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      }
      
      // Get existing data
      let existingData = {};
      try {
        const storedData = localStorage.getItem(`profile_${user.uid}`);
        if (storedData) {
          existingData = JSON.parse(storedData);
        }
      } catch (parseError) {
        console.warn('Error parsing existing profile data, starting fresh', parseError);
      }
      
      // Use the temporary generated avatar if it exists, otherwise keep existing
      const newAvatarUrl = window.tempGeneratedAvatar || existingData.avatar;
      
      // Merge existing data with new data
      const mergedData = { 
        ...existingData, 
        username, 
        gender, 
        bio, 
        avatar: newAvatarUrl,
        updatedAt: new Date().toISOString(),
        email: user.email || existingData.email
      };
      
      localStorage.setItem(`profile_${user.uid}`, JSON.stringify(mergedData));

      // Update all UI elements with the new data
      document.querySelectorAll('.user-display-name').forEach(el => {
        if (el) el.textContent = username;
      });

      document.querySelectorAll('.profile-icon, .user-avatar').forEach(el => {
        if (el) el.src = newAvatarUrl;
      });

      // Clear temporary avatar
      window.tempGeneratedAvatar = null;

      const profileModal = document.getElementById('profileModal');
      if (profileModal) profileModal.classList.remove('show');
      
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Profile update error:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      const saveButton = document.querySelector('.save-profile-btn');
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="fas fa-save"></i> Save Profile';
      }
    }
  }

  // Event listeners
  uploadAvatarBtn.addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', handleAvatarUpload);
  if (generateAvatarBtn) {
    generateAvatarBtn.addEventListener('click', generateNewAvatar);
  }
  profileForm.addEventListener('submit', handleProfileUpdate);

  if (genderSelect) {
    genderSelect.addEventListener('change', function() {
      if (generateAvatarBtn) {
        generateAvatarBtn.disabled = !this.value;
      }
    });
  }

  // Updated signOut function
  window.signOut = function() {
    firebase.auth().signOut().then(() => {
      window.location.reload();
    }).catch((error) => {
      console.error('Sign out error', error);
    });
  };

  // Initialize online users count functionality
  function initializeOnlineUsersCount() {
    const onlineCountElement = document.getElementById('onlineCount');
    if (!onlineCountElement) return;

    const onlineUsersRef = firebase.database().ref('online_users');
    
    onlineUsersRef.on('value', (snapshot) => {
      let count = 0;
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      snapshot.forEach((childSnapshot) => {
        const userData = childSnapshot.val();
        if (userData.lastActive > fiveMinutesAgo) {
          count++;
        }
      });
      
      onlineCountElement.textContent = count;
    });

    // Update current user's online status
    const user = firebase.auth().currentUser;
    if (user) {
      const userStatusRef = onlineUsersRef.child(user.uid);
      
      // Update status on connection state change
      firebase.database().ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() === true) {
          userStatusRef.onDisconnect().remove();
          userStatusRef.set({
            uid: user.uid,
            lastActive: firebase.database.ServerValue.TIMESTAMP,
            status: 'online'
          });
        }
      });

      // Update lastActive periodically
      setInterval(() => {
        userStatusRef.update({
          lastActive: firebase.database.ServerValue.TIMESTAMP
        });
      }, 30000);
    }
  }

  initializeOnlineUsersCount();
});