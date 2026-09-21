from youtube_transcript_api import YouTubeTranscriptApi
from sentence_transformers import SentenceTransformer
from langchain_groq import ChatGroq
from dotenv import load_dotenv
import os
from langchain_core.messages import SystemMessage, HumanMessage

import faiss
import numpy as np
import json
from sentence_transformers import CrossEncoder
from rank_bm25 import BM25Okapi

from pathlib import Path

load_dotenv()


# --------------------------------------------------
# Configuration
# --------------------------------------------------

EMBEDDING_MODEL_NAME = (
    "sentence-transformers/all-MiniLM-L6-v2"
)

CHAT_MODEL_NAME = "openai/gpt-oss-20b"

CACHE_DIRECTORY = Path("video_cache")
CACHE_DIRECTORY.mkdir(exist_ok=True)


# --------------------------------------------------
# Timestamp formatting
# --------------------------------------------------

def format_timestamp(seconds):
    """Convert seconds into MM:SS format."""

    total_seconds = int(seconds)

    minutes = total_seconds // 60
    remaining_seconds = total_seconds % 60

    return f"{minutes:02d}:{remaining_seconds:02d}"


# --------------------------------------------------
# Transcript chunking
# --------------------------------------------------

def create_chunks(
    transcript,
    target_characters=1000,
    overlap_snippets=1,
):
    """Combine transcript snippets into overlapping chunks."""

    chunks = []

    current_snippets = []
    current_size = 0

    for snippet in transcript:

        # Support both:
        # 1. youtube-transcript-api objects
        # 2. dictionaries received from browser

        if isinstance(snippet, dict):

            text = snippet.get("text", "")
            start = float(snippet.get("start", 0))
            duration = float(
                snippet.get("duration", 0)
            )

        else:

            text = snippet.text
            start = float(snippet.start)
            duration = float(snippet.duration)

        # Convert into a consistent dictionary
        normalized_snippet = {
            "text": text,
            "start": start,
            "duration": duration,
        }

        current_snippets.append(
            normalized_snippet
        )

        current_size += len(text) + 1

        # ------------------------------------------
        # Create chunk
        # ------------------------------------------

        if current_size >= target_characters:

            chunk_start = current_snippets[0]["start"]

            last_snippet = current_snippets[-1]

            chunk_end = (
                last_snippet["start"]
                + last_snippet["duration"]
            )

            chunk_text = " ".join(
                item["text"]
                for item in current_snippets
            )

            chunks.append(
                {
                    "text": chunk_text,
                    "start": chunk_start,
                    "end": chunk_end,
                }
            )

            # --------------------------------------
            # Keep overlap
            # --------------------------------------

            if overlap_snippets > 0:

                current_snippets = (
                    current_snippets[
                        -overlap_snippets:
                    ]
                )

            else:

                current_snippets = []

            current_size = sum(
                len(item["text"]) + 1
                for item in current_snippets
            )

    # ------------------------------------------
    # Remaining transcript
    # ------------------------------------------

    if current_snippets:

        chunk_start = current_snippets[0]["start"]

        last_snippet = current_snippets[-1]

        chunk_end = (
            last_snippet["start"]
            + last_snippet["duration"]
        )

        chunk_text = " ".join(
            item["text"]
            for item in current_snippets
        )

        chunks.append(
            {
                "text": chunk_text,
                "start": chunk_start,
                "end": chunk_end,
            }
        )

    return chunks
    # ------------------------------------------
    # Save remaining transcript
    # ------------------------------------------

    if current_snippets:

        chunk_start = (
            current_snippets[0]["start"]
        )

        last_snippet = current_snippets[-1]

        chunk_end = (
            last_snippet["start"]
            + last_snippet["duration"]
        )

        chunk_text = " ".join(
            snippet["text"]
            for snippet in current_snippets
        )

        chunks.append(
            {
                "text": chunk_text,
                "start": chunk_start,
                "end": chunk_end,
            }
        )

    return chunks


# --------------------------------------------------
# Cache paths
# --------------------------------------------------

def get_cache_paths(video_id):
    """Return the cache paths for a video."""

    index_path = (
        CACHE_DIRECTORY / f"{video_id}.faiss"
    )

    metadata_path = (
        CACHE_DIRECTORY / f"{video_id}.json"
    )

    return index_path, metadata_path


# --------------------------------------------------
# Save video data
# --------------------------------------------------

def save_video_data(
    video_id,
    chunks,
    faiss_index,
):
    """Save FAISS vectors and transcript metadata."""

    index_path, metadata_path = get_cache_paths(
        video_id
    )

    faiss.write_index(
        faiss_index,
        str(index_path),
    )

    metadata = {
        "video_id": video_id,
        "embedding_model": EMBEDDING_MODEL_NAME,
        "chunks": chunks,
    }

    with metadata_path.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            metadata,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print("Video data saved successfully.")
    print("FAISS index:", index_path)
    print("Metadata:", metadata_path)


# --------------------------------------------------
# Load saved video data
# --------------------------------------------------

def load_video_data(video_id):
    """Load previously processed video data."""

    index_path, metadata_path = get_cache_paths(
        video_id
    )

    if not index_path.exists():
        return None, None

    if not metadata_path.exists():
        return None, None

    try:

        faiss_index = faiss.read_index(
            str(index_path)
        )

        with metadata_path.open(
            "r",
            encoding="utf-8",
        ) as file:

            metadata = json.load(file)

        saved_model = metadata.get(
            "embedding_model"
        )

        if saved_model != EMBEDDING_MODEL_NAME:

            print(
                "Embedding model changed. "
                "Rebuilding the index."
            )

            return None, None

        chunks = metadata.get(
            "chunks",
            [],
        )

        if faiss_index.ntotal != len(chunks):

            print(
                "Saved index and metadata do not "
                "match. Rebuilding the index."
            )

            return None, None

        return chunks, faiss_index

    except Exception as error:

        print(
            "Could not load saved data:",
            error,
        )

        print(
            "The video will be processed again."
        )

        return None, None


# --------------------------------------------------
# Process a video transcript
# --------------------------------------------------

def process_video(video_id, embedding_model, transcript):
    print("\nProcessing transcript received from browser...")

    if not transcript:
        print("No transcript was provided.")
        return None, None

    try:
        chunks = create_chunks(
            transcript,
            target_characters=1000,
            overlap_snippets=1,
        )

        if not chunks:
            print("Transcript produced no chunks.")
            return None, None

        print(f"Created {len(chunks)} transcript chunks.")

        texts = [chunk["text"] for chunk in chunks]

        print("Generating embeddings...")

        chunk_embeddings = embedding_model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        chunk_embeddings = np.asarray(
            chunk_embeddings,
            dtype="float32",
        )

        dimension = chunk_embeddings.shape[1]

        faiss_index = faiss.IndexFlatIP(dimension)
        faiss_index.add(chunk_embeddings)

        print("Embedding dimension:", dimension)
        print("Vectors stored:", faiss_index.ntotal)

        save_video_data(
            video_id,
            chunks,
            faiss_index,
        )

        print("Video data saved successfully.")

        return chunks, faiss_index

    except Exception as error:
        print("\nCould not process transcript.")
        print("Reason:", error)
        raise

def retrieve_relevant_chunks(
    question,
    embedding_model,
    faiss_index,
    chunks,
    top_k=8,
):
    """Retrieve transcript chunks related to a question."""

    if faiss_index.ntotal == 0:
        return []

    question_embedding = (
        embedding_model.encode(
            [question],
            normalize_embeddings=True,
        )
    )

    question_embedding = np.asarray(
        question_embedding,
        dtype="float32",
    )

    number_of_results = min(
        top_k,
        faiss_index.ntotal,
    )

    scores, indices = faiss_index.search(
        question_embedding,
        number_of_results,
    )

    results = []

    for index, score in zip(
        indices[0],
        scores[0],
    ):

        if index == -1:
            continue

        results.append(
            {
                "text": chunks[index]["text"],
                "start": chunks[index]["start"],
                "end": chunks[index]["end"],
                "score": float(score),
            }
        )

    return results


# --------------------------------------------------
# BM25 keyword retrieval
# --------------------------------------------------

def retrieve_bm25_chunks(
    question,
    chunks,
    top_k=8,
):
    """Retrieve transcript chunks using BM25."""

    if not chunks:
        return []

    tokenized_chunks = [
        chunk["text"].lower().split()
        for chunk in chunks
    ]

    bm25 = BM25Okapi(
        tokenized_chunks
    )

    question_tokens = (
        question.lower().split()
    )

    scores = bm25.get_scores(
        question_tokens
    )

    top_indices = np.argsort(
        scores
    )[::-1][:top_k]

    results = []

    for index in top_indices:

        if scores[index] <= 0:
            continue

        results.append(
            {
                "text": chunks[index]["text"],
                "start": chunks[index]["start"],
                "end": chunks[index]["end"],
                "bm25_score": float(
                    scores[index]
                ),
            }
        )

    return results


# --------------------------------------------------
# Hybrid retrieval
# --------------------------------------------------

def hybrid_retrieval(
    question,
    embedding_model,
    faiss_index,
    chunks,
    top_k=8,
):
    """Combine FAISS semantic and BM25 search."""

    faiss_results = (
        retrieve_relevant_chunks(
            question=question,
            embedding_model=embedding_model,
            faiss_index=faiss_index,
            chunks=chunks,
            top_k=top_k,
        )
    )

    bm25_results = (
        retrieve_bm25_chunks(
            question=question,
            chunks=chunks,
            top_k=top_k,
        )
    )

    combined = {}

    # ----------------------------------------------
    # Add FAISS results
    # ----------------------------------------------

    for chunk in faiss_results:

        key = (
            chunk["start"],
            chunk["end"],
        )

        combined[key] = chunk.copy()

        combined[key]["bm25_score"] = 0.0

    # ----------------------------------------------
    # Add BM25 results
    # ----------------------------------------------

    for chunk in bm25_results:

        key = (
            chunk["start"],
            chunk["end"],
        )

        if key in combined:

            combined[key]["bm25_score"] = (
                chunk["bm25_score"]
            )

        else:

            combined[key] = chunk.copy()

            combined[key]["score"] = 0.0

    combined_results = list(
        combined.values()
    )

    if not combined_results:
        return []

    # ----------------------------------------------
    # Normalize FAISS scores
    # ----------------------------------------------

    faiss_scores = [
        chunk.get("score", 0.0)
        for chunk in combined_results
    ]

    faiss_min = min(faiss_scores)
    faiss_max = max(faiss_scores)

    for chunk in combined_results:

        score = chunk.get(
            "score",
            0.0,
        )

        if faiss_max == faiss_min:

            normalized_faiss = 0.0

        else:

            normalized_faiss = (
                (score - faiss_min)
                / (faiss_max - faiss_min)
            )

        chunk[
            "normalized_faiss_score"
        ] = normalized_faiss

    # ----------------------------------------------
    # Normalize BM25 scores
    # ----------------------------------------------

    bm25_scores = [
        chunk.get(
            "bm25_score",
            0.0,
        )
        for chunk in combined_results
    ]

    bm25_min = min(bm25_scores)
    bm25_max = max(bm25_scores)

    for chunk in combined_results:

        score = chunk.get(
            "bm25_score",
            0.0,
        )

        if bm25_max == bm25_min:

            normalized_bm25 = 0.0

        else:

            normalized_bm25 = (
                (score - bm25_min)
                / (bm25_max - bm25_min)
            )

        chunk[
            "normalized_bm25_score"
        ] = normalized_bm25

    # ----------------------------------------------
    # Calculate hybrid score
    # ----------------------------------------------

    FAISS_WEIGHT = 0.6
    BM25_WEIGHT = 0.4

    for chunk in combined_results:

        chunk["hybrid_score"] = (
            FAISS_WEIGHT
            * chunk[
                "normalized_faiss_score"
            ]
            +
            BM25_WEIGHT
            * chunk[
                "normalized_bm25_score"
            ]
        )

    # ----------------------------------------------
    # Sort
    # ----------------------------------------------

    combined_results.sort(
        key=lambda chunk:
        chunk["hybrid_score"],
        reverse=True,
    )

    combined_results = (
        combined_results[:top_k]
    )

    print(
        "\nHybrid retrieval candidates:"
    )

    for chunk in combined_results:

        print(
            f"FAISS={chunk.get('score', 0.0):.3f} | "
            f"BM25={chunk['bm25_score']:.3f} | "
            f"Hybrid={chunk['hybrid_score']:.3f} | "
            f"{chunk['text'][:100]}"
        )

    return combined_results


# --------------------------------------------------
# CrossEncoder reranking
# --------------------------------------------------

def rerank_chunks(
    question,
    retrieved_chunks,
    reranker_model,
    top_k=3,
):
    """Rerank retrieved chunks using CrossEncoder."""

    if not retrieved_chunks:
        return []

    pairs = []

    for chunk in retrieved_chunks:

        pairs.append(
            [
                question,
                chunk["text"],
            ]
        )

    scores = reranker_model.predict(
        pairs
    )

    reranked_chunks = []

    for chunk, score in zip(
        retrieved_chunks,
        scores,
    ):

        reranked_chunk = chunk.copy()

        reranked_chunk[
            "rerank_score"
        ] = float(score)

        reranked_chunks.append(
            reranked_chunk
        )

    reranked_chunks.sort(
        key=lambda chunk:
        chunk["rerank_score"],
        reverse=True,
    )

    return reranked_chunks[:top_k]


# --------------------------------------------------
# Context expansion
# --------------------------------------------------

def expand_retrieved_chunks(
    reranked_chunks,
    chunks,
    neighbor_count=1,
):
    """Add neighboring transcript chunks."""

    if not reranked_chunks:
        return []

    expanded_chunks = []
    seen_indices = set()

    for chunk in reranked_chunks:

        chunk_index = None

        for index, original_chunk in enumerate(
            chunks
        ):

            if (
                original_chunk["start"]
                == chunk["start"]
                and original_chunk["end"]
                == chunk["end"]
                and original_chunk["text"]
                == chunk["text"]
            ):

                chunk_index = index
                break

        if chunk_index is None:
            continue

        start_index = max(
            0,
            chunk_index - neighbor_count,
        )

        end_index = min(
            len(chunks),
            chunk_index
            + neighbor_count
            + 1,
        )

        for index in range(
            start_index,
            end_index,
        ):

            if index in seen_indices:
                continue

            expanded_chunk = (
                chunks[index].copy()
            )

            if index == chunk_index:

                expanded_chunk["score"] = (
                    chunk.get("score")
                )

                expanded_chunk[
                    "rerank_score"
                ] = chunk.get(
                    "rerank_score"
                )

            else:

                expanded_chunk["score"] = None

                expanded_chunk[
                    "rerank_score"
                ] = None

            expanded_chunks.append(
                expanded_chunk
            )

            seen_indices.add(index)

    return expanded_chunks


# --------------------------------------------------
# Conversation memory
# --------------------------------------------------

def format_conversation_history(
    conversation_history,
    maximum_turns=3,
    maximum_answer_characters=1500,
):
    """Format recent conversation turns."""

    recent_history = (
        conversation_history[
            -maximum_turns:
        ]
    )

    history_parts = []

    for turn in recent_history:

        answer = turn["answer"]

        if len(answer) > maximum_answer_characters:

            answer = (
                answer[
                    :maximum_answer_characters
                ]
                + "..."
            )

        history_parts.append(
            f"User: {turn['question']}\n"
            f"Assistant: {answer}"
        )

    return "\n\n".join(
        history_parts
    )


# --------------------------------------------------
# Rewrite follow-up questions
# --------------------------------------------------

def rewrite_question(
    question,
    conversation_history,
    chat_model,
):
    """Rewrite a follow-up as standalone question."""

    if not conversation_history:
        return question

    history_text = (
        format_conversation_history(
            conversation_history
        )
    )

    messages = [
        SystemMessage(
            content=(
                "You rewrite user questions for a "
                "YouTube transcript retrieval system. "

                "If the latest question is already a "
                "complete standalone question, return "
                "it unchanged. "

                "If the latest question is a follow-up, "
                "use the conversation history to resolve "
                "references such as 'it', 'they', 'this', "
                "'that', 'he', 'she', or phrases such as "
                "'explain more'. "

                "Preserve the original meaning of the "
                "user's question. Do not add new "
                "information. "

                "Do not answer the question. "

                "Return ONLY the final standalone question."
            )
        ),
        HumanMessage(
            content=f"""
Conversation history:

{history_text}

Latest question:

{question}

Standalone question:
"""
        ),
    ]

    response = chat_model.invoke(
        messages
    )

    rewritten_question = (
        response.content.strip()
    )

    if not rewritten_question:
        return question

    return rewritten_question


# --------------------------------------------------
# Generate question answer
# --------------------------------------------------

def generate_answer(
    question,
    retrieved_chunks,
    chat_model,
    conversation_history,
):
    """Generate answer from transcript evidence."""

    context_parts = []

    for number, chunk in enumerate(
        retrieved_chunks,
        start=1,
    ):

        start_time = format_timestamp(
            chunk["start"]
        )

        end_time = format_timestamp(
            chunk["end"]
        )

        context_parts.append(
            f"[Source {number} | "
            f"{start_time}-{end_time}]\n"
            f"{chunk['text']}"
        )

    context = "\n\n".join(
        context_parts
    )

    history_text = (
        format_conversation_history(
            conversation_history
        )
    )

    if not history_text:
        history_text = (
            "No previous conversation."
        )

    messages = [
        SystemMessage(
            content=(
                "You are a grounded YouTube video "
                "assistant. "

                "Your answer must be based ONLY on "
                "the retrieved transcript sections "
                "provided below. "

                "Use the conversation history only "
                "to understand references such as "
                "'it', 'this', 'that', or 'the previous "
                "point'. Do not use conversation history "
                "as factual evidence. "

                "Do not use your own outside knowledge. "
                "Do not guess or fill in missing "
                "information. "

                "If the retrieved transcript does not "
                "contain enough information to answer "
                "the question, respond exactly with: "
                "'This information was not found in "
                "the video.' "

                "When answering, cite the relevant "
                "transcript section using [Source 1], "
                "[Source 2], or [Source 3]. "

                "If multiple sources support the answer, "
                "cite all relevant sources. "

                "Keep the answer clear and directly "
                "answer the user's question."
            )
        ),
        HumanMessage(
            content=f"""
Previous conversation:

{history_text}

Retrieved transcript sections:

{context}

Current question:

{question}

Answer using only the transcript evidence.
"""
        ),
    ]

    response = chat_model.invoke(
        messages
    )

    return response.content.strip()


# --------------------------------------------------
# Answer evaluation
# --------------------------------------------------

def evaluate_answer(
    question,
    answer,
    retrieved_chunks,
    chat_model,
):
    """Evaluate whether answer is supported."""

    if not retrieved_chunks:

        return {
            "grounded": False,
            "relevant": False,
            "reason": (
                "No evidence was retrieved."
            ),
        }

    context = "\n\n".join(
        chunk["text"]
        for chunk in retrieved_chunks
    )

    messages = [
        SystemMessage(
            content=(
                "You are evaluating an answer "
                "generated by a YouTube RAG system. "

                "Evaluate the answer ONLY against "
                "the provided transcript evidence. "

                "Do not use outside knowledge. "

                "Determine whether the answer is "
                "supported by the evidence and "
                "whether it directly addresses "
                "the question. "

                "Return ONLY valid JSON in this format: "

                "{"
                "\"grounded\": true or false, "
                "\"relevant\": true or false, "
                "\"reason\": \"short explanation\""
                "}"
            )
        ),
        HumanMessage(
            content=f"""
Question:

{question}

Retrieved transcript evidence:

{context}

Generated answer:

{answer}

Evaluation:
"""
        ),
    ]

    response = chat_model.invoke(
        messages
    )

    evaluation_text = (
        response.content.strip()
    )

    try:

        evaluation = json.loads(
            evaluation_text
        )

    except json.JSONDecodeError:

        evaluation = {
            "grounded": False,
            "relevant": False,
            "reason": (
                "The evaluator returned "
                "invalid JSON."
            ),
        }

    return evaluation


# --------------------------------------------------
# Intermediate summarization
# --------------------------------------------------

def summarize_text_group(
    text,
    chat_model,
):
    """Create intermediate transcript summary."""

    messages = [
        SystemMessage(
            content=(
                "Summarize YouTube transcript content. "
                "Preserve important facts, explanations, "
                "examples and conclusions. Use only the "
                "supplied content. Do not add outside "
                "information. Keep the result compact "
                "while retaining the essential ideas."
            )
        ),
        HumanMessage(
            content=f"""
Transcript content:

{text}

Create a compact intermediate summary.
"""
        ),
    ]

    response = chat_model.invoke(
        messages
    )

    return response.content.strip()


# --------------------------------------------------
# Final summarization
# --------------------------------------------------

def create_final_summary(
    combined_text,
    chat_model,
    summary_style,
):
    """Create final video summary."""

    style_instructions = {

        "short": (
            "Write one concise paragraph of "
            "approximately 100 to 150 words."
        ),

        "detailed": (
            "Write a detailed structured summary "
            "with headings for the main topic, key "
            "explanations, examples and conclusion."
        ),

        "points": (
            "Write 6 to 10 clear bullet points "
            "containing the video's most important "
            "ideas."
        ),
    }

    instruction = style_instructions.get(
        summary_style,
        style_instructions["short"],
    )

    messages = [
        SystemMessage(
            content=(
                "Create an accurate final summary "
                "of a YouTube video using only the "
                "supplied partial summaries. "
                "Do not add facts that are not present."
            )
        ),
        HumanMessage(
            content=f"""
Partial summaries:

{combined_text}

Required format:

{instruction}

Final summary:
"""
        ),
    ]

    response = chat_model.invoke(
        messages
    )

    return response.content.strip()


# --------------------------------------------------
# Full-video map-reduce summarization
# --------------------------------------------------

def generate_video_summary(
    chunks,
    chat_model,
    summary_style="short",
    batch_size=4,
):
    """Summarize complete transcript."""

    if not chunks:

        return (
            "No transcript content is available."
        )

    partial_summaries = []

    total_batches = (
        len(chunks)
        + batch_size
        - 1
    ) // batch_size

    print(
        f"\nCreating {total_batches} "
        "partial summaries..."
    )

    # ------------------------------------------
    # Map stage
    # ------------------------------------------

    for start_index in range(
        0,
        len(chunks),
        batch_size,
    ):

        batch = chunks[
            start_index:
            start_index + batch_size
        ]

        batch_text = "\n\n".join(
            chunk["text"]
            for chunk in batch
        )

        batch_number = (
            start_index // batch_size
        ) + 1

        print(
            f"Summarizing part "
            f"{batch_number}/"
            f"{total_batches}..."
        )

        partial_summary = (
            summarize_text_group(
                batch_text,
                chat_model,
            )
        )

        partial_summaries.append(
            partial_summary
        )

    # ------------------------------------------
    # Reduce stage
    # ------------------------------------------

    while len(partial_summaries) > batch_size:

        print(
            "Combining intermediate summaries..."
        )

        reduced_summaries = []

        for start_index in range(
            0,
            len(partial_summaries),
            batch_size,
        ):

            summary_group = (
                partial_summaries[
                    start_index:
                    start_index + batch_size
                ]
            )

            combined_group = "\n\n".join(
                summary_group
            )

            reduced_summary = (
                summarize_text_group(
                    combined_group,
                    chat_model,
                )
            )

            reduced_summaries.append(
                reduced_summary
            )

        partial_summaries = (
            reduced_summaries
        )

    combined_text = "\n\n".join(
        partial_summaries
    )

    print(
        "Creating the final summary..."
    )

    return create_final_summary(
        combined_text=combined_text,
        chat_model=chat_model,
        summary_style=summary_style,
    )


# --------------------------------------------------
# Summary command processing
# --------------------------------------------------

def handle_summary_command(
    command,
    chunks,
    chat_model,
):
    """Validate summary command."""

    command_parts = (
        command.lower().split()
    )

    summary_style = "short"

    if len(command_parts) > 1:
        summary_style = command_parts[1]

    valid_styles = [
        "short",
        "detailed",
        "points",
    ]

    if summary_style not in valid_styles:

        print(
            "\nUnknown summary style."
        )

        print(
            "Available commands:"
        )

        print(
            "  /summary short"
        )

        print(
            "  /summary detailed"
        )

        print(
            "  /summary points"
        )

        return None, None

    print(
        f"\nCreating a {summary_style} "
        "summary..."
    )

    summary = generate_video_summary(
        chunks=chunks,
        chat_model=chat_model,
        summary_style=summary_style,
    )

    return summary, summary_style


# --------------------------------------------------
# Main application
# --------------------------------------------------

def main():

    video_id = input(
        "Enter the YouTube video ID: "
    ).strip()

    if not video_id:

        print(
            "A video ID is required."
        )

        return

    print(
        "\nLoading the embedding model..."
    )

    embedding_model = SentenceTransformer(
        EMBEDDING_MODEL_NAME
    )

    reranker_model = CrossEncoder(
        "cross-encoder/ms-marco-MiniLM-L-6-v2"
    )

    chat_model = ChatGroq(
        model=CHAT_MODEL_NAME,
        temperature=0,
        api_key=os.getenv(
            "GROQ_API_KEY"
        ),
    )

    chunks, faiss_index = (
        load_video_data(video_id)
    )

    if (
        chunks is not None
        and faiss_index is not None
    ):

        print(
            "\nLoaded saved video data."
        )

        print(
            "Transcript chunks:",
            len(chunks),
        )

        print(
            "Vectors loaded:",
            faiss_index.ntotal,
        )

    else:

        print(
            "\nNo saved data was found."
        )

        print(
            "\nThe CLI mode now requires "
            "a transcript to be supplied."
        )

        print(
            "Use the Chrome extension to "
            "load a new YouTube video."
        )

        return

    print(
        "\nThe video is ready."
    )

    print(
        "\nAvailable commands:"
    )

    print(
        "  /summary short"
    )

    print(
        "  /summary detailed"
    )

    print(
        "  /summary points"
    )

    print(
        "  quit"
    )

    print(
        "\nYou can also ask any question "
        "about the video."
    )

    conversation_history = []

    while True:

        question = input(
            "\nYour question: "
        ).strip()

        if question.lower() in [
            "quit",
            "exit",
        ]:

            print(
                "Goodbye!"
            )

            break

        if not question:

            print(
                "Please enter a question."
            )

            continue

        # ------------------------------------------
        # Summary command
        # ------------------------------------------

        if question.lower().startswith(
            "/summary"
        ):

            try:

                summary, summary_style = (
                    handle_summary_command(
                        command=question,
                        chunks=chunks,
                        chat_model=chat_model,
                    )
                )

            except Exception as error:

                print(
                    "\nCould not create "
                    "the summary."
                )

                print(
                    "Reason:",
                    error,
                )

                continue

            if summary is None:
                continue

            print(
                "\nVideo summary:"
            )

            print(summary)

            conversation_history.append(
                {
                    "question": (
                        "Summarize the video "
                        f"in {summary_style} "
                        "format."
                    ),
                    "answer": summary,
                }
            )

            conversation_history = (
                conversation_history[-10:]
            )

            continue

        # ------------------------------------------
        # Rewrite follow-up question
        # ------------------------------------------

        try:

            standalone_question = (
                rewrite_question(
                    question=question,
                    conversation_history=(
                        conversation_history
                    ),
                    chat_model=chat_model,
                )
            )

        except Exception as error:

            print(
                "Could not rewrite "
                "the question:",
                error,
            )

            standalone_question = question

        if (
            standalone_question
            != question
        ):

            print(
                "\nQuestion understood as:",
                standalone_question,
            )

        # ------------------------------------------
        # Retrieve transcript evidence
        # ------------------------------------------

        retrieved_chunks = (
            retrieve_relevant_chunks(
                question=standalone_question,
                embedding_model=embedding_model,
                faiss_index=faiss_index,
                chunks=chunks,
                top_k=8,
            )
        )

        # ------------------------------------------
        # Rerank
        # ------------------------------------------

        reranked_chunks = rerank_chunks(
            question=standalone_question,
            retrieved_chunks=retrieved_chunks,
            reranker_model=reranker_model,
            top_k=3,
        )

        print(
            "\nRetrieved candidates:"
        )

        for number, chunk in enumerate(
            retrieved_chunks,
            start=1,
        ):

            print(
                f"\nCandidate {number}"
                f" | score="
                f"{chunk['score']:.3f}"
            )

            print(
                chunk["text"][:300]
            )

        if not retrieved_chunks:

            print(
                "\nNo relevant transcript "
                "sections were found."
            )

            continue

        best_score = (
            retrieved_chunks[0]["score"]
        )

        print(
            f"\nBest similarity score: "
            f"{best_score:.3f}"
        )

        if best_score < 0.20:

            print(
                "This information does not "
                "appear to be available "
                "in the video."
            )

            continue

        # ------------------------------------------
        # Generate answer
        # ------------------------------------------

        print(
            "Generating answer..."
        )

        try:

            answer = generate_answer(
                question=standalone_question,
                retrieved_chunks=(
                    reranked_chunks
                ),
                chat_model=chat_model,
                conversation_history=(
                    conversation_history
                ),
            )

        except Exception as error:

            print(
                "\nCould not generate "
                "an answer."
            )

            print(
                "Reason:",
                error,
            )

            continue

        print(
            "\nAnswer:"
        )

        print(answer)

        # ------------------------------------------
        # Relevant sections
        # ------------------------------------------

        print(
            "\nRelevant video sections:"
        )

        for number, chunk in enumerate(
            reranked_chunks,
            start=1,
        ):

            start_time = format_timestamp(
                chunk["start"]
            )

            end_time = format_timestamp(
                chunk["end"]
            )

            score = chunk.get(
                "score",
                0.0,
            )

            print(
                f"{number}. "
                f"{start_time}-"
                f"{end_time} "
                f"(similarity: "
                f"{score:.3f})"
            )

        # ------------------------------------------
        # Save conversation
        # ------------------------------------------

        conversation_history.append(
            {
                "question": question,
                "answer": answer,
            }
        )

        conversation_history = (
            conversation_history[-10:]
        )


if __name__ == "__main__":
    main()