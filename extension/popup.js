// =========================================
// YouTube RAG Assistant - Side Panel
// =========================================

const API_URL = "http://localhost:8000";

let currentVideoId = null;
let currentVideoUrl = null;
let videoLoaded = false;
let isAsking = false;


// =========================================
// DOM
// =========================================

const videoThumbnail = document.getElementById("videoThumbnail");
const thumbnailPlaceholder = document.getElementById("thumbnailPlaceholder");
const videoTitle = document.getElementById("videoTitle");
const videoIdElement = document.getElementById("videoId");
const videoStatus = document.getElementById("videoStatus");
const videoStatusText = document.getElementById("videoStatusText");

const loadVideoBtn = document.getElementById("loadVideoBtn");
const loadBtnText = document.getElementById("loadBtnText");
const loadBtnIcon = document.getElementById("loadBtnIcon");
const statusElement = document.getElementById("status");

const conversationContainer =
  document.getElementById("conversationContainer");

const questionInput = document.getElementById("questionInput");
const askBtn = document.getElementById("askBtn");

const summaryContainer =
  document.getElementById("summaryContainer");


// =========================================
// VIDEO ID
// =========================================

function extractVideoId(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.substring(1);
    }
  } catch (error) {
    console.error("Invalid URL:", error);
  }

  return null;
}


// =========================================
// TIME
// =========================================

function formatTime(seconds) {
  if (seconds === undefined || seconds === null) {
    return "00:00";
  }

  seconds = Math.floor(Number(seconds));

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}


function buildTimestampUrl(videoId, seconds) {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(
    Number(seconds) || 0
  )}s`;
}


// =========================================
// CURRENT VIDEO
// =========================================

async function getCurrentVideo() {
  return new Promise((resolve) => {
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true
      },
      (tabs) => {
        const tab = tabs[0];

        if (!tab || !tab.url) {
          resolve(null);
          return;
        }

        const id = extractVideoId(tab.url);

        if (!id) {
          resolve(null);
          return;
        }

        resolve({
          id,
          url: tab.url,
          title: tab.title || "YouTube Video"
        });
      }
    );
  });
}


// =========================================
// TITLE CLEANING
// =========================================

function cleanYouTubeTitle(title) {
  if (!title) return "YouTube Video";

  return title
    .replace(/\s*-\s*YouTube\s*$/i, "")
    .trim();
}


// =========================================
// VIDEO STATUS
// =========================================

function setVideoStatus(type, message) {
  if (!videoStatus || !videoStatusText) return;

  videoStatus.className = `video-status ${type}`;
  videoStatusText.textContent = message;
}


// =========================================
// VIDEO UI
// =========================================

function updateVideoUI(video) {
  if (!video) {
    videoTitle.textContent = "No YouTube video detected";
    videoIdElement.textContent = "Open a YouTube video first";

    if (videoThumbnail) {
      videoThumbnail.style.display = "none";
    }

    if (thumbnailPlaceholder) {
      thumbnailPlaceholder.style.display = "flex";
    }

    loadVideoBtn.disabled = true;
    loadBtnText.textContent = "Analyze Video";

    setVideoStatus("error", "No video detected");

    return;
  }

  currentVideoId = video.id;
  currentVideoUrl = video.url;

  videoTitle.textContent = cleanYouTubeTitle(video.title);
  videoIdElement.textContent = `youtube.com/watch?v=${video.id}`;

  if (videoThumbnail) {
    videoThumbnail.src =
      `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

    videoThumbnail.style.display = "block";
  }

  if (thumbnailPlaceholder) {
    thumbnailPlaceholder.style.display = "none";
  }

  loadVideoBtn.disabled = false;
  loadBtnText.textContent = "Analyze Video";

  setVideoStatus("ready", "Ready to analyze");
}


// =========================================
// LOAD VIDEO
// =========================================

async function loadCurrentVideo() {
  if (!currentVideoId) return;

  loadVideoBtn.disabled = true;
  loadBtnIcon.textContent = "↻";
  loadBtnText.textContent = "Analyzing...";
  statusElement.textContent = "";

  setVideoStatus("loading", "Processing transcript...");

  try {
    const response = await fetch(`${API_URL}/video/load`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        video_id: currentVideoId
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    videoLoaded = true;

    loadBtnIcon.textContent = "✓";
    loadBtnText.textContent = "Video Ready";

    setVideoStatus("success", "Transcript ready");

    if (data.cached) {
      statusElement.textContent = "Loaded from cache";
    } else {
      statusElement.textContent = "Transcript processed successfully";
    }

    enableChat();

  } catch (error) {
    console.error("Load error:", error);

    loadBtnIcon.textContent = "✦";
    loadBtnText.textContent = "Analyze Video";

    setVideoStatus("error", "Could not process video");

    statusElement.textContent =
      error.message || "Something went wrong";

  } finally {
    loadVideoBtn.disabled = false;
  }
}


// =========================================
// ESCAPE HTML
// =========================================

function escapeHtml(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// =========================================
// MARKDOWN-LIKE ANSWER FORMAT
// =========================================

function formatAnswer(text) {
  if (!text) return "";

  let html = escapeHtml(text);

  // Bold
  html = html.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  // Convert new lines
  html = html.replace(/\n/g, "<br>");

  return html;
}


// =========================================
// ADD USER MESSAGE
// =========================================

function addUserMessage(question) {
  const message = document.createElement("div");

  message.className = "chat-message user-message";

  message.innerHTML = `
    <div class="message-label">You</div>

    <div class="user-bubble">
      ${escapeHtml(question)}
    </div>
  `;

  conversationContainer.appendChild(message);

  scrollChatToBottom();
}


// =========================================
// AI RESPONSE
// =========================================

function addAssistantMessage(answer, sources = []) {
  const message = document.createElement("div");

  message.className = "chat-message assistant-message";

  message.innerHTML = `
    <div class="assistant-header">
      <div class="assistant-avatar">✦</div>
      <span>YT RAG</span>
    </div>

    <div class="assistant-answer">
      ${formatAnswer(answer)}
    </div>

    <div class="answer-actions">
      <button class="copy-answer-btn" type="button">
        <span>⧉</span>
        Copy
      </button>
    </div>
  `;

  conversationContainer.appendChild(message);

  const copyButton =
    message.querySelector(".copy-answer-btn");

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(answer);

      copyButton.innerHTML = `
        <span>✓</span>
        Copied
      `;

      setTimeout(() => {
        copyButton.innerHTML = `
          <span>⧉</span>
          Copy
        `;
      }, 1500);

    } catch (error) {
      console.error("Copy failed:", error);
    }
  });

  if (sources && sources.length > 0) {
    renderSources(message, sources);
  }

  scrollChatToBottom();
}


// =========================================
// SOURCES
// =========================================

function renderSources(parentElement, sources) {
  const sourcesWrapper = document.createElement("div");

  sourcesWrapper.className = "sources-section";

  sourcesWrapper.innerHTML = `
    <div class="sources-title">
      <span>Sources</span>
      <span class="sources-count">
        ${sources.length}
      </span>
    </div>

    <div class="source-list"></div>
  `;

  const sourceList =
    sourcesWrapper.querySelector(".source-list");

  sources.forEach((source, index) => {
    const start =
      source.start ??
      source.start_time ??
      source.timestamp ??
      0;

    const end =
      source.end ??
      source.end_time ??
      null;

    const text =
      source.text ||
      source.content ||
      source.chunk ||
      "Transcript excerpt";

    const sourceCard =
      document.createElement("div");

    sourceCard.className = "source-card";

    const timeText =
      end !== null
        ? `${formatTime(start)} – ${formatTime(end)}`
        : formatTime(start);

    const timestampUrl =
      buildTimestampUrl(
        currentVideoId,
        start
      );

    sourceCard.innerHTML = `
      <div class="source-number">
        ${String(index + 1).padStart(2, "0")}
      </div>

      <div class="source-main">

        <div class="source-top">
          <a
  class="source-time"
  href="${timestampUrl}"
  target="_blank"
  rel="noopener noreferrer"
>
  ${timeText}
</a>

          <a
            class="source-open"
            href="${timestampUrl}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in YouTube ↗
          </a>
        </div>

        <div class="source-text">
          ${escapeHtml(text)}
        </div>

      </div>
    `;

    sourceList.appendChild(sourceCard);
  });

  parentElement.appendChild(sourcesWrapper);
}


// =========================================
// ANSWER LOADING
// =========================================

function addLoadingMessage() {
  const message = document.createElement("div");

  message.className =
    "chat-message assistant-message loading-message";

  message.innerHTML = `
    <div class="assistant-header">
      <div class="assistant-avatar">✦</div>
      <span>YT RAG</span>
    </div>

    <div class="typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  conversationContainer.appendChild(message);

  scrollChatToBottom();

  return message;
}


// =========================================
// CHAT
// =========================================

async function askQuestion(question) {
  if (!question || !question.trim()) return;

  if (!videoLoaded) {
    statusElement.textContent =
      "Analyze the video before asking questions.";
    return;
  }

  if (isAsking) return;

  isAsking = true;

  const cleanQuestion = question.trim();

  hideEmptyChat();

  addUserMessage(cleanQuestion);

  questionInput.value = "";

  askBtn.disabled = true;

  const loadingMessage =
    addLoadingMessage();

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        video_id: currentVideoId,
        question: cleanQuestion
      })
    });

    if (!response.ok) {
      throw new Error(
        `Server error: ${response.status}`
      );
    }

    const data = await response.json();

    loadingMessage.remove();

    addAssistantMessage(
      data.answer || "No answer was generated.",
      data.sources || []
    );

  } catch (error) {
    console.error("Chat error:", error);

    loadingMessage.remove();

    addAssistantMessage(
      "I couldn't generate an answer right now. Please make sure the backend and Ollama are running."
    );

  } finally {
    isAsking = false;
    askBtn.disabled = false;

    questionInput.focus();
  }
}


// =========================================
// EMPTY CHAT
// =========================================

function hideEmptyChat() {
  const emptyChat =
    document.getElementById("emptyChat");

  if (emptyChat) {
    emptyChat.style.display = "none";
  }
}


// =========================================
// ENABLE CHAT
// =========================================

function enableChat() {
  questionInput.disabled = false;
  askBtn.disabled = false;

  questionInput.placeholder =
    "Ask anything about this video...";
}


// =========================================
// SUMMARY
// =========================================

async function generateSummary(style) {
  if (!videoLoaded) {
    statusElement.textContent =
      "Analyze the video first.";
    return;
  }

  summaryContainer.innerHTML = `
    <div class="summary-loading">
      <span class="spinner"></span>
      Generating summary...
    </div>
  `;

  try {
    const response = await fetch(
      `${API_URL}/summary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          video_id: currentVideoId,
          style: style
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Server error: ${response.status}`
      );
    }

    const data = await response.json();

    summaryContainer.innerHTML = `
      <div class="summary-result">
        <div class="summary-result-header">
          <span>Summary</span>

          <button
            class="copy-summary-btn"
            type="button"
          >
            ⧉ Copy
          </button>
        </div>

        <div class="summary-text">
          ${formatAnswer(
            data.summary || data.answer || ""
          )}
        </div>
      </div>
    `;

    const copyButton =
      summaryContainer.querySelector(
        ".copy-summary-btn"
      );

    const summaryText =
      data.summary || data.answer || "";

    copyButton.addEventListener(
      "click",
      async () => {
        try {
          await navigator.clipboard.writeText(
            summaryText
          );

          copyButton.textContent = "✓ Copied";

          setTimeout(() => {
            copyButton.textContent = "⧉ Copy";
          }, 1500);

        } catch (error) {
          console.error(error);
        }
      }
    );

  } catch (error) {
    console.error("Summary error:", error);

    summaryContainer.innerHTML = `
      <div class="summary-error">
        Could not generate summary.
      </div>
    `;
  }
}


// =========================================
// SCROLL
// =========================================

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    conversationContainer.scrollTop =
      conversationContainer.scrollHeight;
  });
}


// =========================================
// RESET WHEN VIDEO CHANGES
// =========================================

function resetChat() {
  videoLoaded = false;

  conversationContainer.innerHTML = `
    <div id="emptyChat" class="empty-chat">

      <div class="empty-icon">✦</div>

      <h3>Ask about this video</h3>

      <p>
        Get answers directly from the video's transcript.
      </p>

      <div class="suggestion-list">

        <button
          class="suggestion-btn"
          data-question="What is the main topic being discussed in this video?"
        >
          What is this video about?
        </button>

        <button
          class="suggestion-btn"
          data-question="Explain the key concept discussed in the video."
        >
          Explain the key concept
        </button>

        <button
          class="suggestion-btn"
          data-question="What are the most important things I should remember from this video?"
        >
          What should I remember?
        </button>

      </div>

    </div>
  `;

  questionInput.value = "";

  summaryContainer.innerHTML = "";

  questionInput.disabled = true;
  askBtn.disabled = true;

  attachSuggestionListeners();
}


// =========================================
// SUGGESTIONS
// =========================================

function attachSuggestionListeners() {
  const buttons =
    document.querySelectorAll(
      ".suggestion-btn"
    );

  buttons.forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const question =
          button.dataset.question;

        questionInput.value = question;

        if (videoLoaded) {
          askQuestion(question);
        }
      }
    );
  });
}


// =========================================
// EVENT LISTENERS
// =========================================

loadVideoBtn.addEventListener(
  "click",
  loadCurrentVideo
);


askBtn.addEventListener(
  "click",
  () => {
    askQuestion(questionInput.value);
  }
);


questionInput.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      askQuestion(questionInput.value);
    }

  }
);


document
  .querySelectorAll(".summary-btn")
  .forEach((button) => {

    button.addEventListener(
      "click",
      () => {

        const style =
          button.dataset.style;

        generateSummary(style);

      }
    );

  });


// =========================================
// INITIALIZE
// =========================================

async function initialize() {
  questionInput.disabled = true;
  askBtn.disabled = true;

  const video =
    await getCurrentVideo();

  if (!video) {
    updateVideoUI(null);
    return;
  }

  updateVideoUI(video);

  resetChat();
}


initialize();


// =========================================
// DETECT VIDEO CHANGES
// =========================================

setInterval(async () => {

  const video =
    await getCurrentVideo();

  if (!video) return;

  if (
    currentVideoId &&
    video.id !== currentVideoId
  ) {

    updateVideoUI(video);

    resetChat();

    statusElement.textContent =
      "New video detected. Analyze it to continue.";

  }

}, 2000);