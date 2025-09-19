document.addEventListener("DOMContentLoaded", () => {
  // Initialize Supabase client
  const supabase = window.supabase;
  
  const signinForm = document.getElementById("signinForm");
  const signupForm = document.getElementById("signupForm");
  const googleSignIn = document.getElementById("googleSignIn");
  const passwordResetLink = document.getElementById("forgotPassword");

  // Current user state
  let currentUser = null;

  // Enhanced password reset functionality
  async function resetPassword(email) {
    try {
      if (!email || !email.trim()) {
        showToast("Please enter your email address", 'warning');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showToast("Please enter a valid email address", 'warning');
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      });
      
      if (error) {
        // Handle case where user signed up with OAuth
        if (error.message && error.message.includes('User not found')) {
          showToast(`No account found with email ${email}. If you signed up with Google, please use Google sign-in.`, 'warning');
        } else {
          throw error;
        }
      } else {
        showToast(`Password reset email sent to ${email}`, 'success');
      }
    } catch (error) {
      console.error("Password reset error:", error);
      showToast("Failed to send password reset email. Please check your email address and try again.", 'error');
    }
  }

  // Enhanced sign-in with better UX
  async function signInUser(email, password) {
    // Input validation
    if (!email || !password) {
      showToast("Please enter both email and password.", 'warning');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast("Please enter a valid email address.", 'warning');
      return;
    }

    if (password.length < 6) {
      showToast("Password must be at least 6 characters long.", 'warning');
      return;
    }

    try {
      // Show loading with specific message
      showLoadingOverlay('Signing you in...');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });
      
      if (error) {
        // Check if this is a Google OAuth user trying to sign in with password
        if (error.message && error.message.includes('Invalid login credentials')) {
          // Try to determine if this user exists but with OAuth provider
          const { data: authData, error: authError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              queryParams: {
                access_type: 'offline',
                prompt: 'consent',
                login_hint: email
              },
              redirectTo: `${window.location.origin}/`
            }
          });
          
          if (!authError) {
            showToast('This email is associated with a Google account. Please sign in with Google.', 'warning');
            return;
          }
        }
        throw error;
      }
      
      const user = data.user;
      if (!user) throw new Error('No user data received');

      // Check if email is confirmed
      if (!user.email_confirmed_at && user.app_metadata?.provider === 'email') {
        try {
          await supabase.auth.resend({
            type: 'signup',
            email: email
          });
          showToast('Please verify your email. Verification email sent.', 'warning');
          await supabase.auth.signOut();
          return;
        } catch (verificationError) {
          console.error("Email verification error:", verificationError);
          showToast('Email verification recommended. Please check your inbox.', 'warning');
        }
      }
      
      // Initialize or load user profile from Supabase
      await initializeUserProfile(user);

      // Close auth modal
      const authModal = document.getElementById('authModal');
      if (authModal) {
        authModal.classList.remove('show');
        setTimeout(() => { authModal.style.display = 'none'; }, 300);
      }

      // Update header UI
      updateHeaderUI(user);

      // Show success toast
      showToast('Welcome back!', 'success');

    } catch (error) {
      console.error("Sign-in error:", error);
      
      let errorMessage = "Sign-in failed. Please check your credentials and try again.";
      
      if (error.message) {
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = "Invalid email or password. If you signed up with Google, please use the Google sign-in button instead.";
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = "Please verify your email before signing in.";
        } else if (error.message.includes('Too many requests')) {
          errorMessage = "Too many failed login attempts. Please try again later.";
        }
      }
      
      showToast(errorMessage, 'error');
    } finally {
      hideLoadingOverlay();
    }
  }

  // Enhanced sign-up function
  async function signUpUser(email, password) {
    // Input validation
    if (!email || !password) {
      showToast("Please enter both email and password.", 'warning');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast("Please enter a valid email address.", 'warning');
      return;
    }

    if (password.length < 8) {
      showToast("Password must be at least 8 characters long.", 'warning');
      return;
    }

    try {
      showLoadingOverlay('Creating your account...');
      
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: email.split('@')[0]
          }
        }
      });
      
      if (error) throw error;

      showToast("Account created successfully! Please check your email for verification.", 'success');
      
      // Switch to sign in tab
      const signinTab = document.querySelector('.tab-btn[data-tab="signin"]');
      if (signinTab) signinTab.click();
      
    } catch (error) {
      console.error("Sign-up error:", error);
      let errorMessage = "Sign-up failed. Please try again.";
      
      if (error.message) {
        if (error.message.includes('already registered')) {
          errorMessage = "An account with this email already exists. Please sign in instead.";
        } else if (error.message.includes('Password should be')) {
          errorMessage = "Password must be at least 8 characters long.";
        }
      }
      
      showToast(errorMessage, 'error');
    } finally {
      hideLoadingOverlay();
    }
  }

  // Initialize user profile in Supabase
  async function initializeUserProfile(user) {
    try {
      // First, ensure the profiles table exists with proper schema
      const { error: tableError } = await supabase.rpc('create_profiles_table_if_not_exists');
      if (tableError && !tableError.message.includes('already exists')) {
        console.warn('Could not verify profiles table:', tableError);
      }

      // Check if profile exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching profile:', fetchError);
      }

      if (!existingProfile) {
        // Create new profile with proper error handling
        const profileData = {
          id: user.id,
          email: user.email,
          username: user.user_metadata?.username || user.email.split('@')[0],
          avatar_url: getProviderAvatar(user) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert(profileData)
          .select()
          .single();

        if (insertError) {
          console.error('Error creating profile:', insertError);
          // Try to handle the error by creating a minimal profile
          if (insertError.code === '42P01') { // Table doesn't exist
            console.warn('Profiles table does not exist. Creating user session without database profile.');
            return;
          }
          throw insertError;
        }
        
        console.log('Created new profile:', newProfile);
      } else {
        console.log('Using existing profile:', existingProfile);
      }
    } catch (error) {
      console.error('Error initializing user profile:', error);
      // Don't block user login if profile creation fails
      showToast('Profile setup incomplete. Some features may be limited.', 'warning');
    }
  }

  // Enhanced password change with better feedback
  async function changePassword(currentPassword, newPassword) {
    try {
      showLoadingOverlay('Updating your password...');
      
      // First verify current password by attempting to sign in
      const user = currentUser;
      if (!user) throw new Error('No user logged in');

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });

      if (verifyError) {
        throw new Error('Current password is incorrect');
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      // Sign out user to force new login with new password
      await supabase.auth.signOut();

      // Clear any sensitive data but keep preferences
      const theme = localStorage.getItem('theme');
      const language = localStorage.getItem('language');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (language) localStorage.setItem('language', language);

      // Show success toast
      showToast('Password updated successfully! Please sign in with your new password.', 'success');
      
      window.location.reload();

    } catch (error) {
      console.error('Error changing password:', error);
      let errorMessage = 'Failed to change password. ';
      
      if (error.message.includes('Current password is incorrect')) {
        errorMessage += 'Current password is incorrect.';
      } else if (error.message.includes('Password should be')) {
        errorMessage += 'New password must be at least 6 characters long.';
      } else {
        errorMessage += error.message || 'Please try again.';
      }
      throw new Error(errorMessage);
    } finally {
      hideLoadingOverlay();
    }
  }

  // Google Sign-In with Supabase
  async function signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account'
          },
          redirectTo: `${window.location.origin}/`
        }
      });
      
      if (error) throw error;
      
      // The redirect will handle the rest, so we don't need to close modal here
      showToast('Redirecting to Google...', 'info');
      
    } catch (error) {
      console.error("Google sign-in error:", error);
      showToast("Google sign-in failed. Please try again.", 'error');
    }
  }

  // Load user profile data from Supabase
  async function loadUserProfile(userId) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile found, return null to trigger creation
          return null;
        }
        console.error('Error loading profile:', error);
        return null;
      }

      return profile;
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
      return null;
    }
  }

  // Update user profile in Supabase
  async function updateUserProfile(userId, updates) {
    try {
      // Add updated_at timestamp
      const profileUpdates = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, create it
          const newProfile = {
            id: userId,
            ...profileUpdates,
            created_at: new Date().toISOString()
          };
          
          const { data: createdProfile, error: createError } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();
            
          if (createError) throw createError;
          return createdProfile;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  // Handle header UI updates
  async function updateHeaderUI(user) {
    const authButton = document.getElementById('authButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const chatInput = document.getElementById('chatInput');
    const sendMessage = document.getElementById('sendMessage');
    const chatLoginPrompt = document.getElementById('chatLoginPrompt');
    const notificationButton = document.getElementById('notificationButton');

    if (user) {
      currentUser = user;
      
      // Update header elements for signed in state
      if (authButton) authButton.style.display = 'none';
      if (profileDropdown) {
        profileDropdown.style.display = 'inline-block';
        profileDropdown.classList.add('show-profile');
      }
      
      // Show notifications button
      if (notificationButton) {
        notificationButton.classList.add('show');
      }

      // Load profile data from Supabase with retry mechanism
      let profileData = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries && !profileData) {
        try {
          profileData = await loadUserProfile(user.id);
          if (profileData) break;
        } catch (error) {
          console.warn(`Profile load attempt ${retryCount + 1} failed:`, error);
        }
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        }
      }
      
      // If profile data loading fails, create default profile
      if (!profileData && retryCount >= maxRetries) {
        console.warn('Failed to load profile after retries, creating default profile');
        try {
          await initializeUserProfile(user);
          profileData = await loadUserProfile(user.id);
        } catch (error) {
          console.error('Failed to create default profile:', error);
          // Use fallback data from user metadata
          profileData = {
            username: user.user_metadata?.username || user.email.split('@')[0],
            avatar_url: getProviderAvatar(user) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`
          };
        }
      }
      
      const displayName = profileData?.username || user.user_metadata?.username || user.email.split('@')[0];
      const resolvedAvatar = profileData?.avatar_url || getProviderAvatar(user) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;
      
      // Update username display with retry mechanism
      const updateDisplayElements = () => {
        document.querySelectorAll('.user-display-name').forEach(el => {
          if (el) el.textContent = displayName;
        });

        // Update user email
        const userEmailEl = document.getElementById('userEmail');
        if (userEmailEl) userEmailEl.textContent = user.email;

        // Update avatar everywhere
        const avatarUrl = resolvedAvatar;
        document.querySelectorAll('.profile-icon, .user-avatar, #avatarPreview').forEach(el => {
          if (el) {
            el.src = avatarUrl;
            // Add error handling for avatar loading
            el.onerror = function() {
              this.onerror = null;
              this.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;
            };
          }
        });
      };

      // Update immediately
      updateDisplayElements();
      
      // Also update after a short delay to catch any dynamically created elements
      setTimeout(updateDisplayElements, 500);

      // Enable chat
      if (chatInput) chatInput.disabled = false;
      if (sendMessage) sendMessage.disabled = false;
      if (chatLoginPrompt) chatLoginPrompt.classList.remove('visible');

    } else {
      currentUser = null;
      
      // Update header elements for signed out state
      if (authButton) authButton.style.display = 'inline-block';
      if (profileDropdown) {
        profileDropdown.style.display = 'none';
        profileDropdown.classList.remove('show-profile');
      }
      
      // Hide notifications button
      if (notificationButton) {
        notificationButton.classList.remove('show');
      }
      
      // Disable chat
      if (chatInput) chatInput.disabled = true;
      if (sendMessage) sendMessage.disabled = true;
      if (chatLoginPrompt) chatLoginPrompt.classList.add('visible');
    }
  }

  // Handle sign-in form submission
  if (signinForm) {
    signinForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = e.target.querySelector('input[name="email"]').value.trim();
      const password = e.target.querySelector('input[name="password"]').value;
      await signInUser(email, password);
    });
  }

  // Handle sign-up form submission
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = e.target.querySelector('input[type="email"]').value.trim();
      const password = e.target.querySelector('input[type="password"]').value;
      await signUpUser(email, password);
    });
  }

  // Google Sign-In handler
  if (googleSignIn) {
    googleSignIn.addEventListener("click", async () => {
      googleSignIn.disabled = true;
      googleSignIn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
      
      try {
        await signInWithGoogle();
      } finally {
        googleSignIn.disabled = false;
        googleSignIn.innerHTML = '<i class="fab fa-google"></i> Continue with Google';
      }
    });
  }

  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event, session?.user?.id);
    
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      currentUser = session.user;
      await updateHeaderUI(session.user);
      setTimeout(() => updateHeaderUI(session.user), 200); // ensure re-hydration
      requestAnimationFrame(() => updateHeaderUI(session.user)); // next paint
      window.dispatchEvent(new CustomEvent('profileLoaded', { detail: { user: session.user } }));
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      await updateHeaderUI(null);
    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
      currentUser = session.user;
      // Ensure UI is updated after token refresh
      await updateHeaderUI(session.user);
    }
  });

  // Initialize auth state on page load with retry mechanism
  const initializeAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      
      if (session?.user) {
        currentUser = session.user;
        await updateHeaderUI(session.user);
        // Trigger profile loading event for other components
        window.dispatchEvent(new CustomEvent('profileLoaded', { detail: { user: session.user } }));
      } else {
        currentUser = null;
        await updateHeaderUI(null);
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      // Retry once after a short delay
      setTimeout(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            currentUser = session.user;
            await updateHeaderUI(session.user);
            window.dispatchEvent(new CustomEvent('profileLoaded', { detail: { user: session.user } }));
          }
        } catch (retryError) {
          console.error('Retry auth initialization failed:', retryError);
        }
      }, 1000);
    }
  };

  initializeAuth();

  // Rehydrate UI on pageshow (including bfcache restores)
  window.addEventListener('pageshow', async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await updateHeaderUI(session.user);
        setTimeout(() => updateHeaderUI(session.user), 150);
      }
    } catch (e) {
      console.warn('pageshow rehydrate failed', e);
    }
  });

  // Password Reset handler
  if (passwordResetLink) {
    passwordResetLink.addEventListener("click", async (e) => {
      e.preventDefault();
      
      // Get email from sign-in form if available
      const emailInput = document.querySelector('#signin input[name="email"]');
      const currentEmail = emailInput ? emailInput.value.trim() : '';
      
      const email = prompt("Please enter your email address:", currentEmail);
      if (email && email.trim()) {
        await resetPassword(email.trim());
      }
    });
  }

  // Password change form handler
  const passwordChangeForm = document.getElementById('passwordChangeForm');
  if (passwordChangeForm) {
    passwordChangeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const submitBtn = passwordChangeForm.querySelector('button[type="submit"]');

      try {
        // Validate passwords
        if (!currentPassword || !newPassword || !confirmPassword) {
          throw new Error('Please fill in all password fields');
        }

        if (newPassword !== confirmPassword) {
          throw new Error('New passwords do not match');
        }

        if (newPassword.length < 8) {
          throw new Error('New password must be at least 8 characters long');
        }

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

        // Change password
        await changePassword(currentPassword, newPassword);

      } catch (error) {
        console.error('Password change error:', error);
        showToast(error.message || 'Failed to change password. Please try again.', 'error');
        
        // Reset form
        passwordChangeForm.reset();
        
        // Reset button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-key"></i> Update Password';
      }
    });
  }

  // Delete account functionality
  async function deleteAccount(password) {
    try {
      const user = currentUser;
      if (!user) throw new Error('No user logged in');

      // Verify password first for email/password users
      if (user.app_metadata?.provider === 'email') {
        if (!password) {
          throw new Error('Password required for account deletion');
        }
        
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: password
        });

        if (verifyError) {
          throw new Error('Password is incorrect');
        }
      }

      // Delete user data from Supabase
      await Promise.all([
        // Delete chat messages
        supabase.from('chat_messages').delete().eq('user_id', user.id),
        // Delete message reactions
        supabase.from('message_reactions').delete().eq('user_id', user.id),
        // Delete watchlist
        supabase.from('watchlist').delete().eq('user_id', user.id),
        // Delete online status
        supabase.from('online_users').delete().eq('user_id', user.id)
      ]);

      // Delete profile from Supabase
      const { error: profileDeleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (profileDeleteError) {
        console.warn('Error deleting profile:', profileDeleteError);
        // Continue with account deletion even if profile deletion fails
      }

      // Delete the user account from Supabase Auth
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw error;

      // Sign out
      await supabase.auth.signOut();

      // Clear local storage user data but keep preferences
      const theme = localStorage.getItem('theme');
      const language = localStorage.getItem('language');
      const searchHistory = localStorage.getItem('searchHistory');
      
      localStorage.removeItem('currentUser');
      
      // Update UI immediately
      await updateHeaderUI(null);
      
      console.log('Signed out successfully');
      showToast('Signed out successfully', 'success');
      
      // Reload page to clear any cached data
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error('Delete account error:', error);
      throw new Error(error.message || 'Failed to delete account. Please try again.');
    }
  }

  // Delete account form handler
  const deleteAccountForm = document.getElementById('deleteAccountForm');
  if (deleteAccountForm) {
    deleteAccountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!confirm('Are you absolutely sure you want to delete your account? This action cannot be undone.')) {
        return;
      }

      const deleteBtn = deleteAccountForm.querySelector('.delete-account-btn');
      const passwordInput = document.getElementById('deleteAccountPassword');
      
      try {
        if (deleteBtn) {
          deleteBtn.disabled = true;
          deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        }

        const user = currentUser;
        if (!user) {
          throw new Error('No user logged in');
        }

        // For OAuth users, don't require password
        if (user.app_metadata?.provider !== 'email') {
          await deleteAccount();
        } else {
          if (!passwordInput || !passwordInput.value) {
            throw new Error('Please enter your password to delete your account');
          }
          await deleteAccount(passwordInput.value);
        }

      } catch (error) {
        console.error('Delete account error:', error);
        showToast(error.message || 'Failed to delete account. Please try again.', 'error');
        
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Account';
        }
        if (passwordInput) {
          passwordInput.value = '';
        }
      }
    });
  }

  // Global sign out function
  window.signOut = async function() {
    try {
      showLoadingOverlay('Signing out...');
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // Best-effort presence cleanup
      if (userId) {
        try { await supabase.from('online_users').delete().eq('user_id', userId); } catch (e) { console.warn('Presence cleanup failed', e); }
      }

      // Use global scope to invalidate refresh tokens on all devices
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 7000);
        await supabase.auth.signOut({ scope: 'global', signal: ac.signal });
        clearTimeout(t);
      } catch (e) {
        console.warn('supabase.auth.signOut error (will proceed with client-side cleanup):', e?.message || e);
      }

      // Client-side cleanup (resilient even if signOut threw)
      const persistPrefs = { theme: localStorage.getItem('theme'), language: localStorage.getItem('language') };
      Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-') || k.startsWith('supabase.')) localStorage.removeItem(k); });
      localStorage.removeItem('currentUser');
      if (persistPrefs.theme) localStorage.setItem('theme', persistPrefs.theme);
      if (persistPrefs.language) localStorage.setItem('language', persistPrefs.language);

      await (window.refreshUserProfile?.() || Promise.resolve());
      showToast('Signed out successfully', 'success');
      hideLoadingOverlay();

      // Hard reload to clear any lingering in-memory state
      setTimeout(() => window.location.replace('/'), 300);
      return false;
    } catch (error) {
      console.error('Sign out error:', error);
      hideLoadingOverlay();
      showToast('Error signing out. Please try again.', 'error');
      return false;
    }
  };

  // Make auth functions globally available
  window.loadUserProfile = loadUserProfile;
  window.updateUserProfile = updateUserProfile;
  window.getCurrentUser = () => currentUser;
  window.getSupabaseUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
  };
  window.refreshUserProfile = async () => {
    if (currentUser) {
      await updateHeaderUI(currentUser);
    }
  };
});

// Loading state helpers
function showLoadingState(form) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;
}

function hideLoadingState(form) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = false;
  submitButton.innerHTML = form.id === 'signinForm' ? 'Sign In' : 'Sign Up';
}

// Add input field for delete account password
const inputGroup = document.querySelector('.danger-zone .input-group');
if (inputGroup) {
  inputGroup.innerHTML = `
    <input type="password" 
           id="deleteAccountPassword" 
           placeholder="Enter Password to Confirm" 
           required>
    <button type="button" class="password-toggle" onclick="togglePassword('deleteAccountPassword', this)">
      <i class="fas fa-eye"></i>
    </button>
  `;
}

// Add settings button functionality
const settingsBtn = document.getElementById('openSettings');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
      settingsModal.classList.add('show');
    }
  });
}

function getProviderAvatar(user) {
  try {
    return (
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      (user?.identities || []).find(i => i.provider === 'google')?.identity_data?.picture ||
      null
    );
  } catch { return null; }
}