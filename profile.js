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
  let originalAvatar = null;
  let profileOutsideHandler = null;

  // Listen for profile loaded events
  window.addEventListener('profileLoaded', async (event) => {
    if (event.detail?.user) {
      await loadUserProfile();
    }
  });

  // Enhanced modal handling
  function showProfileModal() {
    profileModal.classList.add('show');
    const user = window.getCurrentUser();
    if (user) {
      loadUserProfile();
    } else {
      // If no current user, try to get from Supabase directly
      window.getSupabaseUser().then(user => {
        if (user) {
          loadUserProfile();
        }
      });
    }
    if (!profileOutsideHandler) {
      profileOutsideHandler = (e) => { if (e.target === profileModal) hideProfileModal(); };
      profileModal.addEventListener('click', profileOutsideHandler);
    }
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
    if (profileOutsideHandler) {
      profileModal.removeEventListener('click', profileOutsideHandler);
      profileOutsideHandler = null;
    }
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

  // Add rate limiting functionality for avatar generation
  function checkGenerationLimit() {
    const user = window.getCurrentUser();
    if (!user) return false;

    const today = new Date().toDateString();
    const limitKey = `avatar_gen_limit_${user.id}_${today}`;

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
      showToast('Daily avatar generation limit reached (5/5). Please try again tomorrow.', 'warning');
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
      if (!response.ok) {
        const t = await response.text().catch(() => '');
        throw new Error(`AniList character HTTP ${response.status} ${response.statusText} ${t.slice(0,120)}`);
      }
      const txt = await response.text();
      let data;
      try { data = JSON.parse(txt); } 
      catch (e) { throw new Error(`AniList character JSON parse failed: ${e.message}`); }
      return data.data?.Page?.characters?.nodes?.[0] || null;
    } catch (error) {
      console.error('Error fetching anime character:', error);
      return null;
    }
  }

  // Rate-limited avatar generation with gender consideration
  async function generateNewAvatar() {
    const user = window.getCurrentUser();
    if (!user) return;

    const selectedGender = genderSelect.value;
    if (!selectedGender) {
      showToast('Please select a gender before generating an avatar', 'warning');
      return;
    }

    // Check rate limit
    if (!checkGenerationLimit()) return;

    try {
      generateAvatarBtn.disabled = true;
      generateAvatarBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      // Use high-quality anime character API based on gender
      let avatarUrl;
      const seed = Math.random().toString(36).substring(7);

      if (selectedGender === 'male') {
        // Use ThisPersonDoesNotExist anime style for males
        avatarUrl = `https://api.waifu.pics/sfw/waifu`;

        // Fallback to anime boy API if available
        try {
          const response = await fetch('https://api.jikan.moe/v4/characters', {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          });
          if (!response.ok) {
            const t = await response.text().catch(() => '');
            throw new Error(`Jikan HTTP ${response.status} ${response.statusText} ${t.slice(0,120)}`);
          }
          const txt = await response.text();
          let data;
          try { data = JSON.parse(txt); } catch (e) { throw new Error(`Jikan JSON parse failed: ${e.message}`); }
          const maleCharacters = data.data?.filter(char =>
            char.name && char.images?.jpg?.image_url
          );

          if (maleCharacters && maleCharacters.length > 0) {
            const randomChar = maleCharacters[Math.floor(Math.random() * maleCharacters.length)];
            avatarUrl = randomChar.images.jpg.image_url;
          }
        } catch (apiError) {
          console.warn('Jikan API error, using fallback:', apiError);
          avatarUrl = `https://picsum.photos/400/400?random=${seed}`;
        }
      } else if (selectedGender === 'female') {
        // Use waifu.pics API for high-quality anime girl images
        try {
          const response = await fetch('https://api.waifu.pics/sfw/waifu');
          if (!response.ok) {
            const t = await response.text().catch(() => '');
            throw new Error(`Waifu.pics HTTP ${response.status} ${response.statusText} ${t.slice(0,120)}`);
          }
          const txt = await response.text();
          let data;
          try { data = JSON.parse(txt); } catch (e) { throw new Error(`Waifu.pics JSON parse failed: ${e.message}`); }
          avatarUrl = data.url;
        } catch (apiError) {
          console.warn('Waifu API error, using fallback:', apiError);
          avatarUrl = `https://api.dicebear.com/7.x/anime/svg?seed=${seed}&gender=female`;
        }
      } else {
        // For 'other' gender, use a neutral anime style
        avatarUrl = `https://api.dicebear.com/7.x/anime/svg?seed=${seed}`;
      }

      // Update preview
      if (avatarPreview) {
        avatarPreview.src = avatarUrl;
        // Store as temporary until saved
        window.tempGeneratedAvatar = avatarUrl;
      }

      // Generate username suggestion based on gender and avatar
      const usernameInput = document.getElementById('usernameInput');
      if (usernameInput && (!usernameInput.value || usernameInput.value.trim() === '')) {
        const genderPrefixes = {
          male: ['anime_guy', 'otaku_boy', 'manga_hero', 'anime_kun'],
          female: ['anime_girl', 'waifu', 'manga_chan', 'otaku_girl'],
          other: ['anime_fan', 'manga_lover', 'otaku']
        };

        const prefixes = genderPrefixes[selectedGender] || genderPrefixes.other;
        const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const randomNumber = Math.floor(Math.random() * 9999);

        usernameInput.value = `${randomPrefix}_${randomNumber}`;
      }

    } catch (error) {
      console.error('Avatar generation error:', error);
      // Enhanced fallback system
      const fallbackSeed = user.id + '-' + Date.now();
      let fallbackUrl;

      if (selectedGender === 'male') {
        fallbackUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${fallbackSeed}&gender=male`;
      } else if (selectedGender === 'female') {
        fallbackUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${fallbackSeed}&gender=female`;
      } else {
        fallbackUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${fallbackSeed}`;
      }

      if (avatarPreview) {
        avatarPreview.src = fallbackUrl;
        window.tempGeneratedAvatar = fallbackUrl;
      }

      showToast('Using fallback avatar generator', 'warning');
    } finally {
      generateAvatarBtn.disabled = false;
      generateAvatarBtn.innerHTML = '<i class="fas fa-random"></i>';
    }
  }

  // Enhanced avatar upload handler with proper validation and processing
  async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const user = window.getCurrentUser();
    if (!user) {
      showToast('Please sign in first', 'warning');
      return;
    }

    // Improved file validation
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    const maxDimension = 1000; // Max 1000x1000 pixels

    if (!validTypes.includes(file.type)) {
      showToast('Please upload a JPEG, PNG, or WebP image.', 'warning');
      return;
    }

    if (file.size > maxSize) {
      showToast('Image must be smaller than 5MB.', 'warning');
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
      showToast('Failed to process image. Please try another image.', 'error');

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

  // Load user profile data from Supabase
  async function loadUserProfile() {
    const user = window.getCurrentUser();
    if (!user) {
      // Try to get user from Supabase session
      const supabaseUser = await window.getSupabaseUser();
      if (!supabaseUser) {
        console.error('No user logged in');
        return;
      }
    }

    const currentUser = user || await window.getSupabaseUser();

    try {
      // Get user data from Supabase with retry mechanism
      let profileData = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries && !profileData) {
        try {
          profileData = await window.loadUserProfile(currentUser.id);
          if (profileData) break;
        } catch (error) {
          console.warn(`Profile load attempt ${retryCount + 1} failed:`, error);
        }
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }

      // Update form fields safely with fallback values
      if (usernameInput) {
        usernameInput.value = profileData?.username || currentUser.user_metadata?.username || currentUser.email.split('@')[0];
      }
      if (genderSelect) {
        genderSelect.value = profileData?.gender || '';
      }
      if (bioInput) {
        bioInput.value = profileData?.bio || '';
      }

      // Update avatar preview with fallback handling
      const avatarUrl = profileData?.avatar_url || currentUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`;
      originalAvatar = avatarUrl;

      if (avatarPreview) {
        avatarPreview.src = avatarUrl;
        avatarPreview.onerror = function() {
          this.onerror = null;
          this.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`;
        };

        // Update all avatar instances
        document.querySelectorAll('.profile-icon, .user-avatar').forEach(el => {
          if (el) {
            el.src = avatarUrl;
            el.onerror = function() {
              this.onerror = null;
              this.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`;
            };
          }
        });
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
      // Show user-friendly error message
      showToast('Failed to load profile data. Some information may be missing.', 'warning');
    }
  }

  // Enhanced profile update handler with Supabase integration
  async function handleProfileUpdate(e) {
    e.preventDefault();

    try {
      const user = window.getCurrentUser();
      if (!user) {
        showToast('Please sign in first', 'warning');
        return;
      }

      const username = document.getElementById('usernameInput')?.value?.trim() || '';
      const gender = document.getElementById('genderSelect')?.value || '';
      const bio = document.getElementById('bioInput')?.value?.trim() || '';

      // Input validation
      if (!username) {
        showToast('Username is required', 'warning');
        return;
      }

      if (username.length < 3 || username.length > 20) {
        showToast('Username must be between 3 and 20 characters', 'warning');
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(username)) {
        showToast('Username can only contain letters, numbers, and underscores', 'warning');
        return;
      }

      if (bio && bio.length > 200) {
        showToast('Bio must be 200 characters or less', 'warning');
        return;
      }

      // Show loading state
      showLoadingOverlay('Saving your profile...');

      // Use the temporary generated avatar if it exists, otherwise keep existing
      const newAvatarUrl = window.tempGeneratedAvatar || originalAvatar;

      // Update profile in Supabase
      const updates = {
        username,
        gender,
        bio,
        avatar_url: newAvatarUrl,
        updated_at: new Date().toISOString()
      };

      await window.updateUserProfile(user.id, updates);

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

      // Show success feedback
      showToast('Profile updated successfully!', 'success');
      showAutoSaveIndicator();

    } catch (error) {
      console.error('Profile update error:', error);
      showToast('Failed to update profile. Please try again.', 'error');
    } finally {
      hideLoadingOverlay();
      // Clear temporary avatar
      window.tempGeneratedAvatar = null;
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

  // Initialize auto-save when profile modal opens
  initializeAutoSave();

  // Add periodic profile refresh for better reliability
  setInterval(async () => {
    const user = window.getCurrentUser();
    if (user && document.getElementById('profileModal').classList.contains('show')) {
      try {
        await loadUserProfile();
      } catch (error) {
        console.warn('Periodic profile refresh failed:', error);
      }
    }
  }, 30000); // Refresh every 30 seconds if profile modal is open

  // Initialize online users count functionality for Supabase chat
  function initializeOnlineUsersCount() {
    const onlineCountElement = document.getElementById('onlineCount');
    if (!onlineCountElement) return;

    // Subscribe to online users changes
    const subscription = window.supabase
      .channel('online_users_count')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'online_users' },
        () => updateOnlineCount()
      )
      .subscribe();

    async function updateOnlineCount() {
      try {
        // Get users active in the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { data, error } = await window.supabase
          .from('online_users')
          .select('user_id')
          .gte('last_active', fiveMinutesAgo);

        if (error) throw error;

        onlineCountElement.textContent = (data?.length || 0).toString();
      } catch (error) {
        console.error('Error updating online count:', error);
        onlineCountElement.textContent = '0';
      }
    }

    updateOnlineCount();

    // Update current user's online status using Supabase user data
    const updatePresenceWithRetry = async () => {
      const user = window.getCurrentUser() || await window.getSupabaseUser();
      if (!user) return;

      try {
        // Get profile data from Supabase with retry
        let profileData = null;
        try {
          profileData = await window.loadUserProfile(user.id);
        } catch (error) {
          console.warn('Failed to load profile for presence update:', error);
        }

        const username = profileData?.username || user.user_metadata?.username || user.email.split('@')[0];
        const avatarUrl = profileData?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;

        await window.supabase
          .from('online_users')
          .upsert({
            user_id: user.id,
            username: username,
            avatar_url: avatarUrl,
            last_active: new Date().toISOString()
          });
      } catch (error) {
        console.error('Error updating presence:', error);
      }
    };

    // Update presence with retry mechanism
    const updatePresence = async () => {
      try {
        await updatePresenceWithRetry();
      } catch (error) {
        // Retry once after delay
        setTimeout(updatePresenceWithRetry, 5000);
      }
    };

    // Initial update
    updatePresence();

    // Update every 30 seconds
    setInterval(updatePresence, 30000);
  }

  initializeOnlineUsersCount();
});

// Auto-save profile changes as user types
function initializeAutoSave() {
  const profileInputs = document.querySelectorAll('#profileForm input, #profileForm select, #profileForm textarea');
  let saveTimeout;

  profileInputs.forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        // Auto-save after 2 seconds of no typing
        const user = window.getCurrentUser();
        if (user) {
          const profileData = {
            username: document.getElementById('usernameInput')?.value?.trim() || '',
            gender: document.getElementById('genderSelect')?.value || '',
            bio: document.getElementById('bioInput')?.value?.trim() || '',
            updated_at: new Date().toISOString()
          };

          // Only save if there's actual content
          if (profileData.username || profileData.bio) {
            try {
              await window.updateUserProfile(user.id, profileData);
              showAutoSaveIndicator();
            } catch (error) {
              console.error('Auto-save error:', error);
            }
          }
        }
      }, 2000);
    });
  });
}