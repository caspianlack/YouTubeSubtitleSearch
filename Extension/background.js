chrome.runtime.onInstalled.addListener(() => {
  //console.log('Extension installed');
  initializeContextMenu();
});

function initializeContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "search-transcript",
      title: "Search Transcript",
      contexts: ["page"],
      documentUrlPatterns: ["*://*.youtube.com/watch*"]
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "search-transcript") {
    chrome.tabs.sendMessage(tab.id, { action: "openPopup" });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-search") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "focusSearch" });
      }
    });
  }
});

// Message handler for transcript requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchTranscript") {
    fetchTranscriptFromYouTubePage(request.videoId, request.videoUrl)
      .then(transcript => {
        //console.log("Background: Transcript fetched successfully:", transcript?.length || 0, "entries");
        sendResponse({ transcript, success: true });
      })
      .catch(error => {
        //console.error("Background: Error fetching transcript:", error);
        sendResponse({ transcript: null, success: false, error: error.message });
      });
    return true;
  }
});

// Extract transcript data directly from YouTube page
async function fetchTranscriptFromYouTubePage(videoId, videoUrl) {
  //console.log("Fetching transcript from YouTube page:", videoUrl);
  
  try {
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`YouTube page fetch failed: ${response.status}`);
    }
    
    const html = await response.text();
    //console.log("Got YouTube page HTML, length:", html.length);
    
    let playerResponse = null;
    
    const patterns = [
      /var ytInitialPlayerResponse = ({.+?});/,
      /"playerResponse":"({.+?})"/,
      /ytInitialPlayerResponse":\s*({.+?}),/,
      /'PLAYER_VARS':\s*({.+?})/
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          let jsonStr = match[1];
          // Handle escaped JSON strings
          if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
            jsonStr = jsonStr.slice(1, -1)
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
          }
          playerResponse = JSON.parse(jsonStr);
          console.log("Found player response");
          break;
        } catch (e) {
          console.log("Failed to parse player response:", e.message);
        }
      }
    }
    
    if (!playerResponse) {
      throw new Error("Could not find player response in YouTube page");
    }
    
    // Extract caption tracks from player response
    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const automaticCaptions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.automaticCaptions || [];
    
    // console.log("Manual captions found:", captions.length);
    // console.log("Automatic captions found:", automaticCaptions.length);
    
    const allCaptions = [...captions];
    automaticCaptions.forEach(langGroup => {
      if (langGroup.captionTracks) {
        allCaptions.push(...langGroup.captionTracks);
      }
    });
    
    if (allCaptions.length === 0) {
      throw new Error("No caption tracks found in player response");
    }
    
    let selectedTrack = allCaptions.find(track => 
      (track.languageCode === 'en' || track.languageCode?.startsWith('en')) && 
      track.kind !== 'asr'
    ) || allCaptions.find(track => 
      track.languageCode === 'en' || track.languageCode?.startsWith('en')
    ) || allCaptions[0];
    
    // console.log("Selected track:", {
    //   languageCode: selectedTrack.languageCode,
    //   name: selectedTrack.name?.simpleText || selectedTrack.name,
    //   kind: selectedTrack.kind,
    //   isAutomatic: selectedTrack.kind === 'asr'
    // });
    
    const transcriptUrl = selectedTrack.baseUrl;
    //console.log("Fetching transcript from:", transcriptUrl);
    
    const transcriptResponse = await fetch(transcriptUrl);
    if (!transcriptResponse.ok) {
      throw new Error(`Transcript fetch failed: ${transcriptResponse.status}`);
    }
    
    const transcriptXml = await transcriptResponse.text();
    //console.log("Transcript XML length:", transcriptXml.length);
    
    return parseTranscriptXML(transcriptXml);
    
  } catch (error) {
    console.error("YouTube page extraction error:", error);
  }
}

// Parse YouTube's XML transcript format
function parseTranscriptXML(xml) {
  //console.log("Parsing XML transcript...");
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error("Failed to parse transcript XML");
  }
  
  const textElements = doc.getElementsByTagName('text');
  
  if (textElements.length === 0) {
    throw new Error("No transcript text found in XML");
  }
  
  const transcript = Array.from(textElements).map(text => {
    const textContent = text.textContent || text.innerText || '';
    const start = parseFloat(text.getAttribute('start')) || 0;
    const duration = parseFloat(text.getAttribute('dur')) || 0;
    
    return {
      text: decodeHTMLEntities(textContent.trim()),
      start: start,
      duration: duration
    };
  }).filter(entry => entry.text.length > 0);
  
  //console.log("Parsed transcript entries:", transcript.length);
  return transcript;
}

function decodeHTMLEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}