import type {
  AiFeedbackSuggestRequest,
  AiFeedbackSuggestResponse,
  AiProviderMode,
  AiQuizDraftQuestion,
  AiQuizGenerateRequest,
  AiQuizGenerateResponse,
  AiTutorMode,
  AiTutorRequest,
  AiTutorResponse,
} from '../types';
import { httpPost } from './http';

export type AiGeneratedQuestion = AiQuizDraftQuestion;

export type {
  AiFeedbackSuggestRequest,
  AiFeedbackSuggestResponse,
  AiProviderMode,
  AiQuizDraftQuestion,
  AiQuizGenerateRequest,
  AiQuizGenerateResponse,
  AiTutorMode,
  AiTutorRequest,
  AiTutorResponse,
};

export async function askLessonTutor(payload: AiTutorRequest): Promise<AiTutorResponse> {
  return httpPost<AiTutorResponse>('/ai/lesson-tutor', payload);
}

export async function generateQuizDrafts(
  payload: AiQuizGenerateRequest,
): Promise<AiQuizGenerateResponse> {
  return httpPost<AiQuizGenerateResponse>('/ai/quiz-generate', payload);
}

export async function suggestGradingFeedback(
  payload: AiFeedbackSuggestRequest,
): Promise<AiFeedbackSuggestResponse> {
  return httpPost<AiFeedbackSuggestResponse>('/ai/feedback-suggest', payload);
}
