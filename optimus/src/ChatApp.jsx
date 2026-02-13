/**
 * ========================================
 * Chat Application Wrapper
 * ========================================
 * Main wrapper for the Claude chat interface
 */

import ChatInterface from './components/ChatInterface';
import AppNav from './components/AppNav';

function ChatApp() {
  return (
    <>
      <AppNav currentApp="chat" />
      <ChatInterface />
    </>
  );
}

export default ChatApp;
