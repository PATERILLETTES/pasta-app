import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc, collection, addDoc, deleteDoc, query, getDocs } from 'firebase/firestore';

// --- Helper Functions & Constants ---
const getAppId = () => typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const getFirebaseConfig = () => {
    try {
        return typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "...", authDomain: "...", projectId: "..." };
    } catch (e) {
        console.error("Failed to parse Firebase config:", e);
        return { apiKey: "...", authDomain: "...", projectId: "..." };
    }
};
const getInitialAuthToken = () => typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const toSafeInt = (x, def = 0, max = 1000) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : def;
};

const sanitizePlanData = (raw) => {
  const sessions = toSafeInt(raw?.sessions, 0, 30);
  const activities = Array.from({ length: sessions }, (_, i) => {
    const a = raw?.activities?.[i] ?? {};
    return { text: typeof a.text === 'string' ? a.text : '', isRest: !!a.isRest };
  });
  return { sessions, activities, name: raw?.name || 'My Plan' };
};


// --- Firebase Initialization ---
const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Icon Components ---
const CalendarIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
);
const SettingsIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
);

const ToggleSwitch = ({ isEnabled, onToggle }) => (
    <button
      onClick={onToggle}
      className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 ${isEnabled ? 'bg-green-400' : 'bg-zinc-300'}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-lg transform ring-0 transition ease-in-out duration-200 ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
);


// --- Plan Page Component ---
const PlanPage = ({ userId, activePlanId, plans, handleNewPlan, handleDeletePlan }) => {
    const [planName, setPlanName] = useState('My Plan');
    const [numSessions, setNumSessions] = useState(7);
    const [activities, setActivities] = useState(Array.from({ length: 7 }, () => ({ text: '', isRest: false })));
    const [status, setStatus] = useState({ message: '', type: '' });
    const [isLoading, setIsLoading] = useState(true);

    const planDocRef = useCallback(() => {
        if (!userId || !activePlanId) return null;
        const appId = getAppId();
        return doc(db, `artifacts/${appId}/users/${userId}/plans/${activePlanId}`);
    }, [userId, activePlanId]);

    useEffect(() => {
        setIsLoading(true);
        if (!activePlanId) {
            setPlanName('No Plan Selected');
            setNumSessions(0);
            setActivities([]);
            setIsLoading(false);
            return;
        };
        const docRef = planDocRef();
        if(!docRef) {
            setIsLoading(false);
            return;
        };

        const unsub = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = sanitizePlanData(docSnap.data());
                setPlanName(data.name);
                setNumSessions(data.sessions || 7);
                setActivities(data.activities);
            } else {
                setPlanName('Plan not found');
                setNumSessions(0);
                setActivities([]);
            }
            setIsLoading(false);
        }, err => {
            console.error("Error fetching training plan:", err);
            setStatus({ message: 'Failed to load plan.', type: 'error' });
            setIsLoading(false);
        });
        return () => unsub();
    }, [activePlanId, planDocRef]);

    const updateNumSessions = (newValue) => {
        let value = toSafeInt(newValue, 1, 30);
        if (value < 1) value = 1;
        if (value > 30) value = 30;

        setNumSessions(value);
        setActivities(currentActivities => {
            return Array.from({ length: value }, (_, i) => ({
                text: currentActivities[i]?.text ?? '',
                isRest: !!currentActivities[i]?.isRest,
            }));
        });
    };

    const handleActivityChange = (index, field, value) => {
        const newActivities = activities.map((activity, i) => {
            if (i === index) {
                const updatedActivity = { ...activity, [field]: value };
                if (field === 'isRest' && value === true) {
                    updatedActivity.text = '';
                }
                return updatedActivity;
            }
            return activity;
        });
        setActivities(newActivities);
    };

    const handleSavePlan = async () => {
        const docRef = planDocRef();
        if (!docRef) {
            setStatus({ message: 'No active plan to save.', type: 'error' });
            return;
        }
        try {
            const planSnap = await getDoc(docRef);
            const oldPlan = planSnap.exists() ? sanitizePlanData(planSnap.data()) : { sessions: 0, activities: [], name: 'Default' };
            
            const trackingDocRef = doc(db, `artifacts/${getAppId()}/users/${userId}/trackingData/${activePlanId}`);
            const trackingSnap = await getDoc(trackingDocRef);
            const trackingData = trackingSnap.exists() ? trackingSnap.data() : { currentCycleIndex: 0 };
            const currentCycleIndex = trackingData.currentCycleIndex;

            const sessions = toSafeInt(numSessions, 1, 30);
            const finalActivities = Array.from({ length: sessions }, (_, i) => {
                const a = activities[i] || { text: '', isRest: false };
                const text = !a.isRest && (a.text ?? '').trim() === '' ? 'Free' : (a.text ?? 'Free');
                return { text, isRest: !!a.isRest };
            });
            const newPlan = { name: planName, sessions, activities: finalActivities };

            const hasChanged = JSON.stringify(oldPlan.activities) !== JSON.stringify(newPlan.activities) || oldPlan.sessions !== newPlan.sessions || oldPlan.name !== newPlan.name;

            if (hasChanged && oldPlan.sessions > 0) {
                await setDoc(trackingDocRef, {
                    planHistory: {
                        ...(trackingData.planHistory || {}),
                        [currentCycleIndex]: oldPlan
                    }
                }, { merge: true });
            }

            await setDoc(docRef, newPlan);

            setStatus({ message: 'Plan saved successfully!', type: 'success' });
            setTimeout(() => setStatus({ message: '', type: '' }), 3000);
        } catch (error) {
            console.error("Error saving plan:", error);
            setStatus({ message: 'Failed to save plan.', type: 'error' });
        }
    };
    
    if (isLoading) {
        return <div className="p-4 text-center"><p className="text-zinc-600 font-semibold">Loading Plan...</p></div>;
    }

    if (!activePlanId) {
        return (
            <div className="p-4 text-center">
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg">
                    <p className="text-zinc-700 font-bold text-lg">No Plan Selected</p>
                    <p className="text-zinc-500 mt-2">Create a new plan to get started.</p>
                </div>
                 <div className="mt-8 flex justify-center gap-4">
                    <button onClick={handleNewPlan} className="bg-green-500 text-white font-bold py-3 px-6 rounded-full shadow-lg hover:bg-green-600 transition">New Plan</button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6">
             <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-lg">
                <label htmlFor="planName" className="block text-md font-bold text-zinc-700 mb-2">Plan Name</label>
                <input id="planName" type="text" value={planName} onChange={(e) => setPlanName(e.target.value)} className="w-full px-4 py-2 bg-zinc-100 border-2 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition" />
            </div>

            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-lg flex items-center justify-between">
                <label className="text-md font-bold text-zinc-700">Cycle Length</label>
                <div className="flex items-center gap-2">
                    <button onClick={() => updateNumSessions(numSessions - 1)} className="w-10 h-10 rounded-full bg-zinc-200 text-zinc-700 font-bold text-xl flex items-center justify-center hover:bg-zinc-300 transition">-</button>
                    <span className="w-12 text-center bg-transparent text-zinc-800 font-bold text-lg">{numSessions}</span>
                    <button onClick={() => updateNumSessions(numSessions + 1)} className="w-10 h-10 rounded-full bg-zinc-200 text-zinc-700 font-bold text-xl flex items-center justify-center hover:bg-zinc-300 transition">+</button>
                </div>
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-lg space-y-1">
                <h2 className="text-xl font-bold text-zinc-800 p-2 mb-2">Define Your Sessions</h2>
                {activities.map((activity, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 rounded-xl transition-colors hover:bg-pink-50/50">
                        <span className="font-bold text-pink-500 w-8 text-center text-sm">{index + 1}#</span>
                        <input type="text" value={activity.text} onChange={(e) => handleActivityChange(index, 'text', e.target.value)} disabled={activity.isRest} placeholder="Activity..." className="flex-1 px-4 py-2 bg-zinc-100 border-2 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition disabled:bg-zinc-200" />
                        <div className="flex items-center gap-3">
                             <span className="text-sm font-semibold text-zinc-600">Rest</span>
                             <ToggleSwitch isEnabled={activity.isRest} onToggle={() => handleActivityChange(index, 'isRest', !activity.isRest)} />
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={handleSavePlan} className="w-full bg-pink-500 text-white font-bold text-lg py-4 px-4 rounded-2xl shadow-lg hover:bg-pink-600 focus:outline-none focus:ring-4 focus:ring-pink-400 focus:ring-opacity-50 transition-all duration-300 transform hover:scale-105">
                Save Plan
            </button>
            {status.message && <div className={`mt-4 p-3 rounded-xl text-center font-semibold text-white ${status.type === 'success' ? 'bg-green-500' : 'bg-pink-500'}`}>{status.message}</div>}
            
            <div className="pt-4 flex justify-end gap-4">
                <button onClick={handleNewPlan} className="bg-green-500 text-white font-bold py-3 px-6 rounded-full shadow-lg hover:bg-green-600 transition">New Plan</button>
                <button onClick={handleDeletePlan} disabled={plans.length <= 1} className="bg-red-500 text-white font-bold py-3 px-6 rounded-full shadow-lg hover:bg-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed">Delete Plan</button>
            </div>
        </div>
    );
};

// --- Helper to get the correct historical plan for a given cycle ---
const getPlanForCycle = (cycleIndex, currentPlan, planHistory = {}) => {
    let applicableKey = Infinity;
    for (const key in planHistory) {
        const historyCycleIndex = parseInt(key, 10);
        if (historyCycleIndex > cycleIndex && historyCycleIndex < applicableKey) {
            applicableKey = historyCycleIndex;
        }
    }
    if (applicableKey !== Infinity) {
        return sanitizePlanData(planHistory[applicableKey]);
    }
    return currentPlan;
};

// --- Tracking Chart Component ---
const TrackingChart = ({ plan, trackingData }) => {
    const { grid = [], planHistory = {} } = trackingData || {};
    const sessions = toSafeInt(plan?.sessions);
    const currentCycleIndex = toSafeInt(trackingData?.currentCycleIndex);
    if (sessions <= 0) return null;

    const chartData = Array.from({ length: currentCycleIndex + 1 }, (_, cycleIdx) => {
        const planForThisCycle = getPlanForCycle(cycleIdx, plan, planHistory);
        let done = 0, partial = 0, missed = 0;
        
        if (planForThisCycle && Array.isArray(planForThisCycle.activities)) {
            planForThisCycle.activities.forEach((activity, sessionIdx) => {
                if (!activity.isRest) {
                    const status = grid?.[sessionIdx]?.row?.[cycleIdx] ?? 0;
                    if (status === 1) done++;
                    else if (status === 2) partial++;
                    else if (status === 3) missed++;
                }
            });
        }
        return { done, partial, missed };
    });

    const maxPositive = Math.max(...chartData.map(d => d.done + d.partial), 1);
    const maxNegative = Math.max(...chartData.map(d => d.missed), 1);
    const totalHeight = 200;
    const positiveHeight = totalHeight * (maxPositive / (maxPositive + maxNegative));
    const negativeHeight = totalHeight - positiveHeight;

    return (
        <div className="p-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg mt-6">
            <h3 className="font-bold text-xl mb-4 text-zinc-700">Cycle Summary</h3>
            <div className="flex" style={{ height: `${totalHeight}px` }}>
                {chartData.map((data, index) => (
                    <div key={index} className="flex-1 flex flex-col justify-end items-center px-1.5">
                        <div className="w-full h-full flex flex-col justify-end">
                            <div style={{ height: `${positiveHeight}px` }} className="w-full flex flex-col justify-end rounded-t-md overflow-hidden">
                                <div className="bg-yellow-300" style={{ height: `${(data.partial / maxPositive) * 100}%` }}></div>
                                <div className="bg-green-400" style={{ height: `${(data.done / maxPositive) * 100}%` }}></div>
                            </div>
                            <div className="w-full h-0.5 bg-zinc-200 my-1"></div>
                            <div style={{ height: `${negativeHeight}px` }} className="w-full rounded-b-md overflow-hidden">
                                <div className="bg-pink-400" style={{ height: `${(data.missed / maxNegative) * 100}%` }}></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex mt-2">
                {chartData.map((_, index) => (
                    <div key={index} className="flex-1 text-center text-xs text-zinc-500 font-bold">C{index + 1}</div>
                ))}
            </div>
             <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm font-semibold">
                <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-green-400 mr-2"></span>Done</div>
                <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-yellow-300 mr-2"></span>Partial</div>
                <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-pink-400 mr-2"></span>Missed</div>
            </div>
        </div>
    );
};

// --- Tracking Page Component ---
const TrackingPage = ({ userId, activePlanId }) => {
    const [plan, setPlan] = useState(null);
    const [trackingData, setTrackingData] = useState(null);

    const statusColors = ['bg-zinc-200 hover:bg-zinc-300', 'bg-green-300 hover:bg-green-400', 'bg-yellow-300 hover:bg-yellow-400', 'bg-pink-300 hover:bg-pink-400'];

    useEffect(() => {
        if (!userId || !activePlanId) {
            setPlan({ sessions: 0, activities: [] });
            setTrackingData({ grid: [], currentCycleIndex: 0, planHistory: {}, highestCycleIndex: 0 });
            return;
        }
        const appId = getAppId();
        const planDocRef = doc(db, `artifacts/${appId}/users/${userId}/plans/${activePlanId}`);
        const trackingDocRef = doc(db, `artifacts/${appId}/users/${userId}/trackingData/${activePlanId}`);

        const unsubPlan = onSnapshot(planDocRef, (docSnap) => {
            setPlan(docSnap.exists() ? sanitizePlanData(docSnap.data()) : { sessions: 0, activities: [] });
        });
        const unsubTracking = onSnapshot(trackingDocRef, (docSnap) => {
            const raw = docSnap.exists() ? docSnap.data() : {};
            setTrackingData({
                grid: Array.isArray(raw.grid) ? raw.grid : [],
                currentCycleIndex: toSafeInt(raw.currentCycleIndex, 0),
                highestCycleIndex: toSafeInt(raw.highestCycleIndex, 0),
                planHistory: raw.planHistory || {},
            });
        });

        return () => { unsubPlan(); unsubTracking(); };
    }, [userId, activePlanId]);

    const handleCellClick = async (sessionIndex, colIndex) => {
        if (!userId || !trackingData || colIndex !== toSafeInt(trackingData.currentCycleIndex) || !plan || !activePlanId) return;

        const baseGrid = Array.isArray(trackingData?.grid) ? trackingData.grid : [];
        const newGrid = baseGrid.map(item => ({ row: Array.isArray(item?.row) ? [...item.row] : [] }));

        while (newGrid.length < plan.sessions) newGrid.push({ row: [] });
        const currentSessionRow = (newGrid[sessionIndex] && newGrid[sessionIndex].row) ? [...newGrid[sessionIndex].row] : [];
        while(currentSessionRow.length <= colIndex) currentSessionRow.push(0);
        
        const currentValue = currentSessionRow[colIndex] || 0;
        currentSessionRow[colIndex] = (currentValue + 1) % 4;
        newGrid[sessionIndex] = { row: currentSessionRow };

        try {
            const appId = getAppId();
            const trackingDocRef = doc(db, `artifacts/${appId}/users/${userId}/trackingData/${activePlanId}`);
            const dataToSave = {
                ...trackingData,
                grid: newGrid,
            };
            await setDoc(trackingDocRef, dataToSave);
        } catch (error) {
            console.error("Error updating tracking data:", error);
        }
    };

    const handleCycleChange = async (direction) => {
        if (!userId || !trackingData || !activePlanId) return;
        const currentCycle = toSafeInt(trackingData.currentCycleIndex);
        const highestCycle = toSafeInt(trackingData.highestCycleIndex);
        let newCycleIndex = direction === 'next' ? currentCycle + 1 : currentCycle - 1;
        if (newCycleIndex < 0) newCycleIndex = 0;

        try {
            const appId = getAppId();
            const trackingDocRef = doc(db, `artifacts/${appId}/users/${userId}/trackingData/${activePlanId}`);
            const dataToSave = {
                ...trackingData,
                currentCycleIndex: newCycleIndex,
                highestCycleIndex: Math.max(highestCycle, newCycleIndex)
            };
            await setDoc(trackingDocRef, dataToSave);
        } catch (error) {
            console.error("Error changing cycle:", error);
        }
    };


    if (!plan || !trackingData) {
        return (
            <div className="p-4 text-center">
                <p className="text-zinc-600 font-semibold">Loading...</p>
            </div>
        );
    }
    
    const numSessions = toSafeInt(plan.sessions);
    if (numSessions <= 0) {
         return (
            <div className="p-4 text-center">
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg">
                    <p className="text-zinc-700 font-bold text-lg">No training plan found.</p>
                    <p className="text-zinc-500 mt-2">Select a plan, or create a new one to get started.</p>
                </div>
            </div>
        );
    }

    const currentCycleIndex = toSafeInt(trackingData.currentCycleIndex);
    const highestCycleIndex = toSafeInt(trackingData.highestCycleIndex);
    const numColumns = Math.max(1, highestCycleIndex + 2);

    return (
        <div className="p-2 md:p-4">
            <div className="overflow-x-auto pb-4">
                <table className="min-w-full border-separate" style={{ borderSpacing: "0 0.5rem" }}>
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-transparent p-2 text-sm font-bold text-zinc-500 z-10 w-32 text-left">Session</th>
                            {[...Array(numColumns)].map((_, i) => (
                                <th key={i} className={`p-2 text-sm font-bold w-24 min-w-[6rem] ${i === currentCycleIndex ? 'text-pink-500' : 'text-zinc-500'}`}>Cycle {i + 1}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[...Array(numSessions)].map((_, sessionIndex) => {
                            const currentActivity = plan.activities[sessionIndex];
                            const isRest = currentActivity?.isRest;
                            return (
                                <tr key={sessionIndex}>
                                    <td className={`sticky left-0 p-3 z-10 w-32 bg-white/80 backdrop-blur-sm rounded-l-2xl shadow-md`}>
                                        <div className={`font-bold text-zinc-800`}>{currentActivity?.text || 'No activity'}</div>
                                        <div className="text-zinc-500 truncate text-xs font-medium">{sessionIndex + 1}#</div>
                                    </td>
                                    {[...Array(numColumns)].map((_, colIndex) => {
                                        const planForThisCycle = getPlanForCycle(colIndex, plan, trackingData.planHistory);
                                        const activityForThisCycle = planForThisCycle.activities ? planForThisCycle.activities[sessionIndex] : undefined;
                                        const isHistoricalAndDifferent = colIndex < currentCycleIndex && (!activityForThisCycle || JSON.stringify(activityForThisCycle) !== JSON.stringify(currentActivity));
                                        
                                        const status = trackingData?.grid?.[sessionIndex]?.row?.[colIndex] ?? 0;
                                        const isClickable = !isRest && colIndex === currentCycleIndex;
                                        const isNextCycle = colIndex > currentCycleIndex;
                                        
                                        const historicalStyle = {
                                            backgroundImage: isHistoricalAndDifferent ? `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.1' fill-rule='evenodd'%3E%3Cpath d='M5 0h1L0 6V5zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")` : 'none'
                                        };

                                        return (
                                            <td key={colIndex} className={`p-1 w-24 min-w-[6rem] ${colIndex === numColumns - 1 ? 'rounded-r-2xl' : ''} bg-white/80 backdrop-blur-sm shadow-md`}>
                                                <button onClick={() => isClickable && handleCellClick(sessionIndex, colIndex)} disabled={!isClickable} style={historicalStyle} className={`w-full h-12 sm:h-16 rounded-xl transition-all duration-200 ${isRest ? 'bg-zinc-300 line-through' : statusColors[status]} ${isClickable ? 'cursor-pointer transform hover:scale-105' : 'cursor-not-allowed'} ${isNextCycle ? 'opacity-40' : 'opacity-100'}`} aria-label={`Session ${sessionIndex + 1}, Cycle ${colIndex + 1}`} />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="mt-6 flex justify-center items-center gap-4">
                 <button onClick={() => handleCycleChange('prev')} disabled={currentCycleIndex === 0} className="bg-white text-zinc-700 font-bold py-3 px-6 rounded-full shadow-lg hover:bg-zinc-50 focus:outline-none focus:ring-4 focus:ring-zinc-400 focus:ring-opacity-50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                    Previous
                </button>
                <button onClick={() => handleCycleChange('next')} className="bg-pink-500 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-pink-600 focus:outline-none focus:ring-4 focus:ring-pink-400 focus:ring-opacity-50 transition-all duration-300 transform hover:scale-105">
                    Next Cycle
                </button>
            </div>
            <TrackingChart plan={plan} trackingData={trackingData} />
        </div>
    );
};

// --- Main App Component ---
export default function App() {
    const [page, setPage] = useState('plan');
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isLogoExpanded, setIsLogoExpanded] = useState(false);
    const [plans, setPlans] = useState([]);
    const [activePlanId, setActivePlanId] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        const initialAuthToken = getInitialAuthToken();
        const signInUser = async () => {
            try {
                if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
                else await signInAnonymously(auth);
            } catch (error) {
                console.error("Auth failed, trying fallback:", error);
                try { await signInAnonymously(auth); } catch (e) { console.error("Fallback auth failed", e); }
            }
        };
        signInUser();
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUserId(user ? user.uid : null);
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!userId) return;
        const appId = getAppId();
        const plansCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/plans`);
        const unsubPlans = onSnapshot(plansCollectionRef, (snapshot) => {
            const plansData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlans(plansData);
            
            if (!activePlanId && plansData.length > 0) {
                setActivePlanId(plansData[0].id);
            } else if (plansData.length === 0) {
                setActivePlanId(null);
            }
        });

        return () => unsubPlans();
    }, [userId, activePlanId]);
    
    const handleSelectPlan = (planId) => {
        setActivePlanId(planId);
        setShowDropdown(false);
    }
    
    const handleNewPlan = async () => {
        if (!userId) return;
        const newPlanName = `New Plan ${plans.length + 1}`;
        const appId = getAppId();
        const plansCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/plans`);
        const newPlanDoc = await addDoc(plansCollectionRef, {
            name: newPlanName,
            sessions: 7,
            activities: Array.from({ length: 7 }, () => ({ text: 'Free', isRest: false })),
        });

        const trackingDocRef = doc(db, `artifacts/${appId}/users/${userId}/trackingData/${newPlanDoc.id}`);
        await setDoc(trackingDocRef, {
            grid: Array.from({ length: 7 }, () => ({ row: [] })),
            currentCycleIndex: 0,
            highestCycleIndex: 0,
            planHistory: {},
        });

        setActivePlanId(newPlanDoc.id);
    };
    
    const handleDeletePlan = async () => {
        if (!userId || !activePlanId || plans.length <= 1) return;
        const appId = getAppId();
        const planDocRef = doc(db, `artifacts/${appId}/users/${userId}/plans/${activePlanId}`);
        const trackingDocRef = doc(db, `artifacts/${appId}/users/${userId}/trackingData/${activePlanId}`);
        
        await deleteDoc(planDocRef);
        await deleteDoc(trackingDocRef);

        const remainingPlans = plans.filter(p => p.id !== activePlanId);
        setActivePlanId(remainingPlans.length > 0 ? remainingPlans[0].id : null);
    };


    const NavButton = ({ targetPage, label, icon }) => {
        const isActive = page === targetPage;
        return (
            <button onClick={() => setPage(targetPage)} className={`flex-1 flex flex-col items-center justify-center p-2 transition-colors duration-300 ${isActive ? 'text-pink-500' : 'text-zinc-400 hover:text-pink-500'}`}>
                {icon}
                <span className={`text-xs font-bold`}>{label}</span>
            </button>
        );
    };
    
    const activePlan = plans.find(p => p.id === activePlanId);

    return (
        <div className="font-sans antialiased text-zinc-800">
             <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');
                body { font-family: 'Poppins', sans-serif; }
            `}</style>
            <div className="min-h-screen bg-gradient-to-br from-pink-100 to-green-100">
                <header className="p-4 flex justify-between items-center">
                    <h1 onClick={() => setIsLogoExpanded(!isLogoExpanded)} className="text-4xl md:text-5xl font-extrabold text-pink-500 tracking-tighter flex items-baseline justify-start cursor-pointer select-none">
                        P<span className="inline-block transform scale-y-[-1]">A</span>ST<span className="inline-block transform scale-y-[-1]">A</span>
                        <span className={`transition-all duration-500 ease-in-out overflow-hidden ${isLogoExpanded ? 'max-w-xl ml-3' : 'max-w-0'}`}>
                           <span className="text-xl md:text-2xl font-semibold text-zinc-600 whitespace-nowrap">is Another Sport Tracking App</span>
                        </span>
                    </h1>
                    <div className="relative">
                        <button onClick={() => setShowDropdown(!showDropdown)} className="flex items-center gap-2 bg-white/80 backdrop-blur-sm p-2 rounded-full shadow-md">
                            <span className="font-bold text-zinc-700 pl-2">{activePlan ? activePlan.name : "Select Plan"}</span>
                            <svg className={`w-5 h-5 text-zinc-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                        {showDropdown && (
                            <div className="absolute right-0 mt-2 w-56 bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl z-10">
                                <div className="p-2">
                                {plans.map(plan => (
                                    <button key={plan.id} onClick={() => handleSelectPlan(plan.id)} className={`w-full text-left px-4 py-2 rounded-lg font-semibold ${activePlanId === plan.id ? 'bg-pink-100 text-pink-600' : 'text-zinc-700 hover:bg-zinc-100'}`}>
                                        {plan.name}
                                    </button>
                                ))}
                                </div>
                            </div>
                        )}
                    </div>
                </header>
                <main className="max-w-4xl mx-auto pb-24">
                    {isAuthReady ? (userId ? (page === 'plan' ? <PlanPage userId={userId} activePlanId={activePlanId} plans={plans} handleNewPlan={handleNewPlan} handleDeletePlan={handleDeletePlan} /> : <TrackingPage userId={userId} activePlanId={activePlanId} />) : <div className="p-4 text-center text-pink-500 font-semibold">Authentication failed. Please refresh.</div>) : <div className="p-4 text-center text-zinc-500 font-semibold">Loading...</div>}
                </main>
                
                <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-zinc-200">
                    <div className="flex max-w-4xl mx-auto h-20">
                        <NavButton targetPage="tracking" label="Tracking" icon={<CalendarIcon className="w-8 h-8" />} />
                        <NavButton targetPage="plan" label="Plan" icon={<SettingsIcon className="w-8 h-8" />} />
                    </div>
                </footer>
            </div>
        </div>
    );
}
