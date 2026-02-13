import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './DailyInput.css';

export default function DailyInput() {
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!inputText.trim()) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('daily_inputs')
        .insert({
          input_date: new Date().toISOString().split('T')[0],
          response_text: inputText.trim(),
        });

      if (error) throw error;

      // Clear input and show success
      setInputText('');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error('Error saving daily input:', error);
      alert('Failed to save input. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="daily-input-container">
      <form onSubmit={handleSubmit} className="daily-input-form">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What's important?"
          className="daily-input-textarea"
          disabled={isSubmitting}
          rows={1}
          style={{
            minHeight: '44px',
            maxHeight: '150px',
            resize: 'none',
            overflow: 'auto',
          }}
        />
        <button
          type="submit"
          className="daily-input-submit"
          disabled={isSubmitting || !inputText.trim()}
        >
          {isSubmitting ? 'Saving...' : 'Submit'}
        </button>
      </form>

      {showSuccess && (
        <div className="daily-input-success">
          ✓ Saved
        </div>
      )}
    </div>
  );
}
