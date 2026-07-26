import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

type VoiceState = 'idle' | 'listening' | 'processing' | 'responding';

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
  onClose: () => void;
}

export default function VoiceModal({ onClose }: VoiceModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [recognizedText, setRecognizedText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [activeStep, setActiveStep] = useState(-1);

  const waveBarCount = 24;

  const startListening = () => {
    setVoiceState('listening');
    setRecognizedText('');
    setAiResponse('');
    setActiveStep(-1);

    // BACKEND INTEGRATION: WebSocket /ws/voice — stream audio chunks to Whisper ASR
    setTimeout(() => {
      setRecognizedText('What is the time complexity of peak finding?');
      setVoiceState('processing');
      runPipeline();
    }, 2000);
  };

  const runPipeline = () => {
    let step = 0;
    const interval = setInterval(() => {
      setActiveStep(step);
      step++;
      if (step >= pipelineSteps.length) {
        clearInterval(interval);
        setAiResponse(
          'Peak finding using divide and conquer has O(log n) time complexity for 1D arrays. For 2D arrays, the optimal approach runs in O(n log n). You can see this explained at 24 minutes and 10 seconds in the video.'
        );
        setVoiceState('responding');
      }
    }, 400);
  };

  const handleClose = () => {
    setVoiceState('idle');
    setRecognizedText('');
    setAiResponse('');
    setActiveStep(-1);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="w-full max-w-md mx-4 modal-fade-in">
        <div className="glass-card rounded-2xl p-6 shadow-modal border border-primary/20">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                voiceState === 'listening' ?'bg-highlight ptt-pulse'
                  : voiceState === 'processing'|| voiceState === 'responding' ?'gradient-purple-blue' :'bg-muted'
              }`}>
                <Icon
                  name={voiceState === 'responding' ? 'SpeakerWaveIcon' : 'MicrophoneIcon'}
                  size={20}
                  className="text-white"
                />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {voiceState === 'idle' && 'Voice Assistant'}
                  {voiceState === 'listening' && 'Listening…'}
                  {voiceState === 'processing' && 'Processing…'}
                  {voiceState === 'responding' && 'AI Speaking…'}
                </h3>
                <p className="text-xs text-muted-foreground">Push-to-Talk · Whisper ASR</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150"
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
                className={`w-1 rounded-full waveform-bar ${
                  voiceState === 'listening' || voiceState === 'responding' ?'bg-highlight'
                    : voiceState === 'processing' ?'bg-primary' :'bg-muted'
                }`}
                style={{
                  height: `${20 + (i % 7) * 6}px`,
                  animationDuration: `${0.4 + (i % 5) * 0.12}s`,
                  animationDelay: `${i * 0.04}s`,
                  opacity: voiceState === 'idle' ? 0.3 : 1,
                }}
              />
            ))}
          </div>

          {/* Recognized Speech */}
          {(recognizedText || voiceState === 'listening') && (
            <div className="bg-muted rounded-xl p-3 mb-4 border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
                <Icon name="MicrophoneIcon" size={11} />
                Recognized Speech:
              </p>
              <p className="text-sm text-foreground font-medium">
                {recognizedText || (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Pipeline Status */}
          {voiceState === 'processing' && (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Pipeline</p>
              {pipelineSteps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    i < activeStep
                      ? 'bg-success'
                      : i === activeStep
                      ? 'bg-primary animate-pulse' :'bg-muted'
                  }`}>
                    {i < activeStep && (
                      <Icon name="CheckIcon" size={10} className="text-white" />
                    )}
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <span className={`text-xs font-medium ${
                      i <= activeStep ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
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
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon name="SparklesIcon" size={12} className="text-primary" />
                <span className="text-xs font-semibold text-primary">AI Response</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{aiResponse}</p>
              <button className="mt-2 text-xs font-semibold text-primary hover:text-accent flex items-center gap-1 transition-colors duration-150">
                <Icon name="PlayIcon" size={10} />
                Jump to 24:10 →
              </button>
            </div>
          )}

          {/* PTT Button */}
          <button
            onMouseDown={startListening}
            disabled={voiceState === 'processing'}
            className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
              voiceState === 'listening' ?'bg-destructive text-white' :'btn-orange text-white'
            }`}
          >
            <Icon name="MicrophoneIcon" size={18} />
            {voiceState === 'idle' && 'Hold to Talk'}
            {voiceState === 'listening' && 'Listening… Release to send'}
            {voiceState === 'processing' && 'Processing your question…'}
            {voiceState === 'responding' && 'AI is speaking…'}
          </button>

          {/* Example Commands */}
          {voiceState === 'idle' && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Try saying:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {exampleCommands.map((cmd) => (
                  <div key={cmd.id} className="flex flex-col bg-muted rounded-lg px-2.5 py-2">
                    <span className="text-xs font-bold text-primary">{cmd.text}</span>
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
}