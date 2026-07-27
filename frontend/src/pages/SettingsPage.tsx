import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/ui/AppIcon';
import { useGamification } from '@/context/GamificationContext';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'voice' | 'integrations' | 'billing' | 'notifications'>('profile');
  
  // Profile Form States
  const [fullName, setFullName] = useState('Rishiraj Gupta');
  const [email, setEmail] = useState('rishiraj@studyloop.ai');
  const [institution, setInstitution] = useState('MSc Data Science & AI');
  const [targetStudyHours, setTargetStudyHours] = useState('15');
  
  // Voice & AI Settings States
  const [pttKey, setPttKey] = useState('~ (Tilde)');
  const [asrLanguage, setAsrLanguage] = useState('Bilingual Hinglish');
  const [audioSpeed, setAudioSpeed] = useState('1.0x');
  const [antiSpoilerEnabled, setAntiSpoilerEnabled] = useState(true);
  
  // API Integration States
  const [hfApiKey, setHfApiKey] = useState('hf_demo_token_98472918471924');
  const [notionConnected, setNotionConnected] = useState(true);
  const [ankiExportFormat, setAnkiExportFormat] = useState('CSV (Front/Back)');

  const { awardXP } = useGamification();

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    awardXP(20, 'Updated Profile & Settings!');
    toast.success('Settings saved successfully! (+20 XP)');
  };

  return (
    <div className="flex h-screen bg-obsidian text-foreground overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar activeRoute="/settings" />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="px-8 py-5 border-b border-border/80 bg-surface-card/60 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Icon name="Cog6ToothIcon" size={22} />
              </div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                Account & Copilot Settings
              </h1>
            </div>
            <p className="text-xs text-foreground-muted">
              Manage your student profile, Push-to-Talk voice triggers, API integrations, and billing.
            </p>
          </div>

          <button
            onClick={handleSaveProfile}
            className="btn-primary px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2"
          >
            <Icon name="CheckIcon" size={16} />
            Save Changes (+20 XP)
          </button>
        </header>

        {/* User Hero Banner */}
        <div className="px-8 py-6 bg-[#121624] border-b border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-4 text-left">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-xl font-extrabold shadow-lg border border-indigo-400/40">
              RG
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-black text-foreground">{fullName}</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-[10px] font-extrabold">
                  Scholar Pro Member
                </span>
              </div>
              <p className="text-xs text-foreground-muted font-mono">{email} • {institution}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 font-bold px-3 py-1 rounded-xl bg-emerald-950 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Notion DB Connected
            </span>
          </div>
        </div>

        {/* Settings Tab Bar */}
        <div className="px-8 pt-4 bg-obsidian border-b border-border/60 flex items-center gap-2 flex-shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="UserIcon" size={16} />
            <span>Profile & Goals</span>
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'voice'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="MicrophoneIcon" size={16} />
            <span>Voice & AI Engine</span>
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'integrations'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="LinkIcon" size={16} />
            <span>Notion & API Keys</span>
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'billing'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="CreditCardIcon" size={16} />
            <span>Subscription & Plan</span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin text-left">
          <div className="max-w-3xl mx-auto">
            {activeTab === 'profile' && (
              <motion.form
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSaveProfile}
                className="p-8 rounded-3xl bg-[#151926] border border-border/80 space-y-6 shadow-xl"
              >
                <h3 className="text-lg font-bold text-foreground pb-3 border-b border-border/60">
                  Student Profile Details
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full input-field rounded-xl px-4 py-2.5 text-xs bg-[#0B0E17]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full input-field rounded-xl px-4 py-2.5 text-xs bg-[#0B0E17]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Academic Institution</label>
                    <input
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="w-full input-field rounded-xl px-4 py-2.5 text-xs bg-[#0B0E17]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Weekly Target Study Hours</label>
                    <input
                      type="number"
                      value={targetStudyHours}
                      onChange={(e) => setTargetStudyHours(e.target.value)}
                      className="w-full input-field rounded-xl px-4 py-2.5 text-xs bg-[#0B0E17]"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button type="submit" className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold text-white">
                    Save Profile Changes
                  </button>
                </div>
              </motion.form>
            )}

            {activeTab === 'voice' && (
              <motion.form
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSaveProfile}
                className="p-8 rounded-3xl bg-[#151926] border border-border/80 space-y-6 shadow-xl"
              >
                <h3 className="text-lg font-bold text-foreground pb-3 border-b border-border/60">
                  Voice Copilot & AI Controls
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Push-to-Talk (PTT) Key Trigger</label>
                    <select
                      value={pttKey}
                      onChange={(e) => setPttKey(e.target.value)}
                      className="w-full input-field rounded-xl px-3 py-2.5 text-xs bg-[#0B0E17] cursor-pointer"
                    >
                      <option value="~ (Tilde)">~ (Tilde Key - Recommended)</option>
                      <option value="Spacebar">Hold Spacebar</option>
                      <option value="Alt + V">Alt + V</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">ASR Speech Language</label>
                    <select
                      value={asrLanguage}
                      onChange={(e) => setAsrLanguage(e.target.value)}
                      className="w-full input-field rounded-xl px-3 py-2.5 text-xs bg-[#0B0E17] cursor-pointer"
                    >
                      <option value="Bilingual Hinglish">🌐 Bilingual Hinglish (Hindi + English)</option>
                      <option value="English Only">🇬🇧 English Only</option>
                      <option value="Hindi Only">🇮🇳 Hindi Only</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#0B0E17] border border-border/80 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-foreground text-xs">Anti-Spoiler Timestamp Bounding</h4>
                    <p className="text-[11px] text-muted-foreground">Restrict vector search RAG answers strictly to content played up to current video timestamp.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={antiSpoilerEnabled}
                    onChange={(e) => setAntiSpoilerEnabled(e.target.checked)}
                    className="w-5 h-5 rounded accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="pt-4 flex justify-end">
                  <button type="submit" className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold text-white">
                    Save Voice Settings
                  </button>
                </div>
              </motion.form>
            )}

            {activeTab === 'integrations' && (
              <motion.form
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSaveProfile}
                className="p-8 rounded-3xl bg-[#151926] border border-border/80 space-y-6 shadow-xl"
              >
                <h3 className="text-lg font-bold text-foreground pb-3 border-b border-border/60">
                  Notion Sync & API Keys
                </h3>

                <div className="p-4 rounded-2xl bg-[#0B0E17] border border-indigo-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🚀</span>
                    <div>
                      <h4 className="font-bold text-foreground text-xs">Notion Database OAuth Sync</h4>
                      <p className="text-[11px] text-muted-foreground">Connected to "Rishiraj's Notion Study Workspace"</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNotionConnected(!notionConnected);
                      toast.success(notionConnected ? 'Disconnected Notion Workspace' : 'Connected to Notion Workspace!');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                      notionConnected ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {notionConnected ? 'Connected' : 'Connect Notion'}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Hugging Face API Token</label>
                  <input
                    type="password"
                    value={hfApiKey}
                    onChange={(e) => setHfApiKey(e.target.value)}
                    className="w-full input-field rounded-xl px-4 py-2.5 text-xs font-mono bg-[#0B0E17]"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block">Used for fast serverless LLM copilot queries.</span>
                </div>

                <div className="pt-4 flex justify-end">
                  <button type="submit" className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold text-white">
                    Save API Keys
                  </button>
                </div>
              </motion.form>
            )}

            {activeTab === 'billing' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 rounded-3xl bg-[#151926] border border-indigo-500/40 space-y-6 shadow-xl"
              >
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <div>
                    <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider block mb-1">Current Active Plan</span>
                    <h3 className="text-2xl font-extrabold text-foreground">Scholar Pro (Annual)</h3>
                  </div>
                  <span className="px-3.5 py-1.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-xs font-extrabold">
                    ₹399 / month (Billed Annually)
                  </span>
                </div>

                <p className="text-xs text-foreground-muted leading-relaxed">
                  Your Scholar Pro subscription includes unlimited AI video study sessions, sub-100ms Hugging Face Inference API calls, BGE-M3 1024-dim vector RAG, 1-click Notion sync, and Anki flashcard export.
                </p>

                <div className="p-4 rounded-2xl bg-[#0B0E17] border border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Next Renewal Date: <strong>August 26, 2026</strong></span>
                  <button
                    onClick={() => toast.info('Redirecting to subscription management portal...')}
                    className="px-4 py-2 rounded-xl bg-surface-elevated text-indigo-300 font-bold border border-indigo-500/30 hover:border-indigo-500/60"
                  >
                    Manage Subscription
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
