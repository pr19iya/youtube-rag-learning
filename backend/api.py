from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sentence_transformers import SentenceTransformer, CrossEncoder
from langchain_groq import ChatGroq

import os

from rag import (
    EMBEDDING_MODEL_NAME,
    CHAT_MODEL_NAME,
    load_video_data,
    process_video,
    rerank_chunks,
    rewrite_question,
    generate_answer,
    generate_video_summary,
    expand_retrieved_chunks,
    hybrid_retrieval,
    evaluate_answer,
)


# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="YouTube RAG API",
    description="RAG backend for chatting with YouTube videos",
    version="1.0.0",
)


# ==================================================
# CORS
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# AI MODEL STATE
# ==================================================

embedding_model = None
reranker_model = None
chat_model = None


# ==================================================
# LAZY MODEL LOADERS
# ==================================================

def get_embedding_model():

    global embedding_model

    if embedding_model is None:

        print("Loading embedding model...")

        embedding_model = SentenceTransformer(
            EMBEDDING_MODEL_NAME
        )

        print("Embedding model loaded.")

    return embedding_model


def get_reranker_model():

    global reranker_model

    if reranker_model is None:

        print("Loading reranker model...")

        reranker_model = CrossEncoder(
            "cross-encoder/ms-marco-MiniLM-L-6-v2"
        )

        print("Reranker model loaded.")

    return reranker_model


def get_chat_model():

    global chat_model

    if chat_model is None:

        print("Connecting to Groq...")

        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:

            raise RuntimeError(
                "GROQ_API_KEY environment variable is not configured."
            )

        chat_model = ChatGroq(
            model=CHAT_MODEL_NAME,
            temperature=0,
            api_key=api_key,
        )

        print("Groq connected.")

    return chat_model


# ==================================================
# IN-MEMORY VIDEO SESSIONS
# ==================================================

video_sessions = {}


# ==================================================
# REQUEST MODELS
# ==================================================

class TranscriptSnippet(BaseModel):
    text: str
    start: float
    duration: float


class LoadVideoRequest(BaseModel):
    video_id: str
    transcript: list[TranscriptSnippet] | None = None


class ChatRequest(BaseModel):
    video_id: str
    question: str


class SummaryRequest(BaseModel):
    video_id: str
    style: str = "short"


# ==================================================
# HEALTH CHECK
# ==================================================

@app.get("/")
def root():

    return {
        "message": "YouTube RAG API is running"
    }


# ==================================================
# LOAD VIDEO
# ==================================================

@app.post("/video/load")
def load_video(request: LoadVideoRequest):

    video_id = request.video_id.strip()

    if not video_id:

        raise HTTPException(
            status_code=400,
            detail="Video ID is required.",
        )

    # ----------------------------------------------
    # First try existing cache
    # ----------------------------------------------

    chunks, faiss_index = load_video_data(
        video_id
    )

    loaded_from_cache = (
        chunks is not None
        and faiss_index is not None
    )

    # ----------------------------------------------
    # If cached, use cache
    # ----------------------------------------------

    if loaded_from_cache:

        print(
            f"Video {video_id} loaded from cache."
        )

    # ----------------------------------------------
    # Otherwise require browser transcript
    # ----------------------------------------------

    else:

        print(
            f"Video {video_id} not found in cache."
        )

        if not request.transcript:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Transcript is required for a new video. "
                    "Open the YouTube video and make sure the "
                    "transcript is available."
                ),
            )

        # ------------------------------------------
        # Convert Pydantic objects to dictionaries
        # ------------------------------------------

        transcript_data = [
            {
                "text": item.text,
                "start": item.start,
                "duration": item.duration,
            }
            for item in request.transcript
        ]

        print(
            f"Received {len(transcript_data)} "
            "transcript snippets from browser."
        )

        # ------------------------------------------
        # Load embedding model
        # ------------------------------------------

        embedding_model_instance = (
            get_embedding_model()
        )

        # ------------------------------------------
        # Process transcript
        # ------------------------------------------

        chunks, faiss_index = process_video(
            video_id,
            embedding_model_instance,
            transcript_data,
        )

    # ----------------------------------------------
    # Validate processing result
    # ----------------------------------------------

    if chunks is None or faiss_index is None:

        raise HTTPException(
            status_code=500,
            detail="Could not process the video transcript.",
        )

    # ----------------------------------------------
    # Create session
    # ----------------------------------------------

    video_sessions[video_id] = {
        "chunks": chunks,
        "faiss_index": faiss_index,
        "conversation_history": [],
    }

    # ----------------------------------------------
    # Response
    # ----------------------------------------------

    if loaded_from_cache:

        message = "Video loaded from cache."

    else:

        message = (
            "Video transcript processed and cached successfully."
        )

    return {
        "success": True,
        "video_id": video_id,
        "chunk_count": len(chunks),
        "cached": loaded_from_cache,
        "message": message,
    }


# ==================================================
# CHAT
# ==================================================

@app.post("/chat")
def chat(request: ChatRequest):

    video_id = request.video_id.strip()
    question = request.question.strip()

    if not question:

        raise HTTPException(
            status_code=400,
            detail="Question is required.",
        )

    # ----------------------------------------------
    # Get video session
    # ----------------------------------------------

    session = video_sessions.get(video_id)

    if session is None:

        raise HTTPException(
            status_code=404,
            detail="Video is not loaded. Load the video first.",
        )

    chunks = session["chunks"]

    faiss_index = session["faiss_index"]

    conversation_history = session[
        "conversation_history"
    ]

    # ----------------------------------------------
    # Get chat model
    # ----------------------------------------------

    chat_model_instance = get_chat_model()

    # ----------------------------------------------
    # Rewrite follow-up question
    # ----------------------------------------------

    standalone_question = rewrite_question(
        question=question,
        conversation_history=conversation_history,
        chat_model=chat_model_instance,
    )

    # ----------------------------------------------
    # Retrieval
    # ----------------------------------------------

    embedding_model_instance = (
        get_embedding_model()
    )

    retrieved_chunks = hybrid_retrieval(
        question=standalone_question,
        embedding_model=embedding_model_instance,
        faiss_index=faiss_index,
        chunks=chunks,
        top_k=8,
    )

    if not retrieved_chunks:

        return {
            "answer": (
                "This information was not found "
                "in the video."
            ),
            "sources": [],
        }

    # ----------------------------------------------
    # Reranking
    # ----------------------------------------------

    reranker_model_instance = (
        get_reranker_model()
    )

    reranked_chunks = rerank_chunks(
        question=standalone_question,
        retrieved_chunks=retrieved_chunks,
        reranker_model=reranker_model_instance,
        top_k=3,
    )

    if not reranked_chunks:

        return {
            "answer": (
                "This information was not found "
                "in the video."
            ),
            "sources": [],
        }

    # ----------------------------------------------
    # Expand context
    # ----------------------------------------------

    contextual_chunks = expand_retrieved_chunks(
        reranked_chunks=reranked_chunks,
        chunks=chunks,
        neighbor_count=1,
    )

    # ----------------------------------------------
    # Generate answer
    # ----------------------------------------------

    answer = generate_answer(
        question=standalone_question,
        retrieved_chunks=contextual_chunks,
        chat_model=chat_model_instance,
        conversation_history=conversation_history,
    )

    # ----------------------------------------------
    # Evaluate answer
    # ----------------------------------------------

    answer_evaluation = evaluate_answer(
        question=standalone_question,
        answer=answer,
        retrieved_chunks=contextual_chunks,
        chat_model=chat_model_instance,
    )

    grounded = answer_evaluation.get(
        "grounded",
        False,
    )

    relevant = answer_evaluation.get(
        "relevant",
        False,
    )

    if grounded and relevant:

        answer_status = "grounded"

    elif relevant:

        answer_status = "partially_grounded"

    else:

        answer_status = "unsupported"

    print("\nAnswer evaluation:")
    print(answer_evaluation)

    # ----------------------------------------------
    # Save conversation
    # ----------------------------------------------

    conversation_history.append(
        {
            "question": question,
            "answer": answer,
        }
    )

    session["conversation_history"] = (
        conversation_history[-10:]
    )

    # ----------------------------------------------
    # Prepare sources
    # ----------------------------------------------

    sources = []

    for number, chunk in enumerate(
        reranked_chunks,
        start=1,
    ):

        sources.append(
            {
                "source": number,
                "start": chunk["start"],
                "end": chunk["end"],
                "similarity_score": chunk["score"],
                "rerank_score": chunk["rerank_score"],
                "text": chunk["text"],
            }
        )

    # ----------------------------------------------
    # Response
    # ----------------------------------------------

    return {
        "question": question,
        "standalone_question": standalone_question,
        "answer": answer,
        "answer_status": answer_status,
        "sources": sources,
        "evaluation": answer_evaluation,
    }


# ==================================================
# SUMMARY
# ==================================================

@app.post("/summary")
def summary(request: SummaryRequest):

    video_id = request.video_id.strip()

    # ----------------------------------------------
    # Get video session
    # ----------------------------------------------

    session = video_sessions.get(video_id)

    if session is None:

        raise HTTPException(
            status_code=404,
            detail="Video is not loaded.",
        )

    # ----------------------------------------------
    # Validate style
    # ----------------------------------------------

    valid_styles = [
        "short",
        "detailed",
        "points",
    ]

    if request.style not in valid_styles:

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid summary style. "
                "Use short, detailed or points."
            ),
        )

    # ----------------------------------------------
    # Get Groq model
    # ----------------------------------------------

    chat_model_instance = get_chat_model()

    # ----------------------------------------------
    # Generate summary
    # ----------------------------------------------

    result = generate_video_summary(
        chunks=session["chunks"],
        chat_model=chat_model_instance,
        summary_style=request.style,
    )

    # ----------------------------------------------
    # Response
    # ----------------------------------------------

    return {
        "video_id": video_id,
        "style": request.style,
        "summary": result,
    }