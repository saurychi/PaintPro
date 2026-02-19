"use client"

import React, { useState } from "react"

// Define types for our data
type Message = {
  id: string
  sender: "me" | "other"
  content: string
  timestamp: string
  date?: string // Optional date separator
}

type Conversation = {
  id: string
  name: string
  role?: string // e.g., 'Project Manager'
  lastMessage: string
  avatarColor?: string // To simulate the red/pink dots
  unread?: boolean
}

// Mock Data
const conversations: Conversation[] = [
  {
    id: "1",
    name: "Client",
    lastMessage: "Client: The amount of paint needed did not ex...",
    avatarColor: "bg-red-500",
    unread: true,
  },
  {
    id: "2",
    name: "Marco Dela Cruz",
    lastMessage: "You: yes thats okay",
    avatarColor: "bg-transparent",
  },
  {
    id: "3",
    name: "Ramon Santos",
    lastMessage: "Ramon Santos: sir i have an urgency and i cur...",
    avatarColor: "bg-transparent",
  },
]

const chatHistory: Message[] = [
  {
    id: "m1",
    sender: "other",
    content: "we changed the parts you mentioned",
    timestamp: "5min ago",
    date: "Today",
  },
  {
    id: "m2",
    sender: "me",
    content: "thank you",
    timestamp: "3min ago",
  },
  {
    id: "m3",
    sender: "other",
    content: "welcome",
    timestamp: "1min ago",
  },
  {
    id: "m4",
    sender: "me",
    content: "is the amount of paint okay?",
    timestamp: "1min ago",
  },
  {
    id: "m5",
    sender: "other",
    content: "The amount of paint needed did not exceed, so its okay",
    timestamp: "1min ago",
  },
]

function AdminMessages() {
  const [activeChatId, setActiveChatId] = useState<string>("1")
  const [inputMessage, setInputMessage] = useState("")

  const activeChat = conversations.find((c) => c.id === activeChatId) || conversations[0]

  return (
    <main className="h-screen bg-white p-6 flex flex-col overflow-hidden">
      <h1 className="text-3xl font-bold text-[#1a1a4b] mb-4 shrink-0">Messages</h1>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Conversation List */}
        <div className="w-full lg:w-1/4 xl:w-1/5 bg-white rounded-xl shadow-sm border border-gray-100 p-4 overflow-y-auto">
          <div className="space-y-3">
            {conversations.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => setActiveChatId(chat.id)}
                className={`
                  w-full text-left p-4 rounded-lg border transition-colors relative
                  ${activeChatId === chat.id ? "border-[#00c065] bg-gray-50" : "border-gray-100 hover:bg-gray-50"}
                `}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-3">
                    {chat.unread && <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />}
                    <h3 className="font-bold text-gray-900">{chat.name}</h3>
                  </div>
                  <span className="text-gray-400 hover:text-gray-600">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="12" cy="5" r="1" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>
                  </span>
                </div>
                <p className="text-xs text-gray-600 line-clamp-1 pl-6 font-medium">{chat.lastMessage}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-200 relative">
                <div className="absolute top-0 right-0 w-3 h-3 bg-[#00c065] rounded-full border-2 border-white" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{activeChat.name}</h2>
                <p className="text-xs text-gray-500">{activeChat.role ?? "Project Manager"}</p>
              </div>
            </div>
            <button className="text-gray-400 hover:text-gray-600" type="button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {chatHistory.map((msg) => (
              <div key={msg.id}>
                {msg.date && (
                  <div className="flex items-center justify-center mb-6">
                    <div className="h-px bg-gray-200 w-1/4" />
                    <span className="text-xs text-[#00c065] font-medium px-4">{msg.date}</span>
                    <div className="h-px bg-gray-200 w-1/4" />
                  </div>
                )}

                <div className={`flex flex-col ${msg.sender === "me" ? "items-end" : "items-start"}`}>
                  <div
                    className={`
                      max-w-[70%] px-4 py-3 rounded-xl text-sm
                      ${msg.sender === "me" ? "text-white rounded-br-none" : "bg-indigo-50 text-gray-800 rounded-bl-none"}
                    `}
                    style={msg.sender === "me" ? { backgroundColor: "#77dd77" } : {}}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1">{msg.timestamp}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div className="p-4 border-t border-gray-100 shrink-0">
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-2">
              <button className="text-gray-400 hover:text-gray-600" type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              <input
                type="text"
                placeholder="Enter your message"
                className="flex-1 outline-none text-sm text-gray-600"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
              />

              <button className="bg-[#77dd77] hover:bg-[#66cc66] text-white p-2 rounded-lg transition-colors" type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>


      </div>
    </main>
  )
}

export default AdminMessages
