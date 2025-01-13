import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { MessageCircle, X, Send } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

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
`;

const ChatToggle = styled.div`
  width: 3.5rem;
  height: 3.5rem;
  background-color: #3b82f6;
  border-radius: 50%;
  display: ${(props) => (props.isOpen ? 'none' : 'flex')};
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;

const ChatHeader = styled.div`
  padding: 0.75rem 1rem;
  background-color: #3b82f6;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const MessageBubble = styled.div`
  max-width: 80%;
  padding: 0.75rem;
  border-radius: 1rem;
  background-color: ${(props) => (props.sender === 'user' ? '#3b82f6' : '#f3f4f6')};
  color: ${(props) => (props.sender === 'user' ? 'white' : '#1f2937')};
  margin-left: ${(props) => (props.sender === 'user' ? 'auto' : '0')};
  ${(props) => props.error && `background-color: #fee2e2; color: #b91c1c;`}
`;

const TypingIndicator = styled.div`
  max-width: 80%;
  padding: 0.75rem;
  border-radius: 1rem;
  background-color: #f3f4f6;
  color: #6b7280;
`;

const ChatForm = styled.form`
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 0.5rem;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  outline: none;
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
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
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
    initializeIndex();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const initializeIndex = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/initialize`);
      console.log('Index initialized:', response.data.message);
    } catch (error) {
      console.error('Failed to initialize index:', error.response?.data?.error || error.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    setMessages((prev) => [...prev, { text: userMessage, sender: 'user' }]);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/chat`, {
        question: userMessage,
      });

      setMessages((prev) => [
        ...prev,
        { text: response.data.answer || 'No response from AI.', sender: 'bot' },
      ]);
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Server error. Please try again.';
      setMessages((prev) => [
        ...prev,
        { text: errorMessage, sender: 'bot', error: true },
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
            <span>Chat with AI</span>
            <button onClick={toggleChat}>
              <X size={24} color="white" />
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
