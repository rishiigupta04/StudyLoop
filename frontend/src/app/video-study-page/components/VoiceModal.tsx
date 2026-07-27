import React from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/ui/AppIcon';
import { PTTStage } from '@/hooks/useTildePTT';

const pipelineSteps = [
  { id: 'step-asr', label: 'Whisper ASR', desc: 'Speech to Text' },
  { id: 'step-intent', label: 'DistilBERT Intent', desc: 'Intent Classifier' },
  { id: 'step-rag', label: 'BGE-M3 RAG', desc: 'Retrieving context' },
  { id: 'step-llm', label: 'Qwen2.5 LLM', desc: 'Generating answer' },
  { id: 'step-tts', label: 'MeloTTS', desc: 'Text to Speech' },
];

const exampleCommands = [
  { id: 'cmd-pause', text: '"pause"', desc: 'Pause video' },
  { id: 'cmd-back', text: '"go back 10 seconds"', desc: 'Rewind 10s' },
  { id: 'cmd-skip', text: '"skip to complexity"', desc: 'Jump to chapter' },
  { id: 'cmd-note', text: '"note this down"', desc: 'Capture note' },
];

interface VoiceModalProps {
  stage: PTTStage;
  recognizedText: string;
  aiResponse: string;
  activeStep: number;
  onStartListening: () => void;
  onStopListening: () => void;
  onClose: () => void;
  onSeekTimestamp?: (ts: string) => void;
}

export default function VoiceModal({
  stage,
  recognizedText,
  aiResponse,
  activeStep,
  onStartListening,
  onStopListening,
  onClose,
  onSeekTimestamp,
}: VoiceModalProps) {
  const waveBarCount = 24;

  const targetMount = document.fullscreenElement || document.body;

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md mx-4 modal-fade-in">
        <div className="bg-[#151926] rounded-3xl p-6 shadow-2xl border border-indigo-500/50 relative">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${stage === 'listening'
                    ? 'bg-indigo-600 ptt-pulse'
                    : stage === 'processing' || stage === 'responding'
                      ? 'gradient-indigo-cyan'
                      : 'bg-surface-elevated border border-border'
                  }`}
              >
                <Icon
                  name={stage === 'responding' ? 'SpeakerWaveIcon' : 'MicrophoneIcon'}
                  size={20}
                  className="text-white"
                />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {stage === 'idle' && 'Voice Copilot Active'}
                  {stage === 'listening' && 'Listening… (Keep holding ~)'}
                  {stage === 'processing' && 'Processing Intent…'}
                  {stage === 'responding' && 'AI Responding…'}
                </h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span>Hold</span>
                  <kbd className="px-1 py-0.2 rounded bg-indigo-900/60 border border-indigo-400/40 text-indigo-200 font-mono text-[10px]">
                    ~ Tilde
                  </kbd>
                  <span>key or button</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close voice modal"
            >
              <Icon name="XMarkIcon" size={18} />
            </button>
          </div>

          {/* Waveform Animation */}
          <div className="flex items-center justify-center gap-1 h-16 mb-4">
            {Array.from({ length: waveBarCount }).map((_, i) => (
              <div
                key={`wave-${i}`}
                className={`w-1 rounded-full waveform-bar ${stage === 'listening' || stage === 'responding'
                    ? 'bg-indigo-400'
                    : stage === 'processing'
                      ? 'bg-cyan-400'
                      : 'bg-surface-elevated'
                  }`}
                style={{
                  height: `${20 + (i % 7) * 6}px`,
                  animationDuration: `${0.4 + (i % 5) * 0.12}s`,
                  animationDelay: `${i * 0.04}s`,
                  opacity: stage === 'idle' ? 0.35 : 1,
                }}
              />
            ))}
          </div>

          {/* Recognized Speech */}
          {(recognizedText || stage === 'listening') && (
            <div className="bg-surface-card rounded-2xl p-3.5 mb-4 border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
                <Icon name="MicrophoneIcon" size={12} className="text-indigo-400" />
                Recognized Speech:
              </p>
              <p className="text-sm text-foreground font-medium">
                {recognizedText || (
                  <span className="flex items-center gap-1.5 text-indigo-300">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                    <span className="text-xs text-muted-foreground ml-1">Speak into microphone...</span>
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Pipeline Status */}
          {stage === 'processing' && (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                LangGraph Multi-Agent DAG
              </p>
              {pipelineSteps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${i < activeStep
                        ? 'bg-emerald-500'
                        : i === activeStep
                          ? 'bg-indigo-500 animate-pulse'
                          : 'bg-surface-elevated'
                      }`}
                  >
                    {i < activeStep && <Icon name="CheckIcon" size={10} className="text-white" />}
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <span
                      className={`text-xs font-medium ${i <= activeStep ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                    >
                      {step.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{step.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AI Response */}
          {aiResponse && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-3.5 mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon name="SparklesIcon" size={14} className="text-indigo-400" />
                <span className="text-xs font-bold text-indigo-400">AI Response</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{aiResponse}</p>
              <button
                onClick={() => {
                  if (onSeekTimestamp) onSeekTimestamp('24:10');
                  onClose();
                }}
                className="mt-2 text-xs font-bold text-indigo-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
              >
                <Icon name="PlayIcon" size={12} />
                Jump to 24:10 →
              </button>
            </div>
          )}

          {/* PTT Button for Mouse Users */}
          <button
            onMouseDown={onStartListening}
            onMouseUp={onStopListening}
            onTouchStart={onStartListening}
            onTouchEnd={onStopListening}
            disabled={stage === 'processing'}
            className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${stage === 'listening'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                : 'btn-primary text-white shadow-glow-indigo-sm'
              }`}
          >
            <Icon name="MicrophoneIcon" size={18} />
            {stage === 'idle' && 'Hold Button or ~ Key to Speak'}
            {stage === 'listening' && 'Listening… Release to send'}
            {stage === 'processing' && 'Processing question…'}
            {stage === 'responding' && 'AI Speaking…'}
          </button>

          {/* Example Commands */}
          {stage === 'idle' && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Try saying:</p>
              <div className="grid grid-cols-2 gap-2">
                {exampleCommands.map((cmd) => (
                  <div key={cmd.id} className="flex flex-col bg-surface-card border border-border/60 rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-indigo-400">{cmd.text}</span>
                    <span className="text-xs text-muted-foreground">{cmd.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, targetMount);
}