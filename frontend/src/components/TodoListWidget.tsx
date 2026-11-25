import React, { useState, useEffect, useCallback } from 'react';
import { HudCard } from './HudCard';
import { ShellMetalId } from '../utils/metalThemes';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { soundManager } from '../utils/audio';
import { Trash2, Plus, Play, Loader2, Bot, Bell, Clock, Repeat } from 'lucide-react';

interface TodoListWidgetProps {
  shellMetal?: ShellMetalId;
  neonTheme?: NeonColorId;
  externalTask?: {
    task_id?: string;
    title?: string;
    status?: string;
    progress?: number;
    details?: string;
  } | null;
}

export interface ReminderTask {
  id: string;
  title: string;
  action: 'notify' | 'execute_agent';
  recurring: 'once' | 'daily';
  scheduled_iso: string;
  scheduled_display: string;
  goal?: string;
  priority: 'CRITICAL' | 'HIGH' | 'ROUTINE';
  status: 'scheduled' | 'running' | 'done' | 'failed';
  created_at?: string;
  last_triggered?: string | null;
}

export const TodoListWidget: React.FC<TodoListWidgetProps> = ({
  shellMetal = 'gold',
  neonTheme = 'amber',
  externalTask = null,
}) => {
  const neon = getNeonTheme(neonTheme);
  const [activeTab, setActiveTab] = useState<'tasks' | 'new'>('tasks');
  const [tasks, setTasks] = useState<ReminderTask[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [bannerAlert, setBannerAlert] = useState<string | null>(null);

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('+15m');
  const [newAction, setNewAction] = useState<'notify' | 'execute_agent'>('notify');
  const [newRecurring, setNewRecurring] = useState<'once' | 'daily'>('daily');
  const [newPriority, setNewPriority] = useState<'CRITICAL' | 'HIGH' | 'ROUTINE'>('HIGH');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch reminders from persistent backend
  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.tasks) ? data.tasks : []);
        setTasks(list);
      }
    } catch {
      // ignore network glitch
    }
  }, []);

  // Poll backend every 5 seconds for updates & due executions
  useEffect(() => {
    fetchReminders();
    const interval = setInterval(fetchReminders, 8000);
    return () => clearInterval(interval);
  }, [fetchReminders]);

  // Create new persistent task / reminder
  const handleCreateReminder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTitle.trim()) return;

    soundManager.playClick();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          time: newTime.trim(),
          action: newAction,
          recurring: newRecurring,
          goal: newTitle.trim(),
          priority: newPriority,
        }),
      });

      if (res.ok) {
        soundManager.playPulse();
        setNewTitle('');
        setNewTime('+15m');
        setActiveTab('tasks');
        await fetchReminders();
      }
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete task from persistent storage
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    soundManager.playClick();
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      }
    } catch {
      // ignore
    }
  };

  // Trigger task immediately (test or force-run)
  const handleTriggerNow = async (e: React.MouseEvent, task: ReminderTask) => {
    e.stopPropagation();
    if (executingId) return;

    soundManager.playClick();
    setExecutingId(task.id);
    setBannerAlert(`TRIGGERING: ${task.title}`);

    try {
      const res = await fetch(`/api/reminders/${task.id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          goal: task.goal || task.title,
          action: task.action,
        }),
      });

      if (res.ok) {
        soundManager.playPulse();
        setBannerAlert(`EXECUTED: ${task.title}`);
        setTimeout(() => setBannerAlert(null), 3500);
        await fetchReminders();
      } else {
        setBannerAlert(`FAILED: ${task.title}`);
        setTimeout(() => setBannerAlert(null), 3000);
      }
    } catch {
      setBannerAlert(`NET ERROR: ${task.title}`);
      setTimeout(() => setBannerAlert(null), 3000);
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <HudCard tag="PORT_05 // TASK_MATRIX" dockSide="right" shellMetal={shellMetal}>
      <div className="flex flex-col h-full flex-1 select-none justify-between">
        
        {/* Header with Title and Mode Switcher */}
        <div className="flex items-center justify-between pb-1 border-b border-stone-800/80 gap-1">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span 
              className={`w-2 h-2 rounded-full flex-shrink-0 ${executingId ? 'animate-ping' : ''}`}
              style={{ backgroundColor: neon.glowColor, boxShadow: `0 0 8px ${neon.glowColor}` }}
            />
            <span 
              className="font-orbitron font-bold tracking-wider text-[11px] uppercase whitespace-nowrap truncate"
              style={{ color: neon.glowColor }}
            >
              MISSION & REMINDER MATRIX
            </span>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0 font-tech">
            <button
              onClick={() => {
                soundManager.playClick();
                setActiveTab('tasks');
              }}
              className="px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer border flex items-center space-x-0.5"
              style={{
                backgroundColor: activeTab === 'tasks' ? `${neon.glowColor}25` : 'transparent',
                borderColor: activeTab === 'tasks' ? neon.glowColor : '#44403c',
                color: activeTab === 'tasks' ? neon.glowColor : '#a8a29e',
              }}
            >
              <Clock className="w-2.5 h-2.5 inline mr-0.5" />
              <span>TASKS ({tasks.length})</span>
            </button>

            <button
              onClick={() => {
                soundManager.playClick();
                setActiveTab('new');
              }}
              className="px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer border flex items-center space-x-0.5"
              style={{
                backgroundColor: activeTab === 'new' ? `${neon.glowColor}25` : 'transparent',
                borderColor: activeTab === 'new' ? neon.glowColor : '#44403c',
                color: activeTab === 'new' ? neon.glowColor : '#a8a29e',
              }}
            >
              <Plus className="w-2.5 h-2.5 inline mr-0.5" />
              <span>+ NEW</span>
            </button>
          </div>
        </div>

        {/* Temporary Alert Banner */}
        {bannerAlert && (
          <div 
            className="px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide truncate border text-center animate-pulse"
            style={{
              borderColor: neon.glowColor,
              backgroundColor: `${neon.glowColor}20`,
              color: neon.glowColor,
            }}
          >
            {bannerAlert}
          </div>
        )}

        {/* TAB 1: PERSISTENT TASKS LIST */}
        {activeTab === 'tasks' && (
          <div className="flex-1 overflow-y-auto my-1 space-y-1 no-scrollbar max-h-[115px] font-tech">
            {externalTask && (
              <div className="p-1 px-1.5 border bg-black/60 rounded" style={{ borderColor: `${neon.glowColor}88` }}>
                <div className="flex justify-between gap-2 text-[9px] font-bold" style={{ color: neon.glowColor }}>
                  <span className="truncate flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin inline" />
                    {externalTask.title || externalTask.task_id || 'AGENT EXECUTION'}
                  </span>
                  <span>{Math.max(0, Math.min(100, externalTask.progress || 0))}%</span>
                </div>
                <div className="mt-0.5 h-1 bg-stone-900 overflow-hidden rounded">
                  <div className="h-full transition-all" style={{ width: `${Math.max(0, Math.min(100, externalTask.progress || 0))}%`, backgroundColor: neon.glowColor }} />
                </div>
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-stone-500 text-[10px] py-4 text-center">
                <Clock className="w-4 h-4 mb-1 opacity-40" />
                <span>NO PENDING MISSIONS // CLICK '+ NEW' TO SCHEDULE</span>
              </div>
            ) : (
              tasks.map((t) => {
                const isAgent = t.action === 'execute_agent';
                const isDaily = t.recurring === 'daily';
                const isRunning = executingId === t.id;

                return (
                  <div
                    key={t.id}
                    className="p-1 px-1.5 rounded border border-stone-800 bg-stone-950/80 hover:border-stone-700 transition-all flex items-center justify-between group/task"
                  >
                    {/* Left: Type Icon + Title */}
                    <div className="flex items-center space-x-1.5 flex-1 min-w-0">
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border"
                        style={{
                          borderColor: isAgent ? '#06b6d4' : neon.glowColor,
                          backgroundColor: isAgent ? 'rgba(6, 182, 212, 0.15)' : `${neon.glowColor}15`,
                        }}
                        title={isAgent ? 'Autonomous Agent Mission' : 'Desktop Alarm Reminder'}
                      >
                        {isAgent ? (
                          <Bot className="w-2.5 h-2.5 text-cyan-400" />
                        ) : (
                          <Bell className="w-2.5 h-2.5" style={{ color: neon.glowColor }} />
                        )}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[10px] truncate text-stone-200 font-medium">
                          {t.title}
                        </span>
                        <div className="flex items-center space-x-1 text-[8px] text-stone-400">
                          <span className="text-amber-300 font-mono">{t.scheduled_display}</span>
                          {isDaily && (
                            <span className="text-emerald-400 flex items-center gap-0.5">
                              <Repeat className="w-2 h-2 inline" /> DAILY
                            </span>
                          )}
                          <span className="text-stone-500">• {isAgent ? 'AUTO-RUN' : 'ALARM'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center space-x-1 ml-1 font-tech flex-shrink-0">
                      {/* Immediate Trigger / Test Button */}
                      <button
                        onClick={(e) => handleTriggerNow(e, t)}
                        disabled={isRunning}
                        title={isAgent ? "Run mission immediately" : "Trigger alarm now"}
                        className="p-1 rounded border border-stone-700 hover:border-emerald-500 text-stone-300 hover:text-emerald-400 transition-colors cursor-pointer bg-stone-900"
                      >
                        {isRunning ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-400" />
                        ) : (
                          <Play className="w-2.5 h-2.5" />
                        )}
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={(e) => handleDelete(e, t.id)}
                        title="Delete task"
                        className="p-1 rounded border border-stone-800 hover:border-red-500 text-stone-500 hover:text-red-400 transition-colors cursor-pointer bg-stone-900"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: SCHEDULE NEW MISSION / REMINDER */}
        {activeTab === 'new' && (
          <form onSubmit={handleCreateReminder} className="flex-1 flex flex-col justify-between py-1 font-tech">
            {/* Row 1: Objective Title */}
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Objective (e.g. Remind me it's lunch, or Fan max)..."
              autoFocus
              className="w-full bg-stone-950/90 border border-stone-700 px-1.5 py-0.5 text-[9.5px] text-stone-100 placeholder-stone-500 outline-none rounded"
              style={{ borderColor: newTitle ? neon.glowColor : '#44403c' }}
            />

            {/* Row 2: Mode Toggle & Recurrence */}
            <div className="flex items-center justify-between gap-1 text-[8px]">
              {/* Action Mode Toggle */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setNewAction('notify')}
                  className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-0.5 ${
                    newAction === 'notify' ? 'bg-amber-950/60 border-amber-500 text-amber-300' : 'border-stone-800 text-stone-500'
                  }`}
                >
                  <Bell className="w-2.5 h-2.5" />
                  <span>ALARM</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewAction('execute_agent')}
                  className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-0.5 ${
                    newAction === 'execute_agent' ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300' : 'border-stone-800 text-stone-500'
                  }`}
                >
                  <Bot className="w-2.5 h-2.5" />
                  <span>AGENT MISSION</span>
                </button>
              </div>

              {/* Recurrence Toggle */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setNewRecurring('once')}
                  className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    newRecurring === 'once' ? 'border-stone-400 text-stone-200' : 'border-stone-800 text-stone-500'
                  }`}
                >
                  1x ONCE
                </button>
                <button
                  type="button"
                  onClick={() => setNewRecurring('daily')}
                  className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-0.5 ${
                    newRecurring === 'daily' ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300' : 'border-stone-800 text-stone-500'
                  }`}
                >
                  <Repeat className="w-2 h-2" />
                  <span>DAILY</span>
                </button>
              </div>
            </div>

            {/* Row 3: Time Presets & Custom Input */}
            <div className="flex items-center gap-1 text-[8px]">
              <span className="text-stone-400 font-bold">TIME:</span>
              {(['+5m', '+15m', '13:00', '18:00'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNewTime(preset)}
                  className={`px-1 py-0.2 rounded border transition-colors cursor-pointer ${
                    newTime === preset ? 'border-amber-400 text-amber-300 bg-amber-950/40' : 'border-stone-800 text-stone-400'
                  }`}
                >
                  {preset === '13:00' ? '13:00 (LUNCH)' : preset}
                </button>
              ))}
              <input
                type="text"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                placeholder="+30m or 14:00"
                className="w-16 bg-stone-950 border border-stone-800 px-1 py-0.2 text-[8px] text-stone-200 outline-none rounded font-mono"
              />
            </div>

            {/* Row 4: Submit Buttons */}
            <div className="flex items-center justify-end gap-1 pt-0.5 border-t border-stone-800/80">
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                className="px-2 py-0.5 border border-stone-800 text-stone-400 text-[8.5px] rounded hover:text-white cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim() || isSubmitting}
                className="px-2.5 py-0.5 border text-[8.5px] font-bold uppercase rounded font-orbitron cursor-pointer flex items-center gap-1 bg-stone-900 disabled:opacity-40"
                style={{ borderColor: neon.glowColor, color: neon.glowColor }}
              >
                {isSubmitting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Plus className="w-2.5 h-2.5" />}
                <span>SCHEDULE</span>
              </button>
            </div>
          </form>
        )}

      </div>
    </HudCard>
  );
};
