# 🚀 Nexora AI — Full-Stack AI Chat & Collaborative Workspace

Nexora AI is a production-ready, full-stack conversational AI platform built on the MERN stack with real-time Server-Sent Events (SSE) token streaming via Google Gemini, MongoDB session persistence, an interactive user analytics dashboard, and Stripe subscription billing.

---

![alt text](<Screenshot 2026-10-02 202417-1.png>)

## 📁 Repository Structure

- **[`frontend/`](file:///e:/WebSocketIO/chatprojects/frontend/)**: React 19 + Vite client application featuring Tailwind CSS, Redux Toolkit, real-time SSE streaming, and interactive chat history viewer. Detailed documentation available in [frontend/README.md](file:///e:/WebSocketIO/chatprojects/frontend/README.md).
- **[`backend/`](file:///e:/WebSocketIO/chatprojects/backend/)**: Express 5 REST & SSE streaming server with `@google/genai`, MongoDB Atlas (Mongoose), JWT cookie authentication, and Stripe checkout verification.

---

## ⚡ Quick Start

### 1. Start Backend
```bash
cd backend
npm install
npm run dev
```

### 2. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to explore the application. For detailed architecture, challenges resolved, and tech stack information, see the [Frontend Documentation](file:///e:/WebSocketIO/chatprojects/frontend/README.md).
