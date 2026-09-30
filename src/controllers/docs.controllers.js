const DOC_SECTIONS = [
  {
    id: "getting-started",
    category: "Getting Started",
    title: "Introduction & Architecture",
    description: "Overview of Nexora AI core primitives, communication channels, and design principles.",
    content: "Nexora AI is built on a high-throughput MERN architecture leveraging WebSocket (Socket.io) for peer messaging and Server-Sent Events (SSE) for low-latency streaming inference from Google Gemini 3.8 Flash. All sessions are persistently synced with MongoDB.",
    codeSnippet: {
      language: "bash",
      code: "# Clone and start Nexora AI\ngit clone https://github.com/nexora/nexora-ai.git\ncd nexora-ai/backend && npm install && npm run dev\ncd ../frontend && npm install && npm run dev",
    },
  },
  {
    id: "authentication",
    category: "Authentication",
    title: "JWT Authentication & Sessions",
    description: "Secure cookie-based authentication with bcrypt hashing and JWT tokens.",
    method: "POST",
    endpoint: "/api/auth/login",
    content: "Nexora uses HTTP-only cookies containing signed JWT tokens. When making API requests from custom clients, pass credentials: 'include' or supply a Bearer token in the Authorization header.",
    codeSnippet: {
      language: "javascript",
      code: "const response = await fetch('http://localhost:8000/api/auth/login', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  credentials: 'include',\n  body: JSON.stringify({\n    email: 'user@example.com',\n    password: 'securePassword123'\n  })\n});\nconst data = await response.json();",
    },
  },
  {
    id: "streaming-api",
    category: "API Reference",
    title: "Real-time AI Chat Streaming",
    description: "Stream Gemini Flash conversational turns over Server-Sent Events (SSE).",
    method: "POST",
    endpoint: "/api/conversations/stream",
    content: "Submits a prompt or multimodal image attachment. The server yields chunks using data: {\"text\": \"...\"} lines and terminates with data: [DONE]. Turn alternation is automatically handled.",
    codeSnippet: {
      language: "javascript",
      code: "const response = await fetch('http://localhost:8000/api/conversations/stream', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  credentials: 'include',\n  body: JSON.stringify({\n    conversationId: 'optional_session_id',\n    prompt: 'Explain quantum computing simply',\n    imageUrl: null,\n    model: 'gemini-3.8-flash'\n  })\n});\n\nconst reader = response.body.getReader();\nconst decoder = new TextDecoder();\nwhile (true) {\n  const { done, value } = await reader.read();\n  if (done) break;\n  console.log(decoder.decode(value));\n}",
    },
  },
  {
    id: "conversations-rest",
    category: "API Reference",
    title: "Conversations & Session Management",
    description: "Retrieve, rename, and delete conversation sessions.",
    method: "GET",
    endpoint: "/api/conversations",
    content: "Returns the authenticated user's conversation sessions ordered by most recently updated.",
    codeSnippet: {
      language: "javascript",
      code: "// Fetch all user conversations\nconst res = await axios.get('/api/conversations', { withCredentials: true });\nconsole.log(res.data); // [{ _id, title, lastMessage, updatedAt }]\n\n// Rename conversation session\nawait axios.put('/api/conversations/:id', { title: 'Updated Title' }, { withCredentials: true });\n\n// Delete conversation session\nawait axios.delete('/api/conversations/:id', { withCredentials: true });",
    },
  },
  {
    id: "websocket-events",
    category: "Guides",
    title: "WebSocket Peer-to-Peer Events",
    description: "Direct messaging events between users with online status tracking.",
    method: "WS",
    endpoint: "ws://localhost:8000",
    content: "Socket.io events handle real-time user-to-user chatting, typing indicators, and immediate message receipt badges.",
    codeSnippet: {
      language: "javascript",
      code: "import { io } from 'socket.io-client';\nconst socket = io('http://localhost:8000', { withCredentials: true });\n\nsocket.on('connect', () => console.log('Connected to Nexora WS'));\nsocket.on('receive_message', (msg) => console.log('New message:', msg));\n\n// Emit outgoing message\nsocket.emit('send_message', {\n  receiverId: '65f2a1b9c8...', \n  text: 'Hello from SDK'\n});",
    },
  },
  {
    id: "python-sdk",
    category: "SDKs",
    title: "Python SDK Quickstart",
    description: "Connect to Nexora AI backend using Python requests.",
    content: "Stream and integrate Nexora AI directly into backend microservices or CLI tools with Python.",
    codeSnippet: {
      language: "python",
      code: "import requests, json\n\nurl = 'http://localhost:8000/api/conversations/stream'\npayload = {'prompt': 'Write a Python binary search function'}\n\nwith requests.post(url, json=payload, stream=True) as resp:\n    for line in resp.iter_lines():\n        if line:\n            decoded = line.decode('utf-8')\n            if decoded.startswith('data: '):\n                token = decoded[6:]\n                if token != '[DONE]':\n                    print(json.loads(token).get('text', ''), end='', flush=True)",
    },
  },
];

/**
 * Get structured documentation sections
 * GET /api/docs/sections
 */
export const getDocsSections = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      sections: DOC_SECTIONS,
    });
  } catch (error) {
    console.error("Get Docs Error:", error);
    return res.status(500).json({ error: "Failed to load documentation data" });
  }
};
