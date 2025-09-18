// Auto-open transcript when page loads or video changes
let currentVideoId = null;
let autoOpenEnabled = true;

// fuzzy word vars
let maxFuzzyResults = 10;
let showSimilarButton = null;

// Load setting from storage when script starts
async function loadAutoOpenSetting() {
  try {
    const result = await chrome.storage.sync.get(['autoOpenEnabled']);
    autoOpenEnabled = result.autoOpenEnabled !== undefined ? result.autoOpenEnabled : true;
    //console.log("Auto-open setting loaded:", autoOpenEnabled);
  } catch (error) {
    //console.log("Could not load auto-open setting, using default (enabled):", error);
    autoOpenEnabled = true;
  }
}

// Initialize settings when script loads
loadAutoOpenSetting();

function initializeAutoTranscript() {
  if (!autoOpenEnabled) return;
  
  const videoId = extractVideoId();
  
  if (videoId && videoId !== currentVideoId) {
    currentVideoId = videoId;
    //console.log("New video detected:", videoId);
    
    // Clear cached data for new video
    clearCachedData();
    
    // Wait for page to load, then force open transcript
    setTimeout(() => {
      forceOpenTranscriptWithSearch(3);
    }, 1500);
  }
}

function forceOpenTranscriptWithSearch(attemptsLeft) {
  if (attemptsLeft <= 0) {
    //console.log("Failed to auto-open transcript after all attempts");
    return;
  }
  
  //console.log(`Attempting to force open transcript, ${attemptsLeft} attempts left`);
  
  // First, try to open the transcript panel
  openTranscriptPanel()
    .then(() => {
      //console.log("Transcript opened successfully");
      
      // Wait for transcript to load, then inject search
      setTimeout(() => {
        attemptToInjectSearch(3);
      }, 800);
    })
    .catch(error => {
      //console.log(`Failed to open transcript (${attemptsLeft} attempts left):`, error.message);
      
      if (attemptsLeft > 1) {
        setTimeout(() => {
          forceOpenTranscriptWithSearch(attemptsLeft - 1);
        }, 2000);
      }
    });
}

function attemptToInjectSearch(attemptsLeft) {
  if (attemptsLeft <= 0) {
    //console.log("Failed to inject search box after all attempts");
    return;
  }
  
  const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
  const hasSearchBox = document.getElementById('transcript-search-container');
  
  if (transcriptSegments.length > 0 && !hasSearchBox) {
    //console.log(`Found ${transcriptSegments.length} transcript segments, injecting search box`);
    
    if (injectSearchBox()) {
      //console.log("Search box injected successfully");
      hideNativeSearchBox();
      
      // Cache transcript data
      if (!cachedTranscript) {
        extractTranscriptFromDOM().then(transcript => {
          cachedTranscript = transcript;
          //console.log("Transcript data cached");
        }).catch(console.error);
      }
    } else {
      //console.log("Failed to inject search box, retrying...");
      if (attemptsLeft > 1) {
        setTimeout(() => {
          attemptToInjectSearch(attemptsLeft - 1);
        }, 1000);
      }
    }
  } else if (transcriptSegments.length === 0) {
    //console.log(`No transcript segments found yet, ${attemptsLeft} attempts left`);
    if (attemptsLeft > 1) {
      setTimeout(() => {
        attemptToInjectSearch(attemptsLeft - 1);
      }, 1000);
    }
  } else {
    //console.log("Search box already exists");
  }
}

// Listen for navigation changes
function watchForVideoChanges() {
  // Watch for URL changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (url.includes('/watch')) {
        setTimeout(initializeAutoTranscript, 1000);
      }
    }
  }).observe(document, { subtree: true, childList: true });
  
  // Watch for video element changes
  function attachVideoListeners() {
    const videoElement = document.querySelector('video');
    if (videoElement && !videoElement.hasTranscriptListener) {
      videoElement.hasTranscriptListener = true;
      videoElement.addEventListener('loadstart', () => {
        setTimeout(initializeAutoTranscript, 500);
      });
    }
  }
  
  // attach and re-attach for video changes
  attachVideoListeners();
  new MutationObserver(attachVideoListeners).observe(document.body, { childList: true, subtree: true });
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      initializeAutoTranscript();
      watchForVideoChanges();
      monitorForTranscriptPanel();
      attachTabListeners();
    }, 1000);
  });
} else {
  setTimeout(() => {
    initializeAutoTranscript();
    watchForVideoChanges();
    monitorForTranscriptPanel();
    attachTabListeners();
  }, 1000);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // new window needs to refresh tab before opening transcript search
  if (request.action === "refreshPage") {
    window.location.reload();
    sendResponse({success: true});
    return;
  }

  if (request.action === "toggleAutoOpen") {
    autoOpenEnabled = request.enabled;
    //console.log("Auto-open transcript:", autoOpenEnabled ? "enabled" : "disabled");
    
    // If auto open then open transcript
    if (autoOpenEnabled && location.href.includes('/watch')) {
      setTimeout(() => {
        forceOpenTranscriptWithSearch(2);
      }, 500);
    }
    
    sendResponse({ success: true });
    return;
  }
  
  if (request.action === "getTranscript") {
    // Wait for transcript to open before extracting
    openTranscriptPanel()
      .then(() => {
        setTimeout(() => {
          extractTranscriptFromDOM()
            .then(transcript => {
              //console.log("Content: Extracted transcript from DOM:", transcript?.length || 0, "entries");
              sendResponse({ transcript: transcript });
            })
            .catch(error => {
              console.error("Content: Error extracting transcript:", error);
              sendResponse({ transcript: null, error: error.message });
            });
        }, 1000);
      })
      .catch(error => {
        console.error("Content: Failed to open transcript:", error);
        sendResponse({ transcript: null, error: error.message });
      });
    return true;
  }
  
  if (request.action === "openPopup") {
    // open
    forceOpenTranscriptWithSearch(2);
  }
  
  if (request.action === "openTranscript") {
    openTranscriptPanel()
      .then(() => {
        // Show search box once transcript is up
        setTimeout(() => {
          attemptToInjectSearch(2);
        }, 800);
        sendResponse({ success: true, isOpen: true });
      })
      .catch(error => {
        console.error("Open transcript failed:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === "focusSearch") {
    ensureTranscriptWithSearch();
    setTimeout(() => {
      focusSearchBox();
    }, 300);
  }
     
  if (request.action === "seekTo") {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = request.time;
      video.pause();
      setTimeout(() => video.play(), 100);
    }
  }
});

// Extract transcript from YouTube's DOM (as api is now blocked/ needs authorisation)
async function extractTranscriptFromDOM() {
  //console.log("Attempting to extract transcript from DOM...");
  
  const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
  
  if (transcriptSegments.length === 0) {
    throw new Error("No transcript segments found in DOM. Try opening the transcript panel first.");
  }
  
  const transcript = [];
  
  transcriptSegments.forEach((segment, index) => {
    try {
      // Extract timestamp and text at timestamp
      const timestampElement = segment.querySelector('.segment-timestamp');
      if (!timestampElement) return;
      
      const timestampText = timestampElement.textContent.trim();
      const timeInSeconds = parseTimestamp(timestampText);
      
      const textElement = segment.querySelector('.segment-text, yt-formatted-string.segment-text');
      if (!textElement) return;
      
      let text = textElement.textContent || textElement.innerText || '';
      // Cleanup text
      text = text.replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').trim();
      
      if (text && timeInSeconds !== null) {
        // Calculate duration
        let duration = 5;
        if (index < transcriptSegments.length - 1) {
          const nextTimestamp = transcriptSegments[index + 1]?.querySelector('.segment-timestamp');
          if (nextTimestamp) {
            const nextTime = parseTimestamp(nextTimestamp.textContent.trim());
            if (nextTime !== null) {
              duration = Math.max(1, nextTime - timeInSeconds);
            }
          }
        }
        
        transcript.push({
          text: text,
          start: timeInSeconds,
          duration: duration
        });
      }
    } catch (error) {
      console.warn("Error processing transcript segment:", error);
    }
  });
  
  if (transcript.length === 0) {
    throw new Error("No valid transcript entries could be extracted");
  }
  
  //console.log("Successfully extracted transcript:", transcript.length, "entries");
  return transcript;
}

// Parse timestamp string (e.g., "1:23", "0:05", "12:34") to seconds
function parseTimestamp(timestampStr) {
  try {
    const parts = timestampStr.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      return minutes * 60 + seconds;
    } else if (parts.length === 3) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseInt(parts[2], 10);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return null;
  } catch (error) {
    console.warn("Error parsing timestamp:", timestampStr, error);
    return null;
  }
}

// Open YouTube's transcript panel
async function openTranscriptPanel() {
  //console.log("Attempting to open transcript panel...");

  return new Promise((resolve, reject) => {
    let transcriptButton = document.querySelector('ytd-video-description-transcript-section-renderer button');
    
    if (!transcriptButton) {
      transcriptButton = document.querySelector('[aria-label="Show transcript"], [aria-label*="transcript" i]');
    }
    
    if (!transcriptButton) {
      const buttons = document.querySelectorAll('button, [role="button"]');
      for (const button of buttons) {
        const text = button.textContent || button.innerText || '';
        if (text.toLowerCase().includes('transcript')) {
          transcriptButton = button;
          break;
        }
      }
    }
    
    if (transcriptButton) {
      //console.log("Found transcript button, clicking...");
      transcriptButton.click();
      
      // Wait for transcript panel to load
      let attempts = 0;
      const maxAttempts = 20;
      const checkInterval = setInterval(() => {
        attempts++;
        const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
        
        if (segments.length > 0) {
          //console.log("Transcript panel loaded with", segments.length, "segments");
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error("Transcript panel did not load within expected time"));
        }
      }, 500);
    } else {
      reject(new Error("Could not find transcript button. Video may not have a transcript available."));
    }
  });
}

function extractVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// Clear cached data when navigating to new video
function clearCachedData() {
  //console.log("Clearing cached data for new video...");
  cachedTranscript = null;
  searchResults = [];
  currentSearchIndex = 0;
  
  // Clear previous search
  const searchBox = document.getElementById('transcript-search-box');
  if (searchBox) {
    searchBox.value = '';
  }
  
  // Clear previous search results
  const resultsList = document.getElementById('search-results-list');
  if (resultsList) {
    resultsList.style.display = 'none';
    resultsList.innerHTML = '';
  }
  
  // Clear ...
  const counter = document.getElementById('search-results-counter');
  if (counter) {
    counter.textContent = '';
  }
  
  clearHighlights();
}

// Transcipt stored in memory
let cachedTranscript = null;
let searchResults = [];
let currentSearchIndex = 0;

function injectSearchBox() {
  const transcriptPanel = document.querySelector('ytd-transcript-renderer');
  if (!transcriptPanel) return false;

  if (document.getElementById('transcript-search-box')) return true;

  // Create search
  const searchContainer = document.createElement('div');
  searchContainer.id = 'transcript-search-container';
  searchContainer.style.cssText = `
    padding: 12px;
    border-bottom: 1px solid var(--yt-spec-10-percent-layer);
    background: var(--yt-spec-base-background);
    position: sticky;
    top: 0;
    z-index: 10;
  `;

  const searchInput = document.createElement('input');
  searchInput.id = 'transcript-search-box';
  searchInput.type = 'text';
  searchInput.placeholder = 'Search transcript...';
  searchInput.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--yt-spec-10-percent-layer);
    border-radius: 4px;
    background: var(--yt-spec-base-background);
    color: var(--yt-spec-text-primary);
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  `;

  const resultsCounter = document.createElement('div');
  resultsCounter.id = 'search-results-counter';
  resultsCounter.style.cssText = `
    font-size: 12px;
    color: var(--yt-spec-text-secondary);
    margin-top: 4px;
    text-align: center;
  `;

  // Create navigation buttons
  // const navContainer = document.createElement('div');
  // navContainer.style.cssText = `
  //   display: flex;
  //   justify-content: center;
  //   gap: 8px;
  //   margin-top: 8px;
  // `;

  // const prevButton = document.createElement('button');
  // prevButton.textContent = '↑ Previous';
  // prevButton.style.cssText = `
  //   padding: 4px 8px;
  //   border: 1px solid var(--yt-spec-10-percent-layer);
  //   border-radius: 4px;
  //   background: var(--yt-spec-base-background);
  //   color: var(--yt-spec-text-primary);
  //   cursor: pointer;
  //   font-size: 12px;
  // `;

  // const nextButton = document.createElement('button');
  // nextButton.textContent = '↓ Next';
  // nextButton.style.cssText = prevButton.style.cssText;

  // navContainer.appendChild(prevButton);
  // navContainer.appendChild(nextButton);

  const resultsListContainer = document.createElement('div');
  resultsListContainer.id = 'search-results-list';
  resultsListContainer.style.cssText = `
    max-height: 200px;
    overflow-y: auto;
    margin-top: 8px;
    border: 1px solid var(--yt-spec-10-percent-layer);
    border-radius: 4px;
    background: var(--yt-spec-base-background);
    display: none;
  `;

  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(resultsCounter);
  // searchContainer.appendChild(navContainer);
  searchContainer.appendChild(resultsListContainer); // Add results list

  // Insert at the top of transcript content
  const transcriptContent = transcriptPanel.querySelector('#content');
  if (transcriptContent) {
    transcriptContent.insertBefore(searchContainer, transcriptContent.firstChild);
  }

  // Event listeners
  searchInput.addEventListener('input', handleSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.shiftKey ? navigateSearch(-1) : navigateSearch(1);
    }
  });
  // prevButton.addEventListener('click', () => navigateSearch(-1));
  // nextButton.addEventListener('click', () => navigateSearch(1));

  return true;
}

// Handle search input
let searchTimeout;

function handleSearch(event) {
  const query = event.target.value.trim().toLowerCase();
  
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  if (!query) {
    clearSearch();
    return;
  }

  // Wait 0.3 s after user stops typing before searching (longer videos lagged while typing from frequent searches through long texts)
  searchTimeout = setTimeout(() => {
    performSearchLogic(query);
  }, 300);
}

function performSearchLogic(query) {
  // Ensure we have transcript data
  if (!cachedTranscript) {
    extractTranscriptFromDOM().then(transcript => {
      cachedTranscript = transcript;
      performSearch(query);
    }).catch(console.error);
  } else {
    performSearch(query);
  }
}
 
function performSearch(query) {
  if (!cachedTranscript) return;

  clearHighlights();

  let exactMatches = findExactMatches(query);
  let fuzzyMatches = [];
  
  if (query.length > 3) {
    fuzzyMatches = findFuzzyMatches(query, maxFuzzyResults, exactMatches);
  }

  searchResults = [...exactMatches, ...fuzzyMatches];

  updateSearchResults(query, exactMatches.length, fuzzyMatches.length);
  updateSearchResultsList(query);
  
  if (searchResults.length > 0) {
    currentSearchIndex = 0;
    highlightCurrentResult();
  }
}

function findExactMatches(query) {
  const searchMatches = new Map();
  
  cachedTranscript.forEach((segment, cacheIndex) => {
    if (segment.text.toLowerCase().includes(query)) {
      const matchingElement = findSegmentElement(segment);
      
      if (matchingElement) {
        const uniqueKey = `${segment.start}_${segment.text}`;
        
        if (!searchMatches.has(uniqueKey)) {
          searchMatches.set(uniqueKey, {
            cacheIndex: cacheIndex,
            segment: segment,
            element: matchingElement,
            matchType: 'exact'
          });
        }
      }
    }
  });

  return Array.from(searchMatches.values());
}

function findFuzzyMatches(query, limit = maxFuzzyResults, exactMatches = []) {
  const fuzzyMatches = new Map();
  const queryWords = query.split(/\s+/);
  
  const exactMatchKeys = new Set(exactMatches.map(match => `${match.segment.start}_${match.segment.text}`));
  
  cachedTranscript.forEach((segment, cacheIndex) => {
    const uniqueKey = `${segment.start}_${segment.text}`;
    
    if (exactMatchKeys.has(uniqueKey)) {
      return;
    }
    
    const segmentWords = segment.text.toLowerCase().split(/\s+/);
    
    let hasFuzzyMatch = false;
    let bestSimilarity = 0;
    let matchedWord = '';
    
    for (const queryWord of queryWords) {
      if (queryWord.length < 4) continue;
      
      for (const segmentWord of segmentWords) {
        const similarity = calculateSimilarity(queryWord, segmentWord);
        
        let threshold;
        if (queryWord.length <= 5) {
          threshold = 0.65;
        } else if (queryWord.length <= 7) {
          threshold = 0.70;
        } else {
          threshold = 0.75;
        }
        
        if (similarity >= threshold) {
          hasFuzzyMatch = true;
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            matchedWord = segmentWord;
          }
        }
      }
      
      if (hasFuzzyMatch) break;
    }
    
    if (hasFuzzyMatch) {
      const matchingElement = findSegmentElement(segment);
      
      if (matchingElement) {
        if (!fuzzyMatches.has(uniqueKey)) {
          fuzzyMatches.set(uniqueKey, {
            cacheIndex: cacheIndex,
            segment: segment,
            element: matchingElement,
            matchType: 'fuzzy',
            similarity: bestSimilarity,
            matchedWord: matchedWord
          });
        }
      }
    }
  });

  return Array.from(fuzzyMatches.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// Damerau-Levenshtein distance similarity calculation
function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Handle edge cases
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  const matrix = [];
  for (let i = 0; i <= len1 + 1; i++) {
    matrix[i] = new Array(len2 + 2).fill(Infinity);
  }
  
  matrix[0][0] = 0;
  for (let i = 0; i <= len1; i++) {
    matrix[i + 1][0] = Infinity;
    matrix[i + 1][1] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j + 1] = Infinity;
    matrix[1][j + 1] = j;
  }
  
  const charMap = new Map();
  
  for (let i = 1; i <= len1; i++) {
    let lastMatchCol = 0;
    
    for (let j = 1; j <= len2; j++) {
      const char1 = str1[i - 1];
      const char2 = str2[j - 1];
      
      const lastMatchRow = charMap.get(char2) || 0;
      const cost = char1 === char2 ? 0 : 1;
      
      if (char1 === char2) {
        lastMatchCol = j;
      }
      
      matrix[i + 1][j + 1] = Math.min(
        // Insertion
        matrix[i][j + 1] + 1,
        // Deletion  
        matrix[i + 1][j] + 1,
        // Substitution
        matrix[i][j] + cost,
        // Transposition
        matrix[lastMatchRow][lastMatchCol] + (i - lastMatchRow - 1) + 1 + (j - lastMatchCol - 1)
      );
    }
    
    charMap.set(str1[i - 1], i);
  }
  
  // Similarity = 1 - normalized distance
  const maxLength = Math.max(len1, len2);
  const distance = matrix[len1 + 1][len2 + 1];
  return 1 - (distance / maxLength);
}

// Updated search results
function updateSearchResults(query, exactCount = 0, fuzzyCount = 0) {
  const counter = document.getElementById('search-results-counter');
  if (counter) {
    if (searchResults.length === 0) {
      counter.textContent = 'No results found';
    } else if (fuzzyCount > 0) {
      const total = exactCount + fuzzyCount;
      counter.textContent = `${currentSearchIndex + 1} of ${total} (${exactCount} exact, ${fuzzyCount} similar)`;
    } else {
      counter.textContent = `${currentSearchIndex + 1} of ${searchResults.length}`;
    }
  }
}

// Results list
function updateSearchResultsList(query) {
  const resultsList = document.getElementById('search-results-list');
  if (!resultsList) return;

  resultsList.innerHTML = '';

  if (searchResults.length === 0) {
    resultsList.style.display = 'none';
    return;
  }

  resultsList.style.display = 'block';

  searchResults.forEach((result, index) => {
    const resultItem = document.createElement('div');
    resultItem.style.cssText = `
      padding: 8px 12px;
      border-bottom: 1px solid var(--yt-spec-10-percent-layer);
      cursor: pointer;
      font-size: 12px;
      line-height: 1.4;
      transition: background-color 0.2s;
    `;

    const timestamp = formatTime(result.segment.start);
    
    let highlightedText;
    if (result.matchType === 'exact') {
      highlightedText = highlightSearchTerm(result.segment.text, query);
    } else {
      highlightedText = highlightFuzzyMatch(result.segment.text, query, result.matchedWord);
    }

    // Add match type indicator
    const matchIndicator = result.matchType === 'fuzzy' ? 
      `<span style="color: var(--yt-spec-text-secondary); font-size: 10px;">(similar to "${query || 'unknown'}")</span>` : '';
    
    resultItem.innerHTML = `
      <div style="color: var(--yt-spec-text-secondary); margin-bottom: 2px;">
        ${timestamp} ${matchIndicator}
      </div>
      <div style="color: var(--yt-spec-text-primary);">
        ${highlightedText}
      </div>
    `;

    resultItem.addEventListener('mouseenter', () => {
      resultItem.style.backgroundColor = 'var(--yt-spec-10-percent-layer)';
    });
    
    resultItem.addEventListener('mouseleave', () => {
      if (index !== currentSearchIndex) {
        resultItem.style.backgroundColor = '';
      }
    });

    resultItem.addEventListener('click', () => {
      currentSearchIndex = index;
      highlightCurrentResult();
      updateSearchResults(query, 0, 0);
      updateResultsListSelection();
      
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = result.segment.start;
      }
    });

    resultsList.appendChild(resultItem);
  });
  const hasFuzzyMatches = searchResults.some(r => r.matchType === 'fuzzy');
  const exactMatches = searchResults.filter(r => r.matchType === 'exact');
  // show show similar button even if theres an exact match since someone might have typed built and built does appear in the video but the section they really wanted to get to was build
  if (query.length > 3) {
    addShowSimilarButton(resultsList, query);
  }

  updateResultsListSelection();
}

function addShowSimilarButton(resultsList, query) {
  if (showSimilarButton) {
    showSimilarButton.remove();
  }
  
  const currentFuzzyCount = searchResults.filter(r => r.matchType === 'fuzzy').length;
  const buttonText = currentFuzzyCount > 0 ? 'Show 5 More Similar' : 'Find Similar Results';
  
  showSimilarButton = document.createElement('button');
  showSimilarButton.textContent = buttonText;
  showSimilarButton.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    margin-top: 4px;
    border: 1px solid var(--yt-spec-10-percent-layer);
    border-radius: 4px;
    background: var(--yt-spec-base-background);
    color: var(--yt-spec-text-secondary);
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.2s;
  `;
  
  showSimilarButton.addEventListener('mouseenter', () => {
    showSimilarButton.style.backgroundColor = 'var(--yt-spec-10-percent-layer)';
  });
  
  showSimilarButton.addEventListener('mouseleave', () => {
    showSimilarButton.style.backgroundColor = '';
  });
  
  showSimilarButton.addEventListener('click', () => {
    loadMoreSimilarResults(query);
  });
  
  resultsList.appendChild(showSimilarButton);
}

function loadMoreSimilarResults(query) {
  maxFuzzyResults += 5;
  
  // exact then fuzzy
  const exactMatches = searchResults.filter(r => r.matchType === 'exact');
  const allFuzzyMatches = findFuzzyMatches(query, maxFuzzyResults, exactMatches);
  
  searchResults = [...exactMatches, ...allFuzzyMatches];
  
  // Update UI
  const exactCount = exactMatches.length;
  const fuzzyCount = allFuzzyMatches.length;
  
  updateSearchResults(query, exactCount, fuzzyCount);
  updateSearchResultsList(query);
  
  // Update button text
  if (showSimilarButton) {
    if (allFuzzyMatches.length === 0 || fuzzyCount < maxFuzzyResults - 5) {
      showSimilarButton.textContent = 'No more similar results';
      showSimilarButton.style.color = 'var(--yt-spec-text-disabled)';
      showSimilarButton.style.cursor = 'default';
      showSimilarButton.onclick = null;
    } else {
      showSimilarButton.textContent = 'Show 5 More Similar';
    }
  }
}

function highlightFuzzyMatch(text, query, matchedWord) {
  if (!matchedWord) {
    // Fallback: try to find which word actually matched
    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);
    const originalWords = text.split(/\s+/);
    
    for (let i = 0; i < queryWords.length; i++) {
      const queryWord = queryWords[i];
      if (queryWord.length < 4) continue;
      
      for (let j = 0; j < textWords.length; j++) {
        const textWord = textWords[j];
        const similarity = calculateSimilarity(queryWord, textWord);
        
        if (similarity >= 0.65) {
          matchedWord = originalWords[j];
          break;
        }
      }
      if (matchedWord) break;
    }
  }
  
  if (matchedWord) {
    const cleanMatchedWord = matchedWord.replace(/[^\w]/g, '');
    const regex = new RegExp(`\\b(${escapeRegExp(cleanMatchedWord)}[^\\s]*)\\b`, 'gi');
    
    return text.replace(regex, '<span style="background-color: orange; color: white; padding: 0 2px; border-radius: 2px;">$1</span>');
  }
  
  return text;
}

// Element matching using timestamp and text content
function findSegmentElement(targetSegment) {
  const domSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
  
  for (const domElement of domSegments) {
    // Extract timestamp and text from DOM element
    const timestampElement = domElement.querySelector('.segment-timestamp');
    if (!timestampElement) continue;
    
    const timestampText = timestampElement.textContent.trim();
    const domTimeInSeconds = parseTimestamp(timestampText);
    
    const textElement = domElement.querySelector('.segment-text, yt-formatted-string.segment-text');
    if (!textElement) continue;
    
    let domText = textElement.textContent || textElement.innerText || '';
    domText = domText.replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').trim();
    
    // Match
    const timestampMatch = Math.abs(domTimeInSeconds - targetSegment.start) <= 1;
    const textMatch = domText === targetSegment.text;
    
    if (timestampMatch && textMatch) {
      return domElement;
    }
  }
  
  // Fallback
  for (const domElement of domSegments) {
    const textElement = domElement.querySelector('.segment-text, yt-formatted-string.segment-text');
    if (!textElement) continue;
    
    let domText = textElement.textContent || textElement.innerText || '';
    domText = domText.replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').trim();
    
    if (domText === targetSegment.text) {
      return domElement;
    }
  }
  
  console.warn('Could not find DOM element for segment:', targetSegment);
  return null;
}

function performSearchWithCache(query) {
  if (!cachedTranscript) return;

  // Clear previous highlights
  clearHighlights();

  // Find matching segments and remove duplicates (not sure why there were duplicates when cache was cleared but there randomly were duplicates)
  const searchMatches = new Map();
  
  cachedTranscript.forEach((segment, cacheIndex) => {
    if (segment.text.toLowerCase().includes(query)) {
      const matchingElement = findSegmentElement(segment);
      
      if (matchingElement) {
        const uniqueKey = `${segment.start}_${segment.text}`;
        
        if (!searchMatches.has(uniqueKey)) {
          searchMatches.set(uniqueKey, {
            cacheIndex: cacheIndex,
            segment: segment,
            element: matchingElement
          });
        }
      }
    }
  });

  searchResults = Array.from(searchMatches.values());

  // Update UI
  updateSearchResults();
  updateSearchResultsList(query);
  if (searchResults.length > 0) {
    currentSearchIndex = 0;
    highlightCurrentResult();
  }
}

// Cache refresh
function refreshTranscriptCache() {
  //console.log("Refreshing transcript cache...");
  
  extractTranscriptFromDOM().then(transcript => {
    cachedTranscript = transcript;
    //console.log("Cache refreshed with", transcript.length, "segments");
    
    // Re-perform current search if there is one
    const searchBox = document.getElementById('transcript-search-box');
    if (searchBox && searchBox.value.trim()) {
      performSearch(searchBox.value.trim().toLowerCase());
    }
  }).catch(error => {
    console.error("Failed to refresh cache:", error);
  });
}

function checkAndInjectSearchBox() {
  const transcriptPanel = document.querySelector('ytd-transcript-renderer');
  const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
  const hasSearchBox = document.getElementById('transcript-search-container');
  
  const transcriptTab = document.querySelector('button[aria-label="Transcript"]');
  const isTranscriptActive = transcriptTab && transcriptTab.getAttribute('aria-selected') === 'true';
  
  // Hide YouTube's native search box if it exists (weirdly randomly decides if appearing or not, normally more so on longer form content with chapters)
  hideNativeSearchBox();
  
  // If transcript panel exists with segments, is active, but no search box, inject it
  if (transcriptPanel && transcriptSegments.length > 0 && isTranscriptActive && !hasSearchBox) {
    //console.log("Transcript tab active without search box, injecting...");
    
    refreshTranscriptCache();
    
    setTimeout(() => {
      if (injectSearchBox()) {
        //console.log("Search box injected successfully");
        hideNativeSearchBox();
      }
    }, 100);
  }
}

// Highlight searched word
function highlightSearchTerm(text, searchTerm) {
  const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
  return text.replace(regex, '<span style="background-color: yellow; color: black; padding: 0 2px; border-radius: 2px;">$1</span>');
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function updateResultsListSelection() {
  const resultsList = document.getElementById('search-results-list');
  if (!resultsList) return;

  const resultItems = resultsList.children;
  for (let i = 0; i < resultItems.length; i++) {
    if (i === currentSearchIndex) {
      resultItems[i].style.backgroundColor = 'var(--yt-spec-brand-background-primary)';
    } else {
      resultItems[i].style.backgroundColor = '';
    }
  }
}

// Update search results counter (number of matches)
function updateSearchResults() {
  const counter = document.getElementById('search-results-counter');
  if (counter) {
    if (searchResults.length === 0) {
      counter.textContent = 'No results found';
    } else {
      counter.textContent = `${currentSearchIndex + 1} of ${searchResults.length}`;
    }
  }
}

function navigateSearch(direction) {
  if (searchResults.length === 0) return;

  currentSearchIndex += direction;
  if (currentSearchIndex >= searchResults.length) currentSearchIndex = 0;
  if (currentSearchIndex < 0) currentSearchIndex = searchResults.length - 1;

  highlightCurrentResult();
  updateSearchResults();
  updateResultsListSelection();
  
  // scrollResultsListToSelection();
}

// function scrollResultsListToSelection() {
//   const resultsList = document.getElementById('search-results-list');
//   if (!resultsList || searchResults.length === 0) return;

//   const currentItem = resultsList.children[currentSearchIndex];
//   if (currentItem) {
//     currentItem.scrollIntoView({
//       behavior: 'smooth',
//       block: 'nearest'
//     });
//   }
// }


function highlightCurrentResult() {
  clearHighlights();

  if (searchResults.length === 0) return;

  const currentResult = searchResults[currentSearchIndex];
  if (currentResult.element) {
    currentResult.element.style.backgroundColor = 'var(--yt-spec-brand-background-primary)';
    currentResult.element.style.borderRadius = '4px';
    
    const transcriptPanel = document.querySelector('ytd-transcript-renderer #content');
    if (transcriptPanel) {
      const elementRect = currentResult.element.getBoundingClientRect();
      const panelRect = transcriptPanel.getBoundingClientRect();
      
      if (elementRect.top < panelRect.top || elementRect.bottom > panelRect.bottom) {
        const scrollOffset = currentResult.element.offsetTop - transcriptPanel.scrollTop - (transcriptPanel.clientHeight / 2);
        transcriptPanel.scrollTo({
          top: scrollOffset,
          behavior: 'smooth'
        });
      }
    }

    highlightTextInSegment(currentResult.element, document.getElementById('transcript-search-box').value);
  }
}

function highlightTextInSegment(segmentElement, searchTerm) {
  const textElement = segmentElement.querySelector('.segment-text, yt-formatted-string.segment-text');
  if (!textElement) return;

  const originalText = textElement.textContent;
  const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
  
  const highlightedHTML = originalText.replace(regex, '<mark style="background-color: yellow; color: black;">$1</mark>');
  textElement.innerHTML = highlightedHTML;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function openTranscriptSearch() {
  //console.log("Opening transcript search...");
  
  try {
    openTranscriptPanel();
    
    setTimeout(() => {
      focusSearchBox();
    }, 200);
    
  } catch (error) {
    console.error("Failed to open transcript search:", error);
    createSearchInterface();
  }
}

function focusSearchBox() {
  //console.log("Focusing search box...");
  
  const searchSelectors = [
    '#transcript-search-box',
    '#search-input',
    '.search-box',
    'input[type="search"]',
    'input[placeholder*="search" i]',
    '.transcript-search input'
  ];
  
  for (const selector of searchSelectors) {
    const searchBox = document.querySelector(selector);
    if (searchBox) {
      searchBox.focus();
      //console.log(`Focused search box with selector: ${selector}`);
      return true;
    }
  }
  
  //console.warn("No search box found to focus");
  return false;
}

function createSearchInterface() {
  //console.log("Creating fallback search interface...");
  
  if (document.querySelector('#fallback-search')) {
    return;
  }
  
  const searchContainer = document.createElement('div');
  searchContainer.id = 'fallback-search';
  searchContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 2px solid #ccc;
    border-radius: 8px;
    padding: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;
  
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search transcript...';
  searchInput.style.cssText = `
    width: 250px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    margin-right: 5px;
  `;
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    background: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  `;
  
  closeButton.addEventListener('click', () => {
    searchContainer.remove();
  });
  
  searchInput.addEventListener('input', (e) => {
    //console.log(`Searching for: ${e.target.value}`);
    performTranscriptSearch(e.target.value);
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchContainer.remove();
    }
  });
  
  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(closeButton);
  document.body.appendChild(searchContainer);
  
  searchInput.focus();
}

function performTranscriptSearch(query) {
  if (!query || query.length < 2) {
    return;
  }
  
  //console.log(`Performing search for: "${query}"`);
  
  const escapedQuery = escapeRegExp(query);
  const regex = new RegExp(escapedQuery, 'gi');
  
  //console.log(`Regex pattern created: ${regex}`);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeRegExp,
    openTranscriptSearch,
    focusSearchBox,
    openTranscriptPanel,
    createSearchInterface,
    performTranscriptSearch
  };
}

function clearHighlights() {
  const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
  segments.forEach(segment => {
    segment.style.backgroundColor = '';
    segment.style.borderRadius = '';
    
    // Restore original text
    const textElement = segment.querySelector('.segment-text, yt-formatted-string.segment-text');
    if (textElement && textElement.innerHTML.includes('<mark')) {
      textElement.innerHTML = textElement.textContent;
    }
  });
}

function clearSearch() {
  searchResults = [];
  currentSearchIndex = 0;
  clearHighlights();
  updateSearchResults();
  maxFuzzyResults = 10;
  showSimilarButton = null;
  
  // Hide results list
  const resultsList = document.getElementById('search-results-list');
  if (resultsList) {
    resultsList.style.display = 'none';
  }
}

function openTranscriptSearch() {
  //console.log("Opening transcript search...");
  
  openTranscriptPanel().then(() => {
    setTimeout(() => {
      if (injectSearchBox()) {
        document.getElementById('transcript-search-box')?.focus();
      }
    }, 1000);
  }).catch(console.error);
}

function focusSearchBox() {
  const searchBox = document.getElementById('transcript-search-box');
  if (searchBox) {
    searchBox.focus();
  } else {
    if (injectSearchBox()) {
      setTimeout(() => {
        document.getElementById('transcript-search-box')?.focus();
      }, 100);
    }
  }
}

// Monitor for transcript panel and inject search box (for longer form content with multiple transcript tabs ie chapters)
function monitorForTranscriptPanel() {
  setInterval(() => {
    ensureTranscriptWithSearch();
  }, 3000);
  
  // Also watch for navigation changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (url.includes('/watch')) {
        setTimeout(initializeAutoTranscript, 1000);
      }
    }
  }).observe(document, { subtree: true, childList: true });
}

function ensureTranscriptWithSearch() {
  if (!autoOpenEnabled) return;
  
  const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
  const hasSearchBox = document.getElementById('transcript-search-container');
  
  // If we're on a watch page but no transcript is visible
  if (location.href.includes('/watch') && transcriptSegments.length === 0) {
    //console.log("No transcript segments found, attempting to open transcript");
    openTranscriptPanel().catch(() => {
    });
  }
  
  // If transcript exists but no search box
  if (transcriptSegments.length > 0 && !hasSearchBox) {
    //console.log("Transcript found without search box, injecting");
    if (injectSearchBox()) {
      hideNativeSearchBox();
    }
  }
}

function attachTabListeners() {
  const tabButtons = document.querySelectorAll('chip-shape button[role="tab"]');
  
  tabButtons.forEach(button => {
    if (!button.hasTranscriptTabListener) {
      button.hasTranscriptTabListener = true;
      button.addEventListener('click', (e) => {
        const ariaLabel = button.getAttribute('aria-label');
        //console.log(`Tab clicked: ${ariaLabel}`);
        
        if (ariaLabel === 'Transcript') {
          setTimeout(() => {
            checkAndInjectSearchBox();
          }, 500);
        }
      });
    }
  });
}

function checkAndInjectSearchBox() {
  const transcriptPanel = document.querySelector('ytd-transcript-renderer');
  const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
  const hasSearchBox = document.getElementById('transcript-search-container');
  
  // Check if transcript tab is actually selected
  const transcriptTab = document.querySelector('button[aria-label="Transcript"]');
  const isTranscriptActive = transcriptTab && transcriptTab.getAttribute('aria-selected') === 'true';
  
  hideNativeSearchBox();
  
  if (transcriptPanel && transcriptSegments.length > 0 && isTranscriptActive && !hasSearchBox) {
    //console.log("Transcript tab active without search box, injecting...");
    
    setTimeout(() => {
      if (injectSearchBox()) {
        //console.log("Search box injected successfully");
        
        hideNativeSearchBox();
        
        // Ensure we have transcript data cached
        if (!cachedTranscript) {
          extractTranscriptFromDOM().then(transcript => {
            cachedTranscript = transcript;
            //console.log("Transcript data cached");
          }).catch(console.error);
        }
      }
    }, 100);
  }
}

// Hide YouTube's native transcript search box (I couldn't find why but the search wasn't always appearing and didnt work exactly as intended)
function hideNativeSearchBox() {
  const nativeSearchBox = document.querySelector('ytd-transcript-search-box-renderer');
  if (nativeSearchBox) {
    nativeSearchBox.style.display = 'none';
    //console.log("Hidden YouTube's native search box");
  }
  
  const searchHeader = document.querySelector('ytd-transcript-search-panel-renderer #header');
  if (searchHeader) {
    searchHeader.style.display = 'none';
  }
  
  const searchInputContainer = document.querySelector('tp-yt-paper-input-container.input-container');
  if (searchInputContainer && searchInputContainer.closest('ytd-transcript-search-box-renderer')) {
    searchInputContainer.style.display = 'none';
  }
}