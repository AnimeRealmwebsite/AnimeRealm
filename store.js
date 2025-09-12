(function () {
  const listeners = new Set();
  const state = {
    auth: { user: null },
    ui: {
      theme: localStorage.getItem('theme') || 'dark',
      language: localStorage.getItem('language') || 'en',
      modals: { auth: false, profile: false, settings: false },
    },
    view: { currentView: 'home' },
    chat: { onlineCount: 0 },
  };
  const notify = () => listeners.forEach((fn) => fn(state));
  const AppStore = {
    getState: () => state,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    setUser: (user) => { state.auth.user = user; notify(); },
    setCurrentView: (view) => { state.view.currentView = view; window.currentView = view; notify(); },
    setTheme: (theme) => { state.ui.theme = theme; localStorage.setItem('theme', theme); notify(); },
    setLanguage: (lang) => { state.ui.language = lang; localStorage.setItem('language', lang); notify(); },
    setOnlineCount: (n) => { state.chat.onlineCount = n; notify(); },
  };
  window.AppStore = AppStore;
})();

