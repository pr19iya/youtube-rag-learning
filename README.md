# YouTube RAG Assistant

An AI-powered Chrome extension that lets users **ask questions and generate summaries from YouTube videos** using a Retrieval-Augmented Generation (RAG) pipeline.

The extension extracts the video's transcript directly from the YouTube page, sends it to a FastAPI backend, retrieves relevant transcript sections using hybrid search, reranks the results, and uses a Groq-hosted LLM to generate grounded answers.

---
## Demo

### Backend API
https://youtube-rag-backend-eztfdw2nda-el.a.run.app

### API Documentation
https://youtube-rag-backend-eztfdw2nda-el.a.run.app/docs

### Chrome Extension
The YouTube RAG Assistant runs as a Chrome extension.

To try it locally, follow the
[Chrome Extension Installation](#-installing-the-chrome-extension)
steps below.

## Features

- Analyze YouTube videos directly from Chrome
- Extract YouTube transcripts from the browser
- Ask questions about the video
- Retrieval-Augmented Generation (RAG)
- Hybrid retrieval using FAISS + BM25
- CrossEncoder-based reranking
- Video-level transcript/vector caching
- Conversation-aware question answering
- Short, detailed, and bullet-point summaries
- FastAPI backend
- Google Cloud Run deployment
- Groq LLM inference
- API keys stored using environment variables

---

## Architecture

```text
                    ┌──────────────────────┐
                    │      YouTube         │
                    │       Video          │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Chrome Extension   │
                    │                      │
                    │ Transcript Extraction│
                    └──────────┬───────────┘
                               │
                               │ Transcript
                               ▼
                    ┌──────────────────────┐
                    │    FastAPI Backend   │
                    │    Google Cloud Run  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Transcript Chunking  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Sentence Transformer │
                    │    Embeddings        │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────┐
                    ▼                      ▼
             ┌─────────────┐       ┌─────────────┐
             │    FAISS    │       │    BM25     │
             │  Semantic   │       │   Keyword   │
             │  Retrieval  │       │  Retrieval  │
             └──────┬──────┘       └──────┬──────┘
                    │                     │
                    └──────────┬──────────┘
                               ▼
                    ┌──────────────────────┐
                    │ Hybrid Retrieval     │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │   CrossEncoder       │
                    │     Reranking        │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │     Groq LLM         │
                    │   Answer Generation  │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ Answer / Summary     │
                    └──────────────────────┘
