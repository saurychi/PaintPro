"use client";

import React, { useState } from 'react';
import { signOut } from 'next-auth/react';

function Settings() {
    const [profile, setProfile] = useState({
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
        phone: '0X XXXX XXXX'
    });

    const [toggles, setToggles] = useState({
        jobUpdates: false,
        messages: true,
        autoDownload: true,
        quotesInvoices: true
    });

    const [saved, setSaved] = useState(false);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleToggle = (key: keyof typeof toggles) => {
        setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = () => {
        // Mock save action
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleLogout = () => {
        signOut({ callbackUrl: '/' });
    };

    return (
        <div className="max-w-4xl mx-auto pb-10">
            <h1 className="text-3xl font-bold text-[#1a1a4b] mb-8">Settings</h1>

            {/* Profile Details Section */}
            <div className="mb-10">
                <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-lg font-medium text-gray-700 whitespace-nowrap">Profile Details</h2>
                    <div className="h-px bg-gray-200 w-full"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">First name</label>
                        <input
                            type="text"
                            name="firstName"
                            value={profile.firstName}
                            onChange={handleProfileChange}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-600 focus:outline-none focus:border-[#00c065] transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Last name</label>
                        <input
                            type="text"
                            name="lastName"
                            value={profile.lastName}
                            onChange={handleProfileChange}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-600 focus:outline-none focus:border-[#00c065] transition-colors"
                        />
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                        </div>
                        <input
                            type="email"
                            name="email"
                            value={profile.email}
                            onChange={handleProfileChange}
                            className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-gray-600 focus:outline-none focus:border-[#00c065] transition-colors"
                        />
                    </div>
                </div>

                <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                    <div className="relative max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                        </div>
                        <input
                            type="tel"
                            name="phone"
                            value={profile.phone}
                            onChange={handleProfileChange}
                            className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-gray-600 focus:outline-none focus:border-[#00c065] transition-colors"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={handleSave}
                        className="bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0] px-8 py-2 rounded-lg font-medium transition-colors"
                    >
                        Save
                    </button>
                    {saved && <span className="text-green-600 font-medium">Saved!</span>}
                </div>
            </div>

            {/* Actions Section */}
            <div className="mb-10">
                <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-lg font-medium text-gray-700 whitespace-nowrap">Actions</h2>
                    <div className="h-px bg-gray-200 w-full"></div>
                </div>

                <div className="space-y-6">
                    <ToggleItem 
                        label="Receive Notifications from Job Updates" 
                        active={toggles.jobUpdates} 
                        onClick={() => handleToggle('jobUpdates')} 
                    />
                    <ToggleItem 
                        label="Receive Notifications from Messages" 
                        active={toggles.messages} 
                        onClick={() => handleToggle('messages')} 
                    />
                    <ToggleItem 
                        label="Auto Download Documents(Quotes, Invoice, Etc.)" 
                        active={toggles.autoDownload} 
                        onClick={() => handleToggle('autoDownload')} 
                    />
                    <ToggleItem 
                        label="Automatically receive Quotes and Invoices to personal email" 
                        active={toggles.quotesInvoices} 
                        onClick={() => handleToggle('quotesInvoices')} 
                    />
                </div>
            </div>

            {/* Authentication Section */}
            <div>
                <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-lg font-medium text-gray-700 whitespace-nowrap">Authentication</h2>
                    <div className="h-px bg-gray-200 w-full"></div>
                </div>

                <div>
                    <p className="text-sm font-medium text-gray-700 mb-3">Log out of this pc</p>
                    <button 
                        onClick={handleLogout}
                        className="bg-red-100 text-red-500 hover:bg-red-200 px-12 py-2 rounded-lg font-medium transition-colors"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
}

// Helper component for Toggle Switch
function ToggleItem({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
    return (
        <div className="flex items-center gap-4">
            <button 
                onClick={onClick}
                className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out relative ${active ? 'bg-[#00c065]' : 'bg-gray-300'}`}
            >
                <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${active ? 'translate-x-6' : 'translate-x-0'}`}></div>
            </button>
            <span className="text-gray-700 font-medium">{label}</span>
        </div>
    );
}

export default Settings;
