const API_URL = "http://localhost:8000";

export interface VideoLoadResponse {
  success: boolean;
  video_id: string;
  chunk_count: number;
  message: string;
}

export interface Source {
  source: number;
  start: number;
  end: number;
  similarity_score: number;
  rerank_score: number;
  text: string;
}

export interface ChatResponse {
  question: string;
  standalone_question: string;
  answer: string;
  sources: Source[];
}

export interface SummaryResponse {
  video_id: string;
  style: string;
  summary: string;
}

export async function loadVideo(
  videoId: string
): Promise<VideoLoadResponse> {
  const response = await fetch(`${API_URL}/video/load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_id: videoId,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to load video.");
  }

  return data;
}

export async function sendChatMessage(
  videoId: string,
  question: string
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_id: videoId,
      question,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to generate answer.");
  }

  return data;
}

export async function getSummary(
  videoId: string,
  style: "short" | "detailed" | "points"
): Promise<SummaryResponse> {
  const response = await fetch(`${API_URL}/summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_id: videoId,
      style,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to generate summary.");
  }

  return data;
}