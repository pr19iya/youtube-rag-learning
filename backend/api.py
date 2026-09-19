from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from sentence_transformers import SentenceTransformer
from sentence_transformers import CrossEncoder

from langchain_ollama import ChatOllama

from rag import (
    EMBEDDING_MODEL_NAME,
    CHAT_MODEL_NAME,
    load_video_data,
    process_video,
    retrieve_relevant_chunks,
    rerank_chunks,
    rewrite_question,
    generate_answer,
    generate_video_summary,
    expand_retrieved_chunks,
    hybrid_retrieval,
    evaluate_answer,
)


# --------------------------------------------------
# FastAPI application
# --------------------------------------------------

app = FastAPI(
    title="YouTube RAG API",
    description="RAG backend for chatting with YouTube videos",
    version="1.0.0",
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Load AI models
# --------------------------------------------------

print("Loading embedding model...")

embedding_model = SentenceTransformer(
    EMBEDDING_MODEL_NAME
)

print("Loading reranker model...")

reranker_model = CrossEncoder(
    "cross-encoder/ms-marco-MiniLM-L-6-v2"
)

print("Connecting to Ollama...")

chat_model = ChatOllama(
    model=CHAT_MODEL_NAME,
    temperature=0,
)

print("Models loaded successfully.")


# --------------------------------------------------
# In-memory video sessions
# --------------------------------------------------

video_sessions = {}


# --------------------------------------------------
# Request models
# --------------------------------------------------

class LoadVideoRequest(BaseModel):
    video_id: str


class ChatRequest(BaseModel):
    video_id: str
    question: str


class SummaryRequest(BaseModel):
    video_id: str
    style: str = "short"


# --------------------------------------------------
# Health check
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "YouTube RAG API is running"
    }


# --------------------------------------------------
# Load video
# --------------------------------------------------

@app.post("/video/load")
def load_video(request: LoadVideoRequest):

    video_id = request.video_id.strip()

    if not video_id:
        raise HTTPException(
            status_code=400,
            detail="Video ID is required.",
        )

    # ----------------------------------------------
    # Try loading cached video
    # ----------------------------------------------

    chunks, faiss_index = load_video_data(
        video_id
    )

    loaded_from_cache = (
        chunks is not None
        and faiss_index is not None
    )

    # ----------------------------------------------
    # Process video if not cached
    # ----------------------------------------------

    if not loaded_from_cache:

        chunks, faiss_index = process_video(
            video_id,
            embedding_model,
        )

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
        message = "Video processed and cached successfully."

    return {
        "success": True,
        "video_id": video_id,
        "chunk_count": len(chunks),
        "cached": loaded_from_cache,
        "message": message,
    }
# --------------------------------------------------
# Chat
# --------------------------------------------------
@app.post("/chat")
def chat(request: ChatRequest):

    video_id = request.video_id.strip()
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question is required.",
        )

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
    # Rewrite follow-up question
    # ----------------------------------------------

    standalone_question = rewrite_question(
        question=question,
        conversation_history=conversation_history,
        chat_model=chat_model,
    )

    # ----------------------------------------------
    # First-stage retrieval
    # ----------------------------------------------
    retrieved_chunks = hybrid_retrieval(
    question=standalone_question,
    embedding_model=embedding_model,
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

    reranked_chunks = rerank_chunks(
        question=standalone_question,
        retrieved_chunks=retrieved_chunks,
        reranker_model=reranker_model,
        top_k=3,
    )
        # ----------------------------------------------
    # Expand with neighboring chunks
    # ----------------------------------------------

    contextual_chunks = expand_retrieved_chunks(
        reranked_chunks=reranked_chunks,
        chunks=chunks,
        neighbor_count=1,
    )

    # ----------------------------------------------
    # Retrieval quality check
    # ----------------------------------------------

    if not reranked_chunks:
        return {
            "answer": (
                "This information was not found "
                "in the video."
            ),
            "sources": [],
        }

    best_rerank_score = reranked_chunks[0][
        "rerank_score"
    ]

    # ----------------------------------------------
# Retrieval quality check
# ----------------------------------------------

    if not reranked_chunks:
        return {
        "answer": (
            "This information was not found "
            "in the video."
        ),
        "sources": [],
    }

    # ----------------------------------------------
    # Generate answer
    # ----------------------------------------------

    answer = generate_answer(
        question=standalone_question,
        retrieved_chunks=contextual_chunks,
        chat_model=chat_model,
        conversation_history=conversation_history,
    )

        # ----------------------------------------------
    # Evaluate generated answer
    # ----------------------------------------------

    answer_evaluation = evaluate_answer(
        question=standalone_question,
        answer=answer,
        retrieved_chunks=contextual_chunks,
        chat_model=chat_model,
    )
        # ----------------------------------------------
    # Determine answer confidence
    # ----------------------------------------------

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

    print(
        "\nAnswer evaluation:"
    )

    print(
        answer_evaluation
    )

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

    return {
    "question": question,
    "standalone_question": standalone_question,
    "answer": answer,
    "answer_status": answer_status,
    "sources": sources,
    "evaluation": answer_evaluation,
    }

# --------------------------------------------------
# Summary
# --------------------------------------------------

@app.post("/summary")
def summary(request: SummaryRequest):

    video_id = request.video_id.strip()

    session = video_sessions.get(video_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Video is not loaded.",
        )

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

    result = generate_video_summary(
        chunks=session["chunks"],
        chat_model=chat_model,
        summary_style=request.style,
    )

    return {
        "video_id": video_id,
        "style": request.style,
        "summary": result,
    }