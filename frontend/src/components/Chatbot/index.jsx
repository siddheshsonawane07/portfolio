import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { MessageCircle, X, Send } from 'lucide-react';

const ChatContainer = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: ${(props) => (props.isOpen ? '24rem' : '3.5rem')};
  height: ${(props) => (props.isOpen ? '500px' : '3.5rem')};
  background-color: white;
  border-radius: ${(props) => (props.isOpen ? '1rem' : '50%')};
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.3s ease-in-out;
  display: flex;
  flex-direction: column;
  z-index: 1000;
`;

const ChatToggle = styled.div`
  width: 3.5rem;
  height: 3.5rem;
  background-color: #3b82f6;
  overflow: hidden;
  border-radius: 50%;
  display: ${(props) => (props.isOpen ? 'none' : 'flex')};
  align-items: center;
  justify-content: center;
  cursor: pointer;
  &:hover {
    background-color: #2563eb;
  }
`;

const ChatHeader = styled.div`
  padding: 0.75rem 1rem;
  background-color: #3b82f6;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  word-break: break-word;

  button {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    &:hover {
      background-color: #2563eb;
    }
  }
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background-color: white;
  width: 100%;
  box-sizing: border-box;
`;

const MessageBubble = styled.div`
  max-width: 80%;
  padding: 0.75rem;
  border-radius: 1rem;
  background-color: ${(props) => (props.sender === 'user' ? '#3b82f6' : '#f3f4f6')};
  color: ${(props) => (props.sender === 'user' ? 'white' : '#1f2937')};
  margin-left: ${(props) => (props.sender === 'user' ? 'auto' : '0')};
  ${(props) => props.error && `background-color: #fee2e2; color: #b91c1c;`}
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  width: fit-content;
  max-width: 80%;
  box-sizing: border-box;
`;

const TypingIndicator = styled.div`
  max-width: 80%;
  padding: 0.75rem;
  border-radius: 1rem;
  background-color: #f3f4f6;
  color: #6b7280;
  word-wrap: break-word;
  overflow-wrap: break-word;
`;

const ChatForm = styled.form`
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 0.5rem;
  background-color: white;
  width: 100%;
  box-sizing: border-box;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  outline: none;
  min-width: 0;
  &:focus {
    border-color: #3b82f6;
  }
  &:disabled {
    background-color: #f9fafb;
  }
`;

const SubmitButton = styled.button`
  padding: 0.5rem;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  &:hover {
    background-color: #2563eb;
  }
  &:disabled {
    background-color: #9ca3af;
    cursor: not-allowed;
  }
`;

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef(null);


  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    setMessages((prev) => [...prev, { text: userMessage, sender: 'user' }]);

    try {
      const response = await fetch('https://portfolio-dx1q.onrender.com/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: userMessage,
        }),
      });

      if (!response.ok) {
        throw new Error('Server error');
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { text: data.answer || 'No response from AI.', sender: 'bot' },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { text: '  Failed to process the request', sender: 'bot', error: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ChatContainer isOpen={isOpen}>
      <ChatToggle isOpen={isOpen} onClick={toggleChat}>
        <MessageCircle size={24} color="white" />
      </ChatToggle>

      {isOpen && (
        <>
          <ChatHeader>
            <span>Chat</span>
            <button onClick={toggleChat}>
              <X size={24} />
            </button>
          </ChatHeader>

          <MessagesContainer>
            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                sender={message.sender}
                error={message.error}
              >
                {message.text}
              </MessageBubble>
            ))}
            {isLoading && <TypingIndicator>Thinking...</TypingIndicator>}
            <div ref={messagesEndRef} />
          </MessagesContainer>

          <ChatForm onSubmit={handleSubmit}>
            <ChatInput
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={isLoading}
            />
            <SubmitButton type="submit" disabled={isLoading}>
              <Send size={20} />
            </SubmitButton>
          </ChatForm>
        </>
      )}
    </ChatContainer>
  );
};

export default Chatbot;