"use client";

import React, { useState } from 'react';
import SideNavbar from "@/components/sideNavbar";

// Define types for our data
type Message = {
    id: string;
    sender: 'me' | 'other';
    content: string;
    timestamp: string;
    date?: string; // Optional date separator
};

type Conversation = {
    id: string;
    name: string;
    role?: string; // e.g., 'Project Manager'
    lastMessage: string;
    avatarColor?: string; // To simulate the red/pink dots
    unread?: boolean;
};

// Mock Data
const conversations: Conversation[] = [
    {
        id: '1',
        name: 'Client',
        lastMessage: 'Client: The amount of paint needed did not ex...',
        avatarColor: 'bg-red-500',
        unread: true
    },
    {
        id: '2',
        name: 'Marco Dela Cruz',
        lastMessage: 'You: yes thats okay',
        avatarColor: 'bg-transparent', // No dot for read/others maybe? Mockup shows distinct styles
    },
    {
        id: '3',
        name: 'Ramon Santos',
        lastMessage: 'Ramon Santos: sir i have an urgency and i cur...',
        avatarColor: 'bg-transparent',
    }
];

const chatHistory: Message[] = [
    {
        id: 'm1',
        sender: 'other',
        content: 'we changed the parts you mentioned',
        timestamp: '5min ago',
        date: 'Today'
    },
    {
        id: 'm2',
        sender: 'me',
        content: 'thank you',
        timestamp: '3min ago'
    },
    {
        id: 'm3',
        sender: 'other',
        content: 'welcome',
        timestamp: '1min ago'
    },
    {
        id: 'm4',
        sender: 'me',
        content: 'is the amount of paint okay?',
        timestamp: '1min ago'
    },
    {
        id: 'm5',
        sender: 'other',
        content: 'The amount of paint needed did not exceed, so its okay',
        timestamp: '1min ago'
    }
];

function AdminMessages() {
    const [activeChatId, setActiveChatId] = useState<string>('1');
    const [inputMessage, setInputMessage] = useState('');

    const activeChat = conversations.find(c => c.id === activeChatId) || conversations[0];

    return (
        <div className="h-[calc(100vh-2rem)] flex flex-col">
             
         

            <div className="flex flex-1 gap-6 overflow-hidden">
                <SideNavbar activeKey="messages" />
                <div className="w-full lg:w-1/3 xl:w-1/4 bg-white rounded-xl shadow-sm border border-gray-100 p-4 overflow-y-auto">
                    <div className="space-y-3">
                        {conversations.map((chat) => (
                            <div 
                                key={chat.id}
                                onClick={() => setActiveChatId(chat.id)}
                                className={`
                                    p-4 rounded-lg cursor-pointer border transition-colors relative
                                    ${activeChatId === chat.id ? 'border-[#00c065] bg-gray-50' : 'border-gray-100 hover:bg-gray-50'}
                                `}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-3">
                                        {/* Avatar Dot */}
                                        {chat.unread && (
                                            <div className="w-3 h-3 rounded-full bg-red-500 shrink-0"></div>
                                        )}
                                        <h3 className="font-bold text-gray-900">{chat.name}</h3>
                                    </div>
                                    <button className="text-gray-400 hover:text-gray-600">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="1"></circle>
                                            <circle cx="12" cy="5" r="1"></circle>
                                            <circle cx="12" cy="19" r="1"></circle>
                                        </svg>
                                    </button>
                                </div>
                                <p className="text-xs text-gray-600 line-clamp-1 pl-6 font-medium">
                                    {chat.lastMessage}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                    {/* Chat Header */}
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-red-200 relative">
                                <div className="absolute top-0 right-0 w-3 h-3 bg-[#00c065] rounded-full border-2 border-white"></div>
                            </div>
                            <div>
                                <h2 className="font-bold text-gray-900">Paul Jackman</h2>
                                <p className="text-xs text-gray-500">Project Manager</p>
                            </div>
                        </div>
                        <button className="text-gray-400 hover:text-gray-600">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="12" cy="5" r="1"></circle>
                                <circle cx="12" cy="19" r="1"></circle>
                            </svg>
                        </button>
                    </div>

                    {/* Messages Scroll Area */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {chatHistory.map((msg, idx) => (
                            <div key={msg.id}>
                                {msg.date && (
                                    <div className="flex items-center justify-center mb-6">
                                        <div className="h-px bg-gray-200 w-1/4"></div>
                                        <span className="text-xs text-[#00c065] font-medium px-4">{msg.date}</span>
                                        <div className="h-px bg-gray-200 w-1/4"></div>
                                    </div>
                                )}
                                
                                <div className={`flex flex-col ${msg.sender === 'me' ? 'items-end' : 'items-start'}`}>
                                    <div 
                                        className={`
                                            max-w-[70%] px-4 py-3 rounded-xl text-sm
                                            ${msg.sender === 'me' 
                                                ? 'bg-[#8ce6ad] text-white rounded-br-none' 
                                                : 'bg-indigo-50 text-gray-800 rounded-bl-none'
                                            }
                                        `}
                                        style={msg.sender === 'me' ? { backgroundColor: '#77dd77' } : {}} // Adjusting green to match image better
                                    >
                                        {msg.content}
                                    </div>
                                    <span className="text-[10px] text-gray-400 mt-1">{msg.timestamp}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Message Input */}
                    <div className="p-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-2">
                            <button className="text-gray-400 hover:text-gray-600">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                </svg>
                            </button>
                            <input 
                                type="text" 
                                placeholder="Enter your message" 
                                className="flex-1 outline-none text-sm text-gray-600"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                            />
                            <button className="bg-[#77dd77] hover:bg-[#66cc66] text-white p-2 rounded-lg transition-colors">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Staff Profile Column */}
                <div className="hidden xl:block w-1/4 bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-y-auto">
                    <div className="flex flex-col items-center mb-6">
                        <div className="w-24 h-24 rounded-full bg-red-200 mb-4 relative">
                            {/* Placeholder for avatar image */}
                            <div className="absolute bottom-1 right-1 w-5 h-5 bg-[#00c065] rounded-full border-4 border-white"></div>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">Paul Jackman</h2>
                        <p className="text-sm text-gray-500 font-medium">Project Manager</p>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Contact Info</h3>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                        <polyline points="22,6 12,13 2,6"></polyline>
                                    </svg>
                                    <span>paul.jackman@paintpro.com</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                    </svg>
                                    <span>+1 (555) 123-4567</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    <span>Melbourne, Australia</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Performance</h3>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-medium text-gray-700">Response Rate</span>
                                    <span className="text-xs font-bold text-[#00c065]">98%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-[#00c065] h-1.5 rounded-full" style={{ width: '98%' }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100">
                            <button className="w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-2 rounded-lg transition-colors text-sm">
                                View Full Profile
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminMessages;