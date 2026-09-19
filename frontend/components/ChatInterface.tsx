"use client";

import { useState } from "react";
import { loadVideo } from "@/lib/api";

export default function ChatInterface() {
  const [videoUrl, setVideoUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function extractVideoId(url: string) {
    try {
      const parsedUrl = new URL(url);

      if (parsedUrl.hostname.includes("youtu.be")) {
        return parsedUrl.pathname.slice(1);
      }

      if (parsedUrl.hostname.includes("youtube.com")) {
        return parsedUrl.searchParams.get("v");
      }

      return null;
    } catch {
      return null;
    }
  }

  async function handleLoadVideo() {
    setMessage("");
    setError("");

    const id = extractVideoId(videoUrl);

    if (!id) {
      setError("Please enter a valid YouTube URL.");
      return;
    }

    setLoading(true);

    try {
      const result = await loadVideo(id);

      setVideoId(id);
      setMessage(
        `${result.message} (${result.chunk_count} chunks created)`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load video."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold">
            YouTube RAG Chatbot
          </h1>

          <p className="mt-3 text-slate-400">
            Ask questions and get answers directly from a YouTube video transcript.
          </p>
        </div>

        {/* Video Loader */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <h2 className="mb-2 text-xl font-semibold">
            Load a YouTube Video
          </h2>

          <p className="mb-5 text-sm text-slate-400">
            Paste a YouTube video URL below.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
            />

            <button
              onClick={handleLoadVideo}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-6 py-3 font-medium transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "Load Video"}
            </button>
          </div>

          {/* Success */}
          {message && (
            <div className="mt-5 rounded-xl border border-green-800 bg-green-950/40 p-4 text-green-400">
              <p>{message}</p>

              {videoId && (
                <p className="mt-1 text-sm text-green-500">
                  Video ID: {videoId}
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-5 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}