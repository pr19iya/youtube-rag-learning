// =========================================
// YouTube RAG Assistant - Side Panel
// =========================================

const API_URL =
  "https://youtube-rag-backend-eztfdw2nda-el.a.run.app";
let currentVideoId = null;
let currentVideoUrl = null;
let currentTabId = null;

let videoLoaded = false;
let isAsking = false;


// =========================================
// DOM ELEMENTS
// =========================================

const videoThumbnail =
  document.getElementById("videoThumbnail");

const thumbnailPlaceholder =
  document.getElementById("thumbnailPlaceholder");

const videoTitle =
  document.getElementById("videoTitle");

const videoIdElement =
  document.getElementById("videoId");

const videoStatus =
  document.getElementById("videoStatus");

const videoStatusText =
  document.getElementById("videoStatusText");

const loadVideoBtn =
  document.getElementById("loadVideoBtn");

const loadBtnText =
  document.getElementById("loadBtnText");

const loadBtnIcon =
  document.getElementById("loadBtnIcon");

const statusElement =
  document.getElementById("status");

const conversationContainer =
  document.getElementById("conversationContainer");

const questionInput =
  document.getElementById("questionInput");

const askBtn =
  document.getElementById("askBtn");

const summaryContainer =
  document.getElementById("summaryContainer");


// =========================================
// VIDEO ID
// =========================================

function extractVideoId(url) {
  if (!url) {
    return null;
  }

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
  if (
    seconds === undefined ||
    seconds === null ||
    Number.isNaN(Number(seconds))
  ) {
    return "00:00";
  }

  const totalSeconds = Math.max(
    0,
    Math.floor(Number(seconds))
  );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const secs =
    totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}`;
}


function buildTimestampUrl(
  videoId,
  seconds
) {
  const timestamp = Math.max(
    0,
    Math.floor(Number(seconds) || 0)
  );

  return `https://www.youtube.com/watch?v=${videoId}&t=${timestamp}s`;
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

        if (
          !tab ||
          !tab.url ||
          !tab.id
        ) {
          resolve(null);
          return;
        }

        const videoId =
          extractVideoId(tab.url);

        if (!videoId) {
          resolve(null);
          return;
        }

        currentTabId = tab.id;

        resolve({
          id: videoId,
          url: tab.url,
          title:
            tab.title ||
            "YouTube Video"
        });
      }
    );
  });
}


// =========================================
// YOUTUBE TRANSCRIPT EXTRACTION
// =========================================

//  function getYouTubeTranscript() {
// async
//   if (!currentTabId) {
//     throw new Error(
//       "Could not find the active YouTube tab."
//     );
//   }

//   console.log(
//     "Starting YouTube transcript extraction..."
//   );

//   const results =
//     await chrome.scripting.executeScript({

//       target: {
//         tabId: currentTabId
//       },

//       func: async () => {

//         // =====================================
//         // HELPERS
//         // =====================================

//         const sleep = (milliseconds) =>
//           new Promise((resolve) => {
//             setTimeout(
//               resolve,
//               milliseconds
//             );
//           });


//         function normalizeText(value) {
//           return String(value || "")
//             .replace(/\s+/g, " ")
//             .trim();
//         }


//         function isVisible(element) {
//           if (!element) {
//             return false;
//           }

//           const style =
//             window.getComputedStyle(
//               element
//             );

//           return (
//             style.display !== "none" &&
//             style.visibility !== "hidden" &&
//             style.opacity !== "0"
//           );
//         }


//         // =====================================
//         // GET TRANSCRIPT SEGMENTS
//         // =====================================

//         function getTranscriptSegments() {

//           const selectors = [
//             "ytd-transcript-segment-renderer",
//             "yt-transcript-segment-renderer",
//             "[class*='transcript-segment']"
//           ];

//           let nodes = [];

//           for (
//             const selector of selectors
//           ) {

//             nodes = Array.from(
//               document.querySelectorAll(
//                 selector
//               )
//             );

//             if (nodes.length > 0) {
//               break;
//             }
//           }

//           const segments = [];

//           for (
//             const node of nodes
//           ) {

//             if (!isVisible(node)) {
//               continue;
//             }

//             const timestampElement =
//               node.querySelector(
//                 ".segment-timestamp"
//               ) ||
//               node.querySelector(
//                 "[class*='segment-timestamp']"
//               ) ||
//               node.querySelector(
//                 "[class*='timestamp']"
//               );

//             const textElement =
//               node.querySelector(
//                 ".segment-text"
//               ) ||
//               node.querySelector(
//                 "[class*='segment-text']"
//               );

//             const timestampText =
//               normalizeText(
//                 timestampElement?.innerText ||
//                 timestampElement?.textContent
//               );

//             let text =
//               normalizeText(
//                 textElement?.innerText ||
//                 textElement?.textContent
//               );

//             if (!text) {

//               const fullText =
//                 normalizeText(
//                   node.innerText ||
//                   node.textContent
//                 );

//               if (
//                 fullText &&
//                 timestampText
//               ) {

//                 text =
//                   fullText
//                     .replace(
//                       timestampText,
//                       ""
//                     )
//                     .trim();
//               }
//             }

//             if (
//               !text ||
//               !timestampText
//             ) {
//               continue;
//             }

//             segments.push({
//               timestampText,
//               text
//             });
//           }

//           return segments;
//         }


//         // =====================================
//         // FIND TRANSCRIPT BUTTON
//         // =====================================

//         function findTranscriptButton() {

//           const elements =
//             Array.from(
//               document.querySelectorAll(
//                 `
//                 button,
//                 tp-yt-paper-button,
//                 yt-button-shape,
//                 div[role="button"],
//                 ytd-button-renderer
//                 `
//               )
//             );

//           for (
//             const element of elements
//           ) {

//             if (!isVisible(element)) {
//               continue;
//             }

//             const text =
//               normalizeText(
//                 element.innerText ||
//                 element.textContent
//               ).toLowerCase();

//             const aria =
//               normalizeText(
//                 element.getAttribute(
//                   "aria-label"
//                 )
//               ).toLowerCase();

//             if (
//               text.includes(
//                 "show transcript"
//               ) ||
//               aria.includes(
//                 "show transcript"
//               ) ||
//               text === "transcript" ||
//               aria === "transcript"
//             ) {
//               return element;
//             }
//           }

//           return null;
//         }


//         // =====================================
//         // FIND MORE BUTTON
//         // =====================================

//         function findMoreButton() {

//           const elements =
//             Array.from(
//               document.querySelectorAll(
//                 `
//                 button,
//                 tp-yt-paper-button,
//                 yt-button-shape,
//                 div[role="button"]
//                 `
//               )
//             );

//           for (
//             const element of elements
//           ) {

//             if (!isVisible(element)) {
//               continue;
//             }

//             const text =
//               normalizeText(
//                 element.innerText ||
//                 element.textContent
//               ).toLowerCase();

//             if (
//               text === "more" ||
//               text === "show more"
//             ) {
//               return element;
//             }
//           }

//           return null;
//         }


//         // =====================================
//         // OPEN TRANSCRIPT
//         // =====================================

//         let segments =
//           getTranscriptSegments();

//         if (segments.length > 0) {

//           console.log(
//             "Transcript is already open."
//           );

//         } else {

//           let transcriptButton =
//             findTranscriptButton();

//           if (!transcriptButton) {

//             const moreButton =
//               findMoreButton();

//             if (moreButton) {

//               console.log(
//                 "Opening YouTube More section..."
//               );

//               moreButton.click();

//               await sleep(1000);

//               transcriptButton =
//                 findTranscriptButton();
//             }
//           }

//           if (!transcriptButton) {

//             await sleep(1500);

//             transcriptButton =
//               findTranscriptButton();
//           }

//           if (!transcriptButton) {

//             return {
//               success: false,
//               error:
//                 "YouTube transcript button was not found."
//             };
//           }

//           transcriptButton.scrollIntoView({
//             behavior: "smooth",
//             block: "center"
//           });

//           await sleep(500);

//           transcriptButton.click();

//           console.log(
//             "Transcript button clicked."
//           );

//           // Wait for transcript to appear
//           for (
//             let attempt = 0;
//             attempt < 30;
//             attempt++
//           ) {

//             await sleep(500);

//             segments =
//               getTranscriptSegments();

//             if (segments.length > 0) {
//               break;
//             }
//           }
//         }


//         // =====================================
//         // CHECK TRANSCRIPT
//         // =====================================

//         if (segments.length === 0) {

//           return {
//             success: false,
//             error:
//               "YouTube opened the transcript, but no transcript segments were found."
//           };
//         }


//         // =====================================
//         // SCROLL TRANSCRIPT
//         // =====================================

//         const transcriptContainer =
//           document.querySelector(
//             "#segments-container"
//           ) ||
//           document.querySelector(
//             "ytd-transcript-renderer #segments-container"
//           ) ||
//           document.querySelector(
//             "[class*='segments-container']"
//           );

//         if (transcriptContainer) {

//           let previousCount = 0;
//           let stableRounds = 0;

//           for (
//             let i = 0;
//             i < 100;
//             i++
//           ) {

//             transcriptContainer.scrollTop =
//               transcriptContainer.scrollHeight;

//             await sleep(200);

//             const currentSegments =
//               getTranscriptSegments();

//             const currentCount =
//               currentSegments.length;

//             if (
//               currentCount ===
//               previousCount
//             ) {

//               stableRounds++;

//             } else {

//               stableRounds = 0;
//             }

//             previousCount =
//               currentCount;

//             if (
//               stableRounds >= 8
//             ) {
//               break;
//             }
//           }

//           segments =
//             getTranscriptSegments();
//         }


//         // =====================================
//         // PARSE TIMESTAMP
//         // =====================================

//         function parseTimestamp(
//           timestampText
//         ) {

//           const cleaned =
//             String(timestampText || "")
//               .trim()
//               .replace(
//                 /[^0-9:]/g,
//                 ""
//               );

//           if (!cleaned) {
//             return null;
//           }

//           const parts =
//             cleaned
//               .split(":")
//               .map(Number);

//           if (
//             parts.some(
//               (value) =>
//                 Number.isNaN(value)
//             )
//           ) {
//             return null;
//           }

//           if (
//             parts.length === 2
//           ) {

//             return (
//               parts[0] * 60 +
//               parts[1]
//             );
//           }

//           if (
//             parts.length === 3
//           ) {

//             return (
//               parts[0] * 3600 +
//               parts[1] * 60 +
//               parts[2]
//             );
//           }

//           return null;
//         }


//         // =====================================
//         // BUILD TRANSCRIPT
//         // =====================================

//         const transcript = [];

//         for (
//           let i = 0;
//           i < segments.length;
//           i++
//         ) {

//           const segment =
//             segments[i];

//           const start =
//             parseTimestamp(
//               segment.timestampText
//             );

//           if (start === null) {
//             continue;
//           }

//           const nextSegment =
//             segments[i + 1];

//           const nextStart =
//             nextSegment
//               ? parseTimestamp(
//                   nextSegment.timestampText
//                 )
//               : null;

//           let duration = 5;

//           if (
//             nextStart !== null &&
//             nextStart > start
//           ) {

//             duration =
//               nextStart - start;
//           }

//           transcript.push({
//             text: segment.text,
//             start,
//             duration
//           });
//         }


//         // =====================================
//         // REMOVE DUPLICATES
//         // =====================================

//         const uniqueTranscript = [];
//         const seen = new Set();

//         for (
//           const segment of transcript
//         ) {

//           const key =
//             `${segment.start}|${segment.text}`;

//           if (seen.has(key)) {
//             continue;
//           }

//           seen.add(key);

//           uniqueTranscript.push(
//             segment
//           );
//         }


//         console.log(
//           `Extracted ${uniqueTranscript.length} transcript segments.`
//         );

//         if (
//           uniqueTranscript.length === 0
//         ) {

//           return {
//             success: false,
//             error:
//               "Transcript segments were found, but their timestamps could not be read."
//           };
//         }

//         return {
//           success: true,
//           transcript:
//             uniqueTranscript
//         };
//       }
//     });


//   const result =
//     results?.[0]?.result;

//   if (
//     !result ||
//     !result.success
//   ) {

//     throw new Error(
//       result?.error ||
//       "Could not extract the YouTube transcript."
//     );
//   }

//   const transcript =
//     result.transcript;

//   if (
//     !Array.isArray(transcript) ||
//     transcript.length === 0
//   ) {

//     throw new Error(
//       "The extracted YouTube transcript is empty."
//     );
//   }

//   console.log(
//     "Transcript extracted successfully:",
//     transcript.length,
//     "segments"
//   );

//   return transcript;
// }
async function getYouTubeTranscript() {
  if (!currentTabId) {
    throw new Error("No YouTube tab detected.");
  }

  const result = await chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: async () => {
      const sleep = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      const cleanText = (text) =>
        (text || "")
          .replace(/\s+/g, " ")
          .trim();

      const parseTimestamp = (text) => {
        if (!text) return null;

        const match = text.match(
          /(?:(\d+):)?(\d{1,2}):(\d{2})/
        );

        if (!match) return null;

        if (match[1] !== undefined) {
          return (
            Number(match[1]) * 3600 +
            Number(match[2]) * 60 +
            Number(match[3])
          );
        }

        return (
          Number(match[2]) * 60 +
          Number(match[3])
        );
      };

      // --------------------------------------------------
      // 1. Find and click the transcript button
      // --------------------------------------------------

      const findTranscriptButton = () => {
        const elements = [
          ...document.querySelectorAll("button"),
          ...document.querySelectorAll(
            "ytd-menu-service-item-renderer"
          ),
          ...document.querySelectorAll(
            "tp-yt-paper-item"
          ),
        ];

        return elements.find((element) => {
          const text = cleanText(element.innerText);

          return (
            text.toLowerCase().includes("transcript") ||
            text.toLowerCase().includes("show transcript")
          );
        });
      };

      let transcriptButton = findTranscriptButton();

      // Sometimes transcript is inside the "more" menu.
      if (!transcriptButton) {
        const moreButtons = [
          ...document.querySelectorAll("button"),
          ...document.querySelectorAll(
            "ytd-button-renderer"
          ),
        ];

        const moreButton = moreButtons.find((button) => {
          const label =
            button.getAttribute("aria-label") || "";

          return (
            label.toLowerCase().includes("more") ||
            label.toLowerCase().includes("more actions")
          );
        });

        if (moreButton) {
          moreButton.click();
          await sleep(1000);

          transcriptButton = findTranscriptButton();
        }
      }

      if (transcriptButton) {
        transcriptButton.click();
      }

      // --------------------------------------------------
      // 2. Wait for transcript panel
      // --------------------------------------------------

      let transcriptFound = false;

      for (let i = 0; i < 20; i++) {
        await sleep(500);

        const text = document.body.innerText || "";

        const hasTranscriptText =
          text.toLowerCase().includes("transcript");

        const hasSegments =
          document.querySelectorAll(
            "ytd-transcript-segment-renderer"
          ).length > 0;

        if (hasTranscriptText || hasSegments) {
          transcriptFound = true;
          break;
        }
      }

      if (!transcriptFound) {
        throw new Error(
          "YouTube transcript panel could not be opened."
        );
      }

      // --------------------------------------------------
      // 3. Scroll transcript panel to load all segments
      // --------------------------------------------------

      const scrollContainers = [
        ...document.querySelectorAll(
          "ytd-transcript-segment-list-renderer"
        ),
        ...document.querySelectorAll(
          "ytd-transcript-renderer"
        ),
        ...document.querySelectorAll(
          "ytd-engagement-panel-section-list-renderer"
        ),
      ];

      for (const container of scrollContainers) {
        try {
          container.scrollTop = container.scrollHeight;
        } catch (e) {}
      }

      // Scroll multiple times because YouTube may lazy-load segments.
      for (let i = 0; i < 8; i++) {
        window.scrollTo(0, document.body.scrollHeight);

        for (const container of scrollContainers) {
          try {
            container.scrollTop = container.scrollHeight;
          } catch (e) {}
        }

        await sleep(400);
      }

      // --------------------------------------------------
      // 4. Find transcript segments
      // --------------------------------------------------

      let segmentElements = [
        ...document.querySelectorAll(
          "ytd-transcript-segment-renderer"
        ),
      ];

      // Alternative selectors used by different YouTube versions.
      if (segmentElements.length === 0) {
        segmentElements = [
          ...document.querySelectorAll(
            "yt-transcript-segment-renderer"
          ),
        ];
      }

      if (segmentElements.length === 0) {
        segmentElements = [
          ...document.querySelectorAll(
            "[class*='transcript-segment']"
          ),
        ];
      }

      // --------------------------------------------------
      // 5. Try generic timestamp/text containers
      // --------------------------------------------------

      const transcript = [];

      for (const element of segmentElements) {
        const fullText = cleanText(element.innerText);

        if (!fullText) continue;

        const timestampElement =
          element.querySelector(
            "#segment-timestamp"
          ) ||
          element.querySelector(
            ".segment-timestamp"
          ) ||
          element.querySelector(
            "[class*='timestamp']"
          );

        const textElement =
          element.querySelector(
            "#segment-text"
          ) ||
          element.querySelector(
            ".segment-text"
          ) ||
          element.querySelector(
            "[class*='segment-text']"
          );

        const timestampText = timestampElement
          ? cleanText(timestampElement.innerText)
          : fullText;

        const text = textElement
          ? cleanText(textElement.innerText)
          : fullText
              .replace(timestampText, "")
              .trim();

        if (!text) continue;

        const start = parseTimestamp(timestampText);

        if (start === null) continue;

        transcript.push({
          text,
          start,
          duration: 2,
        });
      }

      // --------------------------------------------------
      // 6. Remove duplicates
      // --------------------------------------------------

      const uniqueTranscript = [];

      const seen = new Set();

      for (const item of transcript) {
        const key = `${item.start}|${item.text}`;

        if (seen.has(key)) continue;

        seen.add(key);
        uniqueTranscript.push(item);
      }

      uniqueTranscript.sort(
        (a, b) => a.start - b.start
      );

      // --------------------------------------------------
      // 7. Return result
      // --------------------------------------------------

      if (uniqueTranscript.length === 0) {
        return {
          success: false,
          error:
            "Transcript panel opened, but YouTube's transcript segments could not be detected."
        };
      }

      return {
        success: true,
        transcript: uniqueTranscript,
      };
    },
  });

  const data = result?.[0]?.result;

  if (!data) {
    throw new Error(
      "Could not communicate with the YouTube page."
    );
  }

  if (!data.success) {
    throw new Error(
      data.error ||
        "No transcript segments were found."
    );
  }

  console.log(
    "Transcript segments found:",
    data.transcript.length
  );

  return data.transcript;
}

// =========================================
// TITLE
// =========================================

function cleanYouTubeTitle(title) {

  if (!title) {
    return "YouTube Video";
  }

  return title
    .replace(
      /\s*-\s*YouTube\s*$/i,
      ""
    )
    .trim();
}


// =========================================
// VIDEO STATUS
// =========================================

function setVideoStatus(
  type,
  message
) {

  if (
    videoStatus &&
    videoStatusText
  ) {

    videoStatus.className =
      `video-status ${type}`;

    videoStatusText.textContent =
      message;
  }

  if (statusElement) {
    statusElement.textContent =
      message;
  }
}


// =========================================
// VIDEO UI
// =========================================

function updateVideoUI(video) {

  if (!video) {

    currentVideoId = null;
    currentVideoUrl = null;
    videoLoaded = false;

    if (videoTitle) {
      videoTitle.textContent =
        "No YouTube video detected";
    }

    if (videoIdElement) {
      videoIdElement.textContent =
        "Open a YouTube video first";
    }

    if (videoThumbnail) {
      videoThumbnail.style.display =
        "none";
    }

    if (thumbnailPlaceholder) {
      thumbnailPlaceholder.style.display =
        "flex";
    }

    if (loadVideoBtn) {
      loadVideoBtn.disabled =
        true;
    }

    if (loadBtnText) {
      loadBtnText.textContent =
        "Analyze Video";
    }

    setVideoStatus(
      "error",
      "No video detected"
    );

    return;
  }


  currentVideoId =
    video.id;

  currentVideoUrl =
    video.url;


  if (videoTitle) {
    videoTitle.textContent =
      cleanYouTubeTitle(
        video.title
      );
  }

  if (videoIdElement) {
    videoIdElement.textContent =
      `youtube.com/watch?v=${video.id}`;
  }


  if (videoThumbnail) {

    videoThumbnail.src =
      `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

    videoThumbnail.style.display =
      "block";
  }


  if (thumbnailPlaceholder) {
    thumbnailPlaceholder.style.display =
      "none";
  }


  if (loadVideoBtn) {
    loadVideoBtn.disabled =
      false;
  }

  if (loadBtnText) {
    loadBtnText.textContent =
      "Analyze Video";
  }

  if (loadBtnIcon) {
    loadBtnIcon.textContent =
      "✦";
  }

  setVideoStatus(
    "ready",
    "Ready to analyze"
  );
}


// =========================================
// LOAD / ANALYZE VIDEO
// =========================================

async function loadCurrentVideo() {

  if (!currentVideoId) {

    setVideoStatus(
      "error",
      "No YouTube video detected."
    );

    return;
  }


  videoLoaded =
    false;

  if (loadVideoBtn) {
    loadVideoBtn.disabled =
      true;
  }

  if (loadBtnIcon) {
    loadBtnIcon.textContent =
      "↻";
  }

  if (loadBtnText) {
    loadBtnText.textContent =
      "Getting transcript...";
  }


  setVideoStatus(
    "loading",
    "Getting YouTube transcript..."
  );


  try {

    // =======================================
    // 1. GET TRANSCRIPT FROM BROWSER
    // =======================================

    const transcript =
      await getYouTubeTranscript();


    if (
      !transcript ||
      transcript.length === 0
    ) {

      throw new Error(
        "Could not extract a YouTube transcript."
      );
    }


    console.log(
      "Transcript ready:",
      transcript.length
    );


    // =======================================
    // 2. SEND TRANSCRIPT TO CLOUD RUN
    // =======================================

    if (loadBtnText) {
      loadBtnText.textContent =
        "Analyzing transcript...";
    }

    setVideoStatus(
      "loading",
      `Processing ${transcript.length} transcript segments...`
    );


    const response =
      await fetch(
        `${API_URL}/video/load`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            video_id:
              currentVideoId,

            transcript:
              transcript
          })
        }
      );


    // =======================================
    // 3. HANDLE BACKEND ERROR
    // =======================================

    if (!response.ok) {

      let errorMessage =
        `Server error: ${response.status}`;

      try {

        const errorData =
          await response.json();

        if (
          errorData?.detail
        ) {

          errorMessage =
            typeof errorData.detail ===
            "string"
              ? errorData.detail
              : JSON.stringify(
                  errorData.detail
                );
        }

      } catch (_) {
        // Ignore invalid JSON
      }

      throw new Error(
        errorMessage
      );
    }


    // =======================================
    // 4. SUCCESS
    // =======================================

    const data =
      await response.json();

    console.log(
      "Video load response:",
      data
    );


    videoLoaded =
      true;


    if (loadBtnIcon) {
      loadBtnIcon.textContent =
        "✓";
    }

    if (loadBtnText) {
      loadBtnText.textContent =
        "Video Ready";
    }


    setVideoStatus(
      "success",
      data.cached
        ? "Video loaded from cache"
        : "Transcript processed successfully"
    );


    enableChat();


  } catch (error) {

    console.error(
      "Analyze video failed:",
      error
    );


    videoLoaded =
      false;


    if (loadBtnIcon) {
      loadBtnIcon.textContent =
        "✦";
    }

    if (loadBtnText) {
      loadBtnText.textContent =
        "Analyze Video";
    }


    const message =
      error?.message ||
      "Something went wrong while processing the video.";


    setVideoStatus(
      "error",
      message
    );

  } finally {

    if (loadVideoBtn) {
      loadVideoBtn.disabled =
        false;
    }
  }
}


// =========================================
// HTML ESCAPING
// =========================================

function escapeHtml(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


// =========================================
// FORMAT ANSWER
// =========================================

function formatAnswer(text) {

  if (!text) {
    return "";
  }

  let html =
    escapeHtml(text);

  html =
    html.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );

  html =
    html.replace(
      /`([^`]+)`/g,
      "<code>$1</code>"
    );

  html =
    html.replace(
      /\n/g,
      "<br>"
    );

  return html;
}


// =========================================
// USER MESSAGE
// =========================================

function addUserMessage(question) {

  const message =
    document.createElement("div");

  message.className =
    "chat-message user-message";

  message.innerHTML = `
    <div class="message-label">
      You
    </div>

    <div class="user-bubble">
      ${escapeHtml(question)}
    </div>
  `;

  conversationContainer.appendChild(
    message
  );

  scrollChatToBottom();
}


// =========================================
// ASSISTANT MESSAGE
// =========================================

function addAssistantMessage(
  answer,
  sources = []
) {

  const message =
    document.createElement("div");

  message.className =
    "chat-message assistant-message";

  message.innerHTML = `
    <div class="assistant-header">
      <div class="assistant-avatar">
        ✦
      </div>

      <span>
        YT RAG
      </span>
    </div>

    <div class="assistant-answer">
      ${formatAnswer(answer)}
    </div>

    <div class="answer-actions">
      <button
        class="copy-answer-btn"
        type="button"
      >
        <span>⧉</span>
        Copy
      </button>
    </div>
  `;

  conversationContainer.appendChild(
    message
  );


  const copyButton =
    message.querySelector(
      ".copy-answer-btn"
    );


  if (copyButton) {

    copyButton.addEventListener(
      "click",
      async () => {

        try {

          await navigator.clipboard.writeText(
            answer
          );

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

          console.error(
            "Copy failed:",
            error
          );
        }
      }
    );
  }


  if (
    Array.isArray(sources) &&
    sources.length > 0
  ) {

    renderSources(
      message,
      sources
    );
  }


  scrollChatToBottom();
}


// =========================================
// SOURCES
// =========================================

function renderSources(
  parentElement,
  sources
) {

  const sourcesWrapper =
    document.createElement("div");

  sourcesWrapper.className =
    "sources-section";

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
    sourcesWrapper.querySelector(
      ".source-list"
    );


  sources.forEach(
    (source, index) => {

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

      sourceCard.className =
        "source-card";


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

      sourceList.appendChild(
        sourceCard
      );
    }
  );


  parentElement.appendChild(
    sourcesWrapper
  );
}


// =========================================
// LOADING MESSAGE
// =========================================

function addLoadingMessage() {

  const message =
    document.createElement("div");

  message.className =
    "chat-message assistant-message loading-message";

  message.innerHTML = `
    <div class="assistant-header">
      <div class="assistant-avatar">
        ✦
      </div>

      <span>
        YT RAG
      </span>
    </div>

    <div class="typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  conversationContainer.appendChild(
    message
  );

  scrollChatToBottom();

  return message;
}


// =========================================
// CHAT
// =========================================

async function askQuestion(question) {

  if (
    !question ||
    !question.trim()
  ) {
    return;
  }

  if (!videoLoaded) {

    if (statusElement) {
      statusElement.textContent =
        "Analyze the video before asking questions.";
    }

    return;
  }

  if (isAsking) {
    return;
  }

  isAsking =
    true;

  const cleanQuestion =
    question.trim();

  hideEmptyChat();

  addUserMessage(
    cleanQuestion
  );

  questionInput.value =
    "";

  askBtn.disabled =
    true;

  const loadingMessage =
    addLoadingMessage();


  try {

    const response =
      await fetch(
        `${API_URL}/chat`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            video_id:
              currentVideoId,

            question:
              cleanQuestion
          })
        }
      );


    if (!response.ok) {

      let errorMessage =
        `Server error: ${response.status}`;

      try {

        const errorData =
          await response.json();

        if (
          errorData?.detail
        ) {

          errorMessage =
            typeof errorData.detail ===
            "string"
              ? errorData.detail
              : JSON.stringify(
                  errorData.detail
                );
        }

      } catch (_) {
        // Ignore
      }

      throw new Error(
        errorMessage
      );
    }


    const data =
      await response.json();


    loadingMessage.remove();


    addAssistantMessage(
      data.answer ||
        "No answer was generated.",
      data.sources ||
        []
    );


  } catch (error) {

    console.error(
      "Chat error:",
      error
    );


    loadingMessage.remove();


    addAssistantMessage(
      `I couldn't generate an answer right now.

${error?.message || "Please try again."}`
    );


  } finally {

    isAsking =
      false;

    askBtn.disabled =
      false;

    questionInput.focus();
  }
}


// =========================================
// EMPTY CHAT
// =========================================

function hideEmptyChat() {

  const emptyChat =
    document.getElementById(
      "emptyChat"
    );

  if (emptyChat) {
    emptyChat.style.display =
      "none";
  }
}


// =========================================
// ENABLE CHAT
// =========================================

function enableChat() {

  if (questionInput) {

    questionInput.disabled =
      false;

    questionInput.placeholder =
      "Ask anything about this video...";
  }

  if (askBtn) {
    askBtn.disabled =
      false;
  }
}


// =========================================
// SUMMARY
// =========================================

async function generateSummary(style) {

  if (!currentVideoId) {

    if (statusElement) {
      statusElement.textContent =
        "No YouTube video detected.";
    }

    return;
  }

  if (!videoLoaded) {

    if (statusElement) {
      statusElement.textContent =
        "Analyze the video first.";
    }

    return;
  }


  summaryContainer.innerHTML = `
    <div class="summary-loading">
      <span class="spinner"></span>
      Generating summary...
    </div>
  `;


  try {

    const response =
      await fetch(
        `${API_URL}/summary`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            video_id:
              currentVideoId,

            style:
              style
          })
        }
      );


    if (!response.ok) {

      let errorMessage =
        `Server error: ${response.status}`;

      try {

        const errorData =
          await response.json();

        if (
          errorData?.detail
        ) {

          errorMessage =
            typeof errorData.detail ===
            "string"
              ? errorData.detail
              : JSON.stringify(
                  errorData.detail
                );
        }

      } catch (_) {
        // Ignore
      }

      throw new Error(
        errorMessage
      );
    }


    const data =
      await response.json();


    const summaryText =
      data.summary ||
      data.answer ||
      data.result ||
      "";


    if (!summaryText) {

      throw new Error(
        "The server returned an empty summary."
      );
    }


    summaryContainer.innerHTML = `
      <div class="summary-result">

        <div class="summary-result-header">

          <span>
            Summary
          </span>

          <button
            class="copy-summary-btn"
            type="button"
          >
            ⧉ Copy
          </button>

        </div>

        <div class="summary-text">
          ${formatAnswer(summaryText)}
        </div>

      </div>
    `;


    const copyButton =
      summaryContainer.querySelector(
        ".copy-summary-btn"
      );


    if (copyButton) {

      copyButton.addEventListener(
        "click",
        async () => {

          try {

            await navigator.clipboard.writeText(
              summaryText
            );

            copyButton.textContent =
              "✓ Copied";

            setTimeout(() => {

              copyButton.textContent =
                "⧉ Copy";

            }, 1500);

          } catch (error) {

            console.error(
              "Summary copy failed:",
              error
            );
          }
        }
      );
    }


  } catch (error) {

    console.error(
      "Summary error:",
      error
    );


    summaryContainer.innerHTML = `
      <div class="summary-error">
        Could not generate summary.
        <br>
        <small>
          ${escapeHtml(
            error?.message ||
            "Something went wrong."
          )}
        </small>
      </div>
    `;
  }
}


// =========================================
// SCROLL
// =========================================

function scrollChatToBottom() {

  if (!conversationContainer) {
    return;
  }

  requestAnimationFrame(() => {

    conversationContainer.scrollTop =
      conversationContainer.scrollHeight;

  });
}


// =========================================
// RESET
// =========================================

function resetChat() {

  videoLoaded =
    false;


  if (conversationContainer) {

    conversationContainer.innerHTML = `
      <div
        id="emptyChat"
        class="empty-chat"
      >

        <div class="empty-icon">
          ✦
        </div>

        <h3>
          Ask about this video
        </h3>

        <p>
          Get answers directly from
          the video's transcript.
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
  }


  if (questionInput) {
    questionInput.value =
      "";

    questionInput.disabled =
      true;
  }


  if (askBtn) {
    askBtn.disabled =
      true;
  }


  if (summaryContainer) {
    summaryContainer.innerHTML =
      "";
  }


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

  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const question =
            button.dataset.question;

          questionInput.value =
            question;

          if (videoLoaded) {
            askQuestion(
              question
            );
          }
        }
      );
    }
  );
}


// =========================================
// EVENT LISTENERS
// =========================================

if (loadVideoBtn) {

  loadVideoBtn.addEventListener(
    "click",
    loadCurrentVideo
  );
}


if (askBtn) {

  askBtn.addEventListener(
    "click",
    () => {

      askQuestion(
        questionInput.value
      );

    }
  );
}


if (questionInput) {

  questionInput.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        askQuestion(
          questionInput.value
        );
      }
    }
  );
}


document
  .querySelectorAll(
    ".summary-btn"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const style =
            button.dataset.style;

          generateSummary(
            style
          );
        }
      );
    }
  );


// =========================================
// INITIALIZE
// =========================================

async function initialize() {

  if (questionInput) {
    questionInput.disabled =
      true;
  }

  if (askBtn) {
    askBtn.disabled =
      true;
  }


  const video =
    await getCurrentVideo();


  if (!video) {

    updateVideoUI(null);
    resetChat();

    return;
  }


  updateVideoUI(video);
  resetChat();
}


initialize();


// =========================================
// DETECT VIDEO CHANGES
// =========================================

setInterval(
  async () => {

    const video =
      await getCurrentVideo();

    if (!video) {
      return;
    }


    if (
      currentVideoId &&
      video.id !== currentVideoId
    ) {

      updateVideoUI(video);
      resetChat();

      setVideoStatus(
        "ready",
        "New video detected. Analyze it to continue."
      );
    }

  },
  2000
);