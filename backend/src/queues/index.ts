import { Queue } from './in-memory-queue.js';

export const analysisQueue = new Queue('media-analysis');
export const transcriptionQueue = new Queue('media-transcription');
export const aiDirectorQueue = new Queue('ai-director');
export const renderQueue = new Queue('video-rendering');
