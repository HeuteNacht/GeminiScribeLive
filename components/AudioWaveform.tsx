
import React, { useRef, useEffect } from 'react';
import { AudioVisualizerProps } from '../types';

/**
 * 实时音频波形可视化组件
 * 利用 Web Audio API 的 AnalyserNode 获取频谱数据，并在 Canvas 上实时绘制
 */
const AudioWaveform: React.FC<AudioVisualizerProps> = ({ isRecording, stream }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0); // 存储 requestAnimationFrame 的 ID
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    // 仅在录音且有媒体流时启动可视化
    if (!isRecording || !stream) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    // 1. 初始化音频上下文
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    
    // 2. 创建分析器节点 (用于获取音频实时数据)
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; // 频率箱的数量 (数值越大，波形越精细)
    source.connect(analyser);
    analyserRef.current = analyser;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // 3. 绘图循环
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      // 获取当前瞬时的频率数据
      analyser.getByteFrequencyData(dataArray);

      // 清空画布
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 2.5; // 计算每个条形的宽度
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // 根据频率大小计算条形高度
        const barHeight = (dataArray[i] / 255) * height;

        // 设置渐变色样式
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#4f46e5'); // 底部深色 (Indigo 600)
        gradient.addColorStop(1, '#818cf8'); // 顶部浅色 (Indigo 400)

        ctx.fillStyle = gradient;
        
        // 绘制圆角矩形条形
        const radius = 2;
        ctx.beginPath();
        // ctx.roundRect 是现代浏览器支持的绘制圆角矩形的方法
        ctx.roundRect(x, height - barHeight, barWidth - 1, barHeight, [radius, radius, 0, 0]);
        ctx.fill();

        x += barWidth + 1;
      }
    };

    draw();

    // 清理函数：停止动画并关闭音频上下文
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      audioContext.close();
    };
  }, [isRecording, stream]);

  return (
    <div className="w-full h-12 flex items-center justify-center opacity-80">
      <canvas 
        ref={canvasRef} 
        width={600} 
        height={48} 
        className="w-full h-full max-w-2xl"
      />
    </div>
  );
};

export default AudioWaveform;
