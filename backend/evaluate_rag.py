# =========================================
# RAG Evaluation
# =========================================

from rag import (
    retrieve_relevant_chunks,
    retrieve_bm25_chunks,
    hybrid_retrieval,
)

from sentence_transformers import SentenceTransformer

import json


# -----------------------------------------
# Configuration
# -----------------------------------------

EMBEDDING_MODEL_NAME = (
    "sentence-transformers/all-MiniLM-L6-v2"
)


# -----------------------------------------
# Load evaluation questions
# -----------------------------------------

with open(
    "evaluation_questions.json",
    "r",
    encoding="utf-8",
) as file:

    evaluation_questions = json.load(file)


# -----------------------------------------
# Load embedding model
# -----------------------------------------

print("Loading embedding model...")

embedding_model = SentenceTransformer(
    EMBEDDING_MODEL_NAME
)


# -----------------------------------------
# Evaluate
# -----------------------------------------

def evaluate_video(video_id):

    print(
        f"\nEvaluating video: {video_id}"
    )

    from rag import load_video_data

    chunks, faiss_index = load_video_data(
        video_id
    )

    if chunks is None or faiss_index is None:

        print(
            "Video cache not found."
        )

        return

    total_questions = len(
        evaluation_questions
    )

    print(
        f"Questions: {total_questions}"
    )

    print("\n" + "=" * 60)

    for number, item in enumerate(
        evaluation_questions,
        start=1,
    ):

        question = item["question"]

        expected_keywords = [
            keyword.lower()
            for keyword in item[
                "expected_keywords"
            ]
        ]

        print(
            f"\nQuestion {number}:"
        )

        print(question)

        # ---------------------------------
        # Hybrid retrieval
        # ---------------------------------

        results = hybrid_retrieval(
            question=question,
            embedding_model=embedding_model,
            faiss_index=faiss_index,
            chunks=chunks,
            top_k=8,
        )

        # ---------------------------------
        # Keyword evaluation
        # ---------------------------------

        retrieved_text = " ".join(
            chunk["text"].lower()
            for chunk in results
        )

        matched_keywords = [
            keyword
            for keyword in expected_keywords
            if keyword in retrieved_text
        ]

        print(
            "\nExpected keywords:"
        )

        print(
            expected_keywords
        )

        print(
            "Matched keywords:"
        )

        print(
            matched_keywords
        )

        if expected_keywords:

            recall = (
                len(matched_keywords)
                / len(expected_keywords)
            )

        else:

            recall = 0

        print(
            f"Keyword recall: "
            f"{recall:.2f}"
        )

        # ---------------------------------
        # Retrieved chunks
        # ---------------------------------

        print(
            "\nTop retrieved chunks:"
        )

        for index, chunk in enumerate(
            results[:3],
            start=1,
        ):

            print(
                f"{index}. "
                f"Hybrid score="
                f"{chunk['hybrid_score']:.3f}"
            )

            print(
                chunk["text"][:200]
            )

        print("\n" + "-" * 60)


# -----------------------------------------
# Main
# -----------------------------------------

if __name__ == "__main__":

    video_id = input(
        "Enter video ID to evaluate: "
    ).strip()

    if not video_id:

        print(
            "Video ID is required."
        )

    else:

        evaluate_video(
            video_id
        )