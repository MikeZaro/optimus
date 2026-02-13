/**
 * ========================================
 * Claude Chat Interface Component
 * ========================================
 * A clean, responsive chat UI for interacting with Claude API
 * Features:
 * - Real-time message display
 * - Session persistence
 * - Message history loading
 * - Auto-scroll to latest message
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import './ChatInterface.css';

const ChatInterface = () => {
  // State management
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [activeGoals, setActiveGoals] = useState([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);

  // Refs for auto-scroll functionality
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // API base URL (adjust if your backend runs on different port)
  const API_URL = 'http://localhost:3001/api';

  /**
   * Initialize session on component mount
   * Creates a unique session ID or loads existing one
   */
  useEffect(() => {
    // Check if session exists in localStorage
    let currentSessionId = localStorage.getItem('chat_session_id');

    if (!currentSessionId) {
      // Generate new session ID using timestamp + random string
      currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('chat_session_id', currentSessionId);
    }

    setSessionId(currentSessionId);

    // Load conversation history for this session
    loadHistory(currentSessionId);

    // Load active goals for context detection
    loadActiveGoals();
  }, []);

  /**
   * Load active goals for goal context detection
   */
  const loadActiveGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('status', 'active');

      if (error) throw error;

      setActiveGoals(data || []);
    } catch (error) {
      console.error('Error loading active goals:', error);
    } finally {
      setGoalsLoaded(true);
    }
  };

  const getInterventionGoalId = useCallback(() => {
    if (!activeGoals || activeGoals.length === 0) return null;

    const latestActiveGoal = activeGoals.reduce((latest, goal) => {
      if (!latest) return goal;
      return new Date(goal.created_at) > new Date(latest.created_at) ? goal : latest;
    }, null);

    return latestActiveGoal?.id || null;
  }, [activeGoals]);

  /**
   * Detect which goal the user is discussing based on message content
   * Simple keyword matching - will be enhanced in later phases
   */
  const detectRelevantGoal = (messageText) => {
    if (!messageText || activeGoals.length === 0) return null;

    const lowerMessage = messageText.toLowerCase();

    // Try to find goal by matching keywords in goal title
    for (const goal of activeGoals) {
      const goalWords = goal.title.toLowerCase().split(' ');

      // Check if any significant words from goal appear in message
      const matches = goalWords.filter(word =>
        word.length > 3 && lowerMessage.includes(word)
      );

      if (matches.length > 0) {
        return goal.id;
      }
    }

    // If no match, check if user mentions area names
    if (lowerMessage.includes('work') || lowerMessage.includes('job') || lowerMessage.includes('career')) {
      const workGoal = activeGoals.find(g => g.area === 'work');
      return workGoal?.id || null;
    }

    if (lowerMessage.includes('personal') || lowerMessage.includes('health') || lowerMessage.includes('wellness')) {
      const personalGoal = activeGoals.find(g => g.area === 'personal');
      return personalGoal?.id || null;
    }

    if (lowerMessage.includes('education') || lowerMessage.includes('learn') || lowerMessage.includes('study')) {
      const educationGoal = activeGoals.find(g => g.area === 'education');
      return educationGoal?.id || null;
    }

    return null; // No goal detected
  };

  /**
   * Auto-scroll to bottom when new messages arrive
   */
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * Smooth scroll to the latest message
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  /**
   * Load conversation history from backend
   */
  const loadHistory = async (sessionId) => {
    try {
      const response = await fetch(`${API_URL}/chat/history/${sessionId}`);
      const data = await response.json();

      if (data.history && data.history.length > 0) {
        setMessages(data.history);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const checkForInterventions = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`${API_URL}/chat/check-interventions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          goalId: getInterventionGoalId(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.shouldIntervene || !data.message) {
        return;
      }

      const storageKey = `chat_intervention_${sessionId}_${data.type}`;
      if (localStorage.getItem(storageKey) === 'shown') {
        return;
      }

      setMessages((prev) => {
        const alreadyExists = prev.some(
          (msg) => msg.role === 'assistant' && msg.content === data.message
        );

        if (alreadyExists) return prev;

        return [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            content: data.message,
            created_at: new Date().toISOString(),
          },
        ];
      });

      localStorage.setItem(storageKey, 'shown');
    } catch (error) {
      console.error('Error checking interventions:', error);
    }
  }, [getInterventionGoalId, sessionId]);

  useEffect(() => {
    if (!sessionId || !goalsLoaded) return;
    checkForInterventions();
  }, [checkForInterventions, goalsLoaded, sessionId]);

  /**
   * Send message to Claude API
   */
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage(''); // Clear input immediately for better UX

    // Detect which goal this message is about
    const goalId = detectRelevantGoal(userMessage);

    // Add user message to UI instantly
    const newUserMessage = {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // Call backend API with goal context
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId,
          goalId: goalId, // Include detected goal ID
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Add Claude's response to UI
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.message,
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Error sending message:', error);

      // Show error message in chat
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure the backend server is running and try again.',
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Enter key press to send message
   */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Clear conversation history
   */
  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear the conversation history?')) {
      return;
    }

    try {
      await fetch(`${API_URL}/chat/history/${sessionId}`, {
        method: 'DELETE',
      });

      setMessages([]);

      // Generate new session ID
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('chat_session_id', newSessionId);
      setSessionId(newSessionId);

    } catch (error) {
      console.error('Error clearing history:', error);
    }
  };

  /**
   * Format timestamp for display
   */
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="chat-interface">
      {/* Chat Header */}
      <div className="chat-header">
        <h1>Claude Chat</h1>
        <button onClick={clearHistory} className="clear-button">
          Clear History
        </button>
      </div>

      {/* Messages Container */}
      <div className="messages-container" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start a conversation with Claude</h2>
            <p>Ask me anything! I'm here to help.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-header">
                <span className="message-role">
                  {msg.role === 'user' ? 'You' : 'Claude'}
                </span>
                {msg.created_at && (
                  <span className="message-time">
                    {formatTime(msg.created_at)}
                  </span>
                )}
              </div>
              <div className="message-content">
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="message assistant-message loading">
            <div className="message-header">
              <span className="message-role">Claude</span>
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="input-container">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
          rows="3"
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          disabled={!inputMessage.trim() || isLoading}
          className="send-button"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
