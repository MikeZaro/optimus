/**
 * ========================================
 * App Navigation Component
 * ========================================
 * Simple navigation to switch between apps
 */

import './AppNav.css';

function AppNav({ currentApp = 'dashboard' }) {
  const navigateTo = (path) => {
    window.location.pathname = path;
  };

  return (
    <nav className="app-nav">
      <button
        className={currentApp === 'dashboard' ? 'active' : ''}
        onClick={() => navigateTo('/')}
      >
        Dashboard
      </button>
      <button
        className={currentApp === 'habits' ? 'active' : ''}
        onClick={() => navigateTo('/habits')}
      >
        Habits
      </button>
      <button
        className={currentApp === 'chat' ? 'active' : ''}
        onClick={() => navigateTo('/chat')}
      >
        Claude Chat
      </button>
      <button
        className={currentApp === 'health' ? 'active' : ''}
        onClick={() => navigateTo('/health')}
      >
        Health
      </button>
      <button
        className={currentApp === 'calendar' ? 'active' : ''}
        onClick={() => navigateTo('/calendar')}
      >
        Calendar
      </button>
    </nav>
  );
}

export default AppNav;
