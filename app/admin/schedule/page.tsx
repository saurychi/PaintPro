"use client";

import React, { useState } from 'react';
import SideNavbar from "@/components/sideNavbar";

// Types
type CalendarDay = {
    day: number;
    currentMonth: boolean;
};

type Event = {
    id: string;
    title: string;
    date: Date;
    type: 'primary' | 'secondary'; // primary = solid green background (selected), secondary = light green pill
};

// Mock Data
const EVENTS: Event[] = [
    { id: '1', title: 'Interior & Ext...', date: new Date(2025, 5, 1), type: 'secondary' },
    { id: '2', title: 'Roof Painting', date: new Date(2025, 5, 2), type: 'primary' },
    { id: '3', title: 'High-Pressure...', date: new Date(2025, 5, 6), type: 'secondary' },
    { id: '4', title: 'Interior & Ext...', date: new Date(2025, 5, 8), type: 'secondary' },
    { id: '5', title: 'Interior & Ext...', date: new Date(2025, 5, 12), type: 'secondary' },
    { id: '6', title: 'Industrial Co...', date: new Date(2025, 5, 15), type: 'secondary' },
    { id: '7', title: 'Interior & Ext...', date: new Date(2025, 5, 18), type: 'secondary' },
    { id: '8', title: 'Wallpapering', date: new Date(2025, 5, 21), type: 'secondary' },
    { id: '9', title: 'Plaster & Pa...', date: new Date(2025, 5, 28), type: 'secondary' },
    { id: '10', title: 'Interior & Ext...', date: new Date(2025, 5, 30), type: 'secondary' },
];

const UPCOMING_JOBS = [
    { date: 'June 6', title: 'High-Pressure Cleaning' },
    { date: 'June 8', title: 'Interior & Exterior Painting' },
    { date: 'June 12', title: 'Interior & Exterior Painting' },
    { date: 'June 15', title: 'Industrial Coating' },
    { date: 'June 18', title: 'Interior & Exterior Painting' },
    { date: 'June 21', title: 'Wallpapering' },
    { date: 'June 28', title: 'Plaster & Patching' },
    { date: 'June 30', title: 'Interior & Exterior Painting' },
    { date: 'July 3', title: 'Epoxy Floor Coating' },
];

// Helper to generate calendar days
const getCalendarDays = (year: number, month: number): CalendarDay[] => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // 0 = Sunday, 1 = Monday, ... 6 = Saturday
    // We want Monday = 0
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: CalendarDay[] = [];
    
    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        days.push({ day: prevMonthLastDay - i, currentMonth: false });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
        days.push({ day: i, currentMonth: true });
    }

    // Next month padding to fill 6 rows (42 cells)
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
        days.push({ day: i, currentMonth: false });
    }

    return days;
};

export default function AdminSchedule() {
    // Default to June 2025 as per image
    const [currentDate, setCurrentDate] = useState(new Date(2025, 5, 1)); 
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const calendarDays = getCalendarDays(year, month);
    
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    // Find event for a specific day
    const getEventForDay = (day: number, isCurrentMonth: boolean) => {
        if (!isCurrentMonth) return null;
        return EVENTS.find(e => 
            e.date.getDate() === day && 
            e.date.getMonth() === month && 
            e.date.getFullYear() === year
        );
    };

    return (
        <div className="flex h-screen bg-white">
            {selectedEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedEvent(null)}>
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-[90%] max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold text-[#1a1a4b]">{selectedEvent.title}</h3>
                            <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                                <p className="text-gray-800 font-medium">{selectedEvent.date ? selectedEvent.date.toDateString() : 'N/A'}</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                                <p className="text-gray-600">This is a placeholder description for the selected event.</p>
                            </div>
                            <div className="pt-4 flex justify-end">
                                <button onClick={() => setSelectedEvent(null)} className="bg-[#00c065] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#00a054] transition-colors">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <SideNavbar activeKey="schedule" />
            
            <main className="flex-1 overflow-auto p-8">
                <h1 className="text-3xl font-bold text-[#1a1a4b] mb-6">Schedule</h1>

                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Calendar Section */}
                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        {/* Header */}
                        <div className="flex justify-center items-center mb-8 relative">
                            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full absolute left-[25%] lg:left-[30%]">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                    <path d="M15 18l-6-6 6-6" />
                                </svg>
                            </button>
                            <h2 className="text-2xl font-bold text-[#00c065]">
                                {monthNames[month]} {year}
                            </h2>
                            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full absolute right-[25%] lg:right-[30%]">
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
                                    <div key={day} className="text-gray-400 text-xs font-medium uppercase p-2 border-b border-gray-100">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {/* Calendar Cells */}
                            <div className="grid grid-cols-7 border-l border-t border-gray-100">
                                {calendarDays.map((dateObj, index) => {
                                    const event = getEventForDay(dateObj.day, dateObj.currentMonth);
                                    // Highlight logic: 
                                    // If event is primary (June 2 in mock), show solid green bg.
                                    // Else if event exists, show text pill.
                                    const isPrimary = event?.type === 'primary';

                                    return (
                                        <div 
                                            key={index} 
                                            onClick={() => event && setSelectedEvent(event)}
                                            className={`
                                                min-h-[100px] border-r border-b border-gray-100 p-2 relative flex flex-col justify-between group hover:bg-gray-50 transition-colors
                                                ${!dateObj.currentMonth ? 'text-gray-300 bg-gray-50/30' : 'text-gray-900'}
                                                ${isPrimary ? '!bg-[#00c065] !text-white hover:!bg-[#00a054] cursor-pointer' : ''}
                                                ${event ? 'cursor-pointer' : ''}
                                            `}
                                        >
                                            <span className="font-semibold text-sm">{dateObj.day}</span>
                                            
                                            {event && (
                                                <div className={`
                                                    mt-2 text-[10px] font-medium px-2 py-1 rounded truncate w-full
                                                    ${isPrimary ? 'bg-white/20 text-white' : 'bg-[#dcfce7] text-[#166534]'}
                                                `}>
                                                    {event.title}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right Sidebar Section */}
                    <div className="w-full lg:w-80 flex flex-col gap-6">
                        {/* Status Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-3 h-3 rounded-full bg-[#00c065]"></div>
                                <span className="text-sm font-medium text-gray-700">Status: Job on-going</span>
                            </div>
                            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                                <div className="text-xl font-bold text-gray-900 mb-1">#0000005D-2025</div>
                                <div className="text-sm text-gray-600 font-medium">Lee House</div>
                            </div>
                        </div>

                        {/* Jobs List */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex-1">
                            <div className="flex items-center gap-2 mb-6">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                                <h3 className="font-bold text-gray-900">Jobs</h3>
                            </div>

                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {UPCOMING_JOBS.map((job, idx) => (
                                    <div 
                                        key={idx} 
                                        className="border border-gray-200 rounded-lg p-3 hover:border-[#00c065] transition-colors cursor-pointer group"
                                        onClick={() => setSelectedEvent({
                                            id: `mock-${idx}`,
                                            title: job.title,
                                            date: new Date(), // Placeholder date
                                            type: 'secondary'
                                        })}
                                    >
                                        <div className="text-xs font-bold text-gray-500 mb-1 group-hover:text-[#00c065]">{job.date}</div>
                                        <div className="text-xs text-gray-700 font-medium">{job.title}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
