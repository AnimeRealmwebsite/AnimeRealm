document.addEventListener("DOMContentLoaded", () => {
  const auth = firebase.auth();
  const signinForm = document.getElementById("signinForm");
  const signupForm = document.getElementById("signupForm");
  const googleSignIn = document.getElementById("googleSignIn");
  const passwordResetLink = document.getElementById("forgotPassword");

  // Enhanced password reset functionality
  async function resetPassword(email) {
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      alert(`Password reset email sent to ${email}`);
    } catch (error) {
      console.error("Password reset error:", error);
      alert("Failed to send password reset email. Please check your email address and try again.");
    }
  }

  // Enhanced sign-in with detailed error handling and validation
  async function signInUser(email, password) {
    // Input validation
    if (!email || !password) {
      alert("Please enter both email and password.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    try {
      // Show loading state
      const signinForm = document.getElementById("signinForm");
      if (signinForm) {
        showLoadingState(signinForm);
      }

      const userCredential = await auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
          throw error;
        });
      const user = userCredential.user;
      
      if (user && !user.emailVerified) {
        try {
          await user.sendEmailVerification();
          alert('Please verify your email. Verification email sent.');
          await auth.signOut();
        } catch (verificationError) {
          console.error("Email verification error:", verificationError);
          alert('Email verification recommended. Please check your inbox.');
        }
        return;
      }
      
      // Initialize profile if it doesn't exist
      if (user && !localStorage.getItem(`profile_${user.uid}`)) {
        const defaultProfile = {
          username: email.split('@')[0],
          email: email,
          createdAt: new Date().toISOString()
        };
        
        try {
          localStorage.setItem(`profile_${user.uid}`, JSON.stringify(defaultProfile));
        } catch (storageError) {
          console.error("Error saving to localStorage:", storageError);
        }
      }

      // Close auth modal
      const authModal = document.getElementById('authModal');
      if (authModal) {
        authModal.classList.remove('show');
        setTimeout(() => { authModal.style.display = 'none'; }, 300);
      }

      // Update header UI only
      updateHeaderUI(user);

    } catch (error) {
      console.error("Sign-in error:", error);
      
      let errorMessage = "Sign-in failed. Please check your credentials and try again.";
      
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMessage = "Invalid email address. Please check and try again.";
            break;
          case 'auth/user-disabled':
            errorMessage = "This user account has been disabled.";
            break;
          case 'auth/user-not-found':
            errorMessage = "No user found with this email. Please sign up.";
            break;
          case 'auth/wrong-password':
            errorMessage = "Incorrect password. Please try again.";
            break;
          case 'auth/too-many-requests':
            errorMessage = "Too many failed login attempts. Please try again later.";
            break;
        }
      }
      
      alert(errorMessage);
    } finally {
      const signinForm = document.getElementById("signinForm");
      if (signinForm) {
        hideLoadingState(signinForm);
      }
    }
  }

  // Enhanced sign-up function with better error handling
  async function signUpUser(email, password) {
    // Input validation
    if (!email || !password) {
      alert("Please enter both email and password.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      alert("Password must be at least 8 characters long.");
      return;
    }

    try {
      // Show loading state
      showLoadingState(signupForm);

      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      // Initialize user profile
      const profileData = {
        username: email.split('@')[0],
        email: email,
        createdAt: new Date().toISOString()
      };
      
      localStorage.setItem(`profile_${user.uid}`, JSON.stringify(profileData));
      
      await user.sendEmailVerification();
      
      alert("Account created successfully! Please verify your email.");
      await auth.signOut();
    } catch (error) {
      console.error("Sign-up error:", error);
      alert(error.message || "Sign-up failed. Please try again.");
    } finally {
      hideLoadingState(signupForm);
    }
  }

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

  // Handle header UI updates
  function updateHeaderUI(user) {
    const authButton = document.getElementById('authButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const chatInput = document.getElementById('chatInput');
    const sendMessage = document.getElementById('sendMessage');
    const chatLoginPrompt = document.getElementById('chatLoginPrompt');
    const notificationButton = document.getElementById('notificationButton');

    if (user) {
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

      // Get profile data
      let profileData = {};
      try {
        const storedProfile = localStorage.getItem(`profile_${user.uid}`);
        if (storedProfile) {
          profileData = JSON.parse(storedProfile);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        profileData = {
          username: user.displayName || user.email.split('@')[0],
          email: user.email
        };
      }
      
      const displayName = profileData.username || user.displayName || user.email.split('@')[0];
      
      // Update username display
      document.querySelectorAll('.user-display-name').forEach(el => {
        if (el) el.textContent = displayName;
      });

      // Update user email
      const userEmailEl = document.getElementById('userEmail');
      if (userEmailEl) userEmailEl.textContent = user.email;

      // Update avatar everywhere
      const avatarUrl = profileData.avatar || user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`;
      document.querySelectorAll('.profile-icon, .user-avatar, #avatarPreview').forEach(el => {
        if (el) el.src = avatarUrl;
      });

      // Enable chat
      if (chatInput) chatInput.disabled = false;
      if (sendMessage) sendMessage.disabled = false;
      if (chatLoginPrompt) chatLoginPrompt.classList.remove('visible');

    } else {
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

  // Handle sign-in immediately after successful authentication
  if (signinForm) {
    signinForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = e.target.querySelector('input[name="email"]').value.trim();
      const password = e.target.querySelector('input[name="password"]').value;
      await signInUser(email, password);
    });
  }

  // Handle sign-up and immediate sign-in
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = e.target.querySelector('input[type="email"]').value.trim();
      const password = e.target.querySelector('input[type="password"]').value;
      await signUpUser(email, password);
    });
  }

  // Google Sign-In with immediate UI update and error handling
  if (googleSignIn) {
    googleSignIn.addEventListener("click", async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        // Disable button to prevent multiple clicks
        googleSignIn.disabled = true;
        googleSignIn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // Initialize profile if it doesn't exist
        if (!localStorage.getItem(`profile_${user.uid}`)) {
          const defaultProfile = {
            username: user.displayName || user.email.split('@')[0],
            email: user.email,
            avatar: user.photoURL,
            createdAt: new Date().toISOString()
          };
          localStorage.setItem(`profile_${user.uid}`, JSON.stringify(defaultProfile));
        }
        
        // Close modal
        const authModal = document.getElementById('authModal');
        if (authModal) {
          authModal.classList.remove('show');
          setTimeout(() => { authModal.style.display = 'none'; }, 300);
        }
        
        // Update header UI only
        updateHeaderUI(user);
        
      } catch (error) {
        console.error("Google sign-in error:", error);
        let errorMessage = "Google sign-in failed. Please try again.";
        
        if (error.code === 'auth/popup-closed-by-user') {
          errorMessage = "Sign-in cancelled. The popup was closed.";
        } else if (error.code === 'auth/popup-blocked') {
          errorMessage = "Google sign-in popup was blocked. Please enable popups.";
        }
        
        alert(errorMessage);
      } finally {
        // Re-enable button
        googleSignIn.disabled = false;
        googleSignIn.innerHTML = '<i class="fab fa-google"></i> Continue with Google';
      }
    });
  }

  // Initialize auth state on page load
  firebase.auth().onAuthStateChanged((user) => {
    updateHeaderUI(user);
  });

  // Password Reset
  if (passwordResetLink) {
    passwordResetLink.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = prompt("Please enter your email address:");
      if (email) {
        await resetPassword(email);
      }
    });
  }

  // Enhanced password change function
  async function changePassword(currentPassword, newPassword) {
    const user = firebase.auth().currentUser;
    if (!user) {
      throw new Error('No user logged in');
    }

    try {
      // First reauthenticate
      const credential = firebase.auth.EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      
      await user.reauthenticateWithCredential(credential);
      
      // Then update password
      await user.updatePassword(newPassword);

      // Sign out user to force new login with new password
      await firebase.auth().signOut();

      // Clear any sensitive data but keep preferences
      const theme = localStorage.getItem('theme');
      const language = localStorage.getItem('language');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (language) localStorage.setItem('language', language);

      alert('Password updated successfully! Please sign in with your new password.');
      window.location.reload();

    } catch (error) {
      console.error('Error changing password:', error);
      let errorMessage = 'Failed to change password. ';
      
      switch (error.code) {
        case 'auth/wrong-password':
          errorMessage += 'Current password is incorrect.';
          break;
        case 'auth/weak-password':
          errorMessage += 'New password must be at least 6 characters long.';
          break;
        case 'auth/requires-recent-login':
          errorMessage += 'Please sign out and sign in again before changing your password.';
          break;
        default:
          errorMessage += error.message || 'Please try again.';
      }
      throw new Error(errorMessage);
    }
  }

  // Add password change form handler
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
        alert(error.message || 'Failed to change password. Please try again.');
        
        // Reset form
        passwordChangeForm.reset();
        
        // Reset button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-key"></i> Update Password';
      }
    });
  }

  // Update delete account functionality
  async function deleteAccount(password) {
    const user = firebase.auth().currentUser;
    if (!user) {
      throw new Error('No user logged in');
    }

    try {
      // First reauthenticate based on provider
      if (user.providerData[0].providerId === 'google.com') {
        const provider = new firebase.auth.GoogleAuthProvider();
        await user.reauthenticateWithPopup(provider);
      } else {
        if (!password) {
          throw new Error('Password required for account deletion');
        }
        const credential = firebase.auth.EmailAuthProvider.credential(
          user.email,
          password
        );
        await user.reauthenticateWithCredential(credential);
      }

      // Delete user data
      await Promise.all([
        // Delete chat messages
        firebase.database().ref('messages').orderByChild('uid').equalTo(user.uid).once('value')
          .then(snapshot => {
            const deletions = [];
            snapshot.forEach(child => {
              deletions.push(firebase.database().ref('messages').child(child.key).remove());
            });
            return Promise.all(deletions);
          }),

        // Delete watchlist
        firebase.database().ref(`users/${user.uid}`).remove(),

        // Delete online status
        firebase.database().ref(`online_users/${user.uid}`).remove(),

        // Delete any profile data from localStorage
        new Promise(resolve => {
          localStorage.removeItem(`profile_${user.uid}`);
          resolve();
        })
      ]);

      // Finally delete the account
      await user.delete();

      // Clear all local storage except theme/language
      const theme = localStorage.getItem('theme');
      const language = localStorage.getItem('language');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (language) localStorage.setItem('language', language);

      alert('Your account has been successfully deleted. The page will now reload.');
      window.location.reload();

    } catch (error) {
      console.error('Delete account error:', error);
      throw new Error(error.message || 'Failed to delete account. Please try again.');
    }
  }

  // Update the delete account form handler
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

        const user = firebase.auth().currentUser;
        if (!user) {
          throw new Error('No user logged in');
        }

        // For Google users, don't require password
        if (user.providerData[0].providerId === 'google.com') {
          await deleteAccount();
        } else {
          if (!passwordInput || !passwordInput.value) {
            throw new Error('Please enter your password to delete your account');
          }
          await deleteAccount(passwordInput.value);
        }

      } catch (error) {
        console.error('Delete account error:', error);
        alert(error.message || 'Failed to delete account. Please try again.');
        
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

  // Add input field for delete account password
  const inputGroup = document.querySelector('.danger-zone .input-group');
  if (inputGroup) {
    inputGroup.innerHTML = `
      <input type="password" 
             id="deleteAccountPassword" 
             placeholder="Enter Password to Confirm" 
             required>
      <div class="password-toggle" onclick="togglePassword('deleteAccountPassword', this)">
        <i class="fas fa-eye"></i>
      </div>
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
});