
/**
 * 实时转录条目接口
 */
export interface TranscriptEntry {
  id: string;      // 唯一标识符
  text: string;    // 转录的文本内容
  timestamp: Date; // 产生时间
  isFinal: boolean;// 是否为最终确定的转录结果
}

/**
 * 视频字幕片段接口（用于非实时生成）
 */
export interface SubtitleSegment {
  start: number; // 开始时间（秒）
  end: number;   // 结束时间（秒）
  text: string;  // 片段文本
}

/**
 * 转录状态枚举
 */
export enum TranscriptionStatus {
  IDLE = 'IDLE',           // 闲置状态
  RECORDING = 'RECORDING', // 正在录音/连接中
  PROCESSING = 'PROCESSING',// 正在处理
  ERROR = 'ERROR'          // 发生错误
}

/**
 * 应用模式
 */
export type AppMode = 'live' | 'file'; // live: 实时语音转录, file: 媒体文件生成字幕

/**
 * 音频可视化组件属性定义
 */
export interface AudioVisualizerProps {
  isRecording: boolean;      // 是否处于录制状态
  stream: MediaStream | null;// 录音媒体流
}
