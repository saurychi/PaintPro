"use client";

import React, { useState } from 'react';

// Helper to generate calendar days
const getCalendarDays = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // 0 = Sunday, 1 = Monday, ... 6 = Saturday
    // Adjust to make Monday = 0, Sunday = 6
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days = [];
    
    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        days.push({ day: prevMonthLastDay - i, currentMonth: false });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
        days.push({ day: i, currentMonth: true });
    }

    // Next month padding
    const remainingCells = 42 - days.length; // 6 rows * 7 cols
    for (let i = 1; i <= remainingCells; i++) {
        days.push({ day: i, currentMonth: false });
    }

    return days;
};

// Mock data relative to current date
const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth();

const jobs = [
    {
        id: '1',
        date: new Date(currentYear, currentMonth, 15).toDateString().slice(4, 10),
        title: 'High-Pressure Cleaning',
        description: 'Removing mold, dirt, and grime from exterior surfaces.',
        startDate: new Date(currentYear, currentMonth, 15),
        endDate: new Date(currentYear, currentMonth, 15)
    },
    {
        id: '2',
        date: new Date(currentYear, currentMonth, 16).toDateString().slice(4, 10),
        title: 'Interior & Exterior Painting',
        description: 'Complete interior and exterior painting including trims and doors.',
        startDate: new Date(currentYear, currentMonth, 16),
        endDate: new Date(currentYear, currentMonth, 16)
    },
    {
        id: '3',
        date: new Date(currentYear, currentMonth, 17).toDateString().slice(4, 10),
        title: 'Interior & Exterior Painting',
        description: 'Continuing painting work.',
        startDate: new Date(currentYear, currentMonth, 17),
        endDate: new Date(currentYear, currentMonth, 17)
    }
];

const currentJob = {
    id: '#0000005D-2025',
    name: 'Lee House',
    status: 'Job on-going'
};

function Schedule() {
    const [selectedJob, setSelectedJob] = useState<any>(null);
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const calendarDays = getCalendarDays(year, month);

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const prevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    // Check if a day has an event
    const getEventForDay = (day: number, isCurrentMonth: boolean) => {
        if (!isCurrentMonth) return null;
        
        const job = jobs.find(j => 
            j.startDate.getDate() === day && 
            j.startDate.getMonth() === month && 
            j.startDate.getFullYear() === year
        );

        if (job) return job;
        
        return null;
    };

    return (
        <div className="flex flex-col h-full relative">
            {selectedJob && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedJob(null)}>
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-[90%] max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold text-[#1a1a4b]">{selectedJob.title}</h3>
                            <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                                <p className="text-gray-800 font-medium">{selectedJob.date || `${monthNames[month]} ${selectedJob.day}, ${year}`}</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                                <p className="text-gray-600">{selectedJob.description || "No description available."}</p>
                            </div>
                            <div className="pt-4 flex justify-end">
                                <button onClick={() => setSelectedJob(null)} className="bg-[#00c065] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#00a054] transition-colors">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <h1 className="text-3xl font-bold text-[#1a1a4b] mb-6">Schedule</h1>

            <div className="flex flex-col lg:flex-row gap-6 h-full">
                {/* Calendar Section */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    {/* Header */}
                    <div className="flex justify-center items-center mb-8 relative">
                        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full absolute left-1/3">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        </button>
                        <h2 className="text-2xl font-bold text-[#00c065]">
                            {monthNames[month]} {year}
                        </h2>
                        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full absolute right-1/3">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                        </button>
                    </div>

                    {/* Grid */}
                    <div className="w-full">
                        {/* Days Header */}
                        <div className="grid grid-cols-7 mb-4">
                            {['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT', 'SUN'].map(day => (
                                <div key={day} className="text-gray-400 text-sm font-medium uppercase p-2 border-b border-gray-100">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar Cells */}
                        <div className="grid grid-cols-7 auto-rows-fr">
                            {calendarDays.map((dateObj, index) => {
                                const event = getEventForDay(dateObj.day, dateObj.currentMonth);
                                const isGreen = !!event;

                                return (
                                    <div 
                                        key={index} 
                                        onClick={() => event && setSelectedJob({ ...event, day: dateObj.day })}
                                        className={`
                                            min-h-[100px] border border-gray-100 p-2 relative cursor-pointer hover:bg-gray-50 transition-colors
                                            ${!dateObj.currentMonth ? 'bg-gray-50/50 text-gray-300' : 'text-gray-800'}
                                            ${isGreen ? 'bg-[#00c065] text-white border-[#00c065] hover:bg-[#00a054]' : ''}
                                        `}
                                    >
                                        <span className="font-semibold">{dateObj.day}</span>
                                        {isGreen && (
                                            <div className="mt-8 text-xs font-medium bg-white/20 backdrop-blur-sm rounded px-1 py-0.5 truncate">
                                                {event.title}...
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Sidebar Section */}
                <div className="w-full lg:w-80 flex flex-col gap-6">
                    {/* Status Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-[#00c065]"></div>
                            <span className="text-sm font-medium text-gray-700">Status: {currentJob.status}</span>
                        </div>
                        <div className="border border-gray-200 rounded-lg p-4">
                            <div className="text-xl font-bold text-gray-900 mb-1">{currentJob.id}</div>
                            <div className="text-sm text-gray-600">{currentJob.name}</div>
                        </div>
                    </div>

                    {/* Jobs List */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex-1">
                        <div className="flex items-center gap-2 mb-6">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            <h3 className="font-bold text-gray-900">Jobs</h3>
                        </div>

                        <div className="space-y-4">
                            {jobs.map((job) => (
                                <div key={job.id} className="border border-gray-200 rounded-lg p-3">
                                    <div className="text-sm font-bold text-gray-800 mb-1">{job.date}</div>
                                    <div className="text-xs text-gray-500">{job.title}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Schedule;
