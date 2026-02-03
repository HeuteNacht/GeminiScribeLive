
import React, { useState, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { 
  Mic, Square, Trash2, Copy, Download, MessageSquare, 
  History, Settings2, Info, FileVideo, Upload, Loader2, FileText, Music
} from 'lucide-react';
import { TranscriptEntry, TranscriptionStatus, AppMode, SubtitleSegment } from './types';
import AudioWaveform from './components/AudioWaveform';

/**
 * 辅助函数：将 Uint8Array 编码为 Base64 字符串
 */
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 辅助函数：将 Float32Array 音频数据转换为符合 Gemini API 要求的 16-bit PCM Blob
 */
function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

const App: React.FC = () => {
  // --- 状态定义 ---
  const [mode, setMode] = useState<AppMode>('live'); 
  const [status, setStatus] = useState<TranscriptionStatus>(TranscriptionStatus.IDLE);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]); 
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]); 
  const [currentInputText, setCurrentInputText] = useState<string>(""); 
  const [currentStream, setCurrentStream] = useState<MediaStream | null>(null); 
  const [error, setError] = useState<string | null>(null); 
  const [isProcessing, setIsProcessing] = useState(false); 
  
  const sessionRef = useRef<any>(null); 
  const audioContextRef = useRef<AudioContext | null>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null); 

  // --- 实时转录逻辑 ---
  const startLiveTranscription = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setCurrentStream(stream);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(TranscriptionStatus.RECORDING);
            const source = audioContext.createMediaStreamSource(stream);
            const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(err => console.error("发送失败:", err));
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setCurrentInputText(prev => prev + text);
            }
            if (message.serverContent?.turnComplete) {
              setCurrentInputText(prev => {
                if (prev.trim()) {
                  const newEntry: TranscriptEntry = {
                    id: Math.random().toString(36).substr(2, 9),
                    text: prev.trim(),
                    timestamp: new Date(),
                    isFinal: true
                  };
                  setTranscripts(history => [...history, newEntry]);
                }
                return "";
              });
            }
          },
          onerror: (e: any) => {
            setError("连接错误，请检查 API Key。");
            stopLiveTranscription();
          },
          onclose: () => setStatus(TranscriptionStatus.IDLE),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError(err.message || '初始化会话失败');
      setStatus(TranscriptionStatus.IDLE);
    }
  };

  const stopLiveTranscription = () => {
    if (sessionRef.current) { try { sessionRef.current.close(); } catch(e) {} sessionRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); setCurrentStream(null); }
    setStatus(TranscriptionStatus.IDLE);
    if (currentInputText.trim()) {
      setTranscripts(h => [...h, { id: Date.now().toString(), text: currentInputText.trim(), timestamp: new Date(), isFinal: true }]);
      setCurrentInputText("");
    }
  };

  // --- 媒体文件处理逻辑 (支持长电影分段逻辑) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setSubtitles([]);

    try {
      // 1. 文件转 Base64
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // 针对长文件的 Prompt 优化
      const prompt = `
        你是一个专业的影视翻译。请分析提供的媒体文件（视频或音频）并生成高准确度的字幕。
        要求：
        1. 输出必须是 JSON 数组格式。
        2. 每个对象包含 'start' (秒, 浮点数), 'end' (秒, 浮点数), 'text' (字幕文本)。
        3. 请确保时间戳与语音严格对齐。
        4. 如果是长视频的分段，请从视频开头开始计算相对时间。
        5. 不要包含任何背景描述，只转录对话。
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: file.type, data: base64Data } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
                text: { type: Type.STRING }
              },
              required: ['start', 'end', 'text']
            }
          }
        }
      });

      const result = JSON.parse(response.text || '[]');
      setSubtitles(result);
    } catch (err: any) {
      console.error(err);
      setError("处理失败。对于 1.5 小时的电影，请务必先提取音频(MP3)并切分成 10 分钟一段的小文件上传。");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- 导出逻辑 ---
  const formatTimeSRT = (seconds: number) => {
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = (Math.floor(seconds / 60) % 60).toString().padStart(2, '0');
    const s = (Math.floor(seconds) % 60).toString().padStart(2, '0');
    const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
    return `${h}:${m}:${s},${ms}`;
  };

  const downloadSRT = () => {
    const content = subtitles.map((s, i) => 
      `${i + 1}\n${formatTimeSRT(s.start)} --> ${formatTimeSRT(s.end)}\n${s.text}\n`
    ).join('\n');
    downloadFile(content, 'subtitles.srt');
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#09090b] text-zinc-100 overflow-hidden">
      {/* 侧边栏 */}
      <aside className="hidden md:flex w-72 flex-col border-r border-zinc-800 p-6 glass-panel">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Scribe Live</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">模式选择</div>
          <button 
            onClick={() => setMode('live')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${mode === 'live' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}
          >
            <Mic className="w-4 h-4" />
            <span>实时语音转录</span>
          </button>
          <button 
            onClick={() => setMode('file')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${mode === 'file' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}
          >
            <FileVideo className="w-4 h-4" />
            <span>媒体文件字幕</span>
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-800">
          <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
            <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-2">
              <Info className="w-3 h-3" /> 长电影处理指南
            </h4>
            <ul className="text-[10px] text-zinc-400 space-y-2 leading-relaxed">
              <li>1. 请使用 FFmpeg 提取音频（MP3格式）。</li>
              <li>2. 将 1.5h 音频切分为 10 分钟一段。</li>
              <li>3. 逐段上传并生成字幕。</li>
              <li>4. 这样能确保不触发 Token 输出限制。</li>
            </ul>
          </div>
        </div>
      </aside>

      {/* 主工作区 */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        <header className="h-16 flex items-center justify-between px-6 border-b border-zinc-800 glass-panel z-10">
          <div className="flex items-center gap-4">
            <div className={`h-2 w-2 rounded-full ${status === TranscriptionStatus.RECORDING || isProcessing ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-600'}`}></div>
            <span className="text-sm font-medium text-zinc-400">
              {mode === 'live' ? (status === TranscriptionStatus.RECORDING ? '录音中...' : '实时模式') : (isProcessing ? 'AI 深度分析中...' : '文件处理模式')}
            </span>
          </div>
          <div className="flex items-center gap-2">
             {mode === 'file' && subtitles.length > 0 && (
                <button onClick={downloadSRT} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-md text-xs font-medium transition-colors">
                  <Download className="w-3 h-3" /> 导出 SRT 字幕
                </button>
             )}
            <button onClick={() => mode === 'live' ? setTranscripts([]) : setSubtitles([])} className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 bg-[#09090b]">
          {mode === 'live' ? (
            <>
              {transcripts.length === 0 && !currentInputText && (
                <div className="h-full flex flex-col items-center justify-center opacity-30">
                  <Mic className="w-16 h-16 mb-4" />
                  <p>等待开启实时语音转录...</p>
                </div>
              )}
              {transcripts.map((entry) => (
                <div key={entry.id} className="flex gap-4">
                  <div className="w-12 text-[10px] mono text-zinc-500">{entry.timestamp.toLocaleTimeString()}</div>
                  <p className="text-zinc-300 text-lg font-light">{entry.text}</p>
                </div>
              ))}
              {currentInputText && (
                <div className="flex gap-4">
                  <div className="w-12 text-indigo-400 font-bold text-[10px]">LIVE</div>
                  <p className="text-indigo-100 text-lg font-medium">{currentInputText}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {subtitles.length === 0 && !isProcessing && (
                <div className="h-full flex flex-col items-center justify-center">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full max-w-lg border-2 border-dashed border-zinc-800 rounded-3xl p-12 flex flex-col items-center justify-center gap-4 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer"
                  >
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center"><FileVideo className="w-8 h-8" /></div>
                      <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-indigo-400"><Music className="w-8 h-8" /></div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-semibold">上传媒体文件</h3>
                      <p className="text-zinc-500 text-sm mt-1">支持视频 (MP4, MOV) 或 音频 (MP3, WAV)</p>
                      <div className="mt-4 px-3 py-1 bg-zinc-900 rounded-full text-[10px] text-zinc-400">长视频建议提取音频后分段上传</div>
                    </div>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="video/*,audio/*" className="hidden" />
                </div>
              )}

              {isProcessing && (
                <div className="h-full flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                  <p className="text-zinc-400">Gemini 正在精细转录，这可能需要一分钟...</p>
                </div>
              )}

              <div className="space-y-4 max-w-4xl mx-auto">
                {subtitles.map((s, idx) => (
                  <div key={idx} className="flex gap-6 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                    <div className="w-24 flex-shrink-0 text-xs mono text-indigo-400">
                      {s.start.toFixed(2)}s - {s.end.toFixed(2)}s
                    </div>
                    <p className="flex-1 text-zinc-200">{s.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {mode === 'live' && (
          <div className="p-6 border-t border-zinc-800 glass-panel">
            <div className="max-w-3xl mx-auto flex flex-col gap-6">
              <AudioWaveform isRecording={status === TranscriptionStatus.RECORDING} stream={currentStream} />
              <div className="flex justify-center">
                {status === TranscriptionStatus.RECORDING ? (
                  <button onClick={stopLiveTranscription} className="flex items-center gap-3 bg-red-500 py-4 px-10 rounded-full font-bold transition-all"><Square className="w-5 h-5" /> 停止转录</button>
                ) : (
                  <button onClick={startLiveTranscription} className="flex items-center gap-3 bg-indigo-600 py-4 px-10 rounded-full font-bold transition-all"><Mic className="w-5 h-5" /> 开始录音</button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
