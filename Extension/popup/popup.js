let currentTab;
let autoOpenEnabled = true; // Default state

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  currentTab = tab;
  
  // Check if we're on a YouTube video page
  if (!currentTab.url || !currentTab.url.includes('youtube.com/watch')) {
    showStatus('Please navigate to a YouTube video page first.', 'error');
    document.getElementById('openTranscriptBtn').disabled = true;
    document.getElementById('downloadBtn').disabled = true;
    return;
  }
  
  // Load saved auto-open setting
  await loadAutoOpenSetting();
  
  // Set up event listeners
  document.getElementById('openTranscriptBtn').addEventListener('click', openTranscript);
  document.getElementById('downloadBtn').addEventListener('click', downloadTranscript);
  document.getElementById('autoOpenToggle').addEventListener('click', toggleAutoOpen);
  document.getElementById('debugBtn').addEventListener('click', toggleDebugInfo);
  document.getElementById('supportBtn').addEventListener('click', openSupportPage);
  
  // Wait a bit for content script to load, then notify
  setTimeout(async () => {
    try {
      await chrome.tabs.sendMessage(currentTab.id, {action: "openPopup"});
    } catch (error) {
      console.log("Content script not ready yet");
    }
  }, 1000);
});

async function loadAutoOpenSetting() {
  try {
    // Get saved setting from storage
    const result = await chrome.storage.sync.get(['autoOpenEnabled']);
    autoOpenEnabled = result.autoOpenEnabled !== undefined ? result.autoOpenEnabled : true;
    
    // Update UI
    updateToggleButton();
    
    // Try to send current setting to content script with retry
    if (currentTab) {
      await sendMessageWithRetry(currentTab.id, {
        action: "toggleAutoOpen",
        enabled: autoOpenEnabled
      });
    }
  } catch (error) {
    console.log("Could not load auto-open setting:", error);
  }
}

async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error; // Throw on final attempt
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function toggleAutoOpen() {
  try {
    // Toggle the setting
    autoOpenEnabled = !autoOpenEnabled;
    
    // Save to storage first (this should always work)
    await chrome.storage.sync.set({ autoOpenEnabled: autoOpenEnabled });
    
    // Update UI immediately
    updateToggleButton();
    
    // Try to send to content script (but don't fail if it's not ready)
    try {
      await sendMessageWithRetry(currentTab.id, {
        action: "toggleAutoOpen",
        enabled: autoOpenEnabled
      });
    } catch (contentScriptError) {
      console.log("Content script not ready, setting will be applied on next page load");
      // This is OK - the setting is saved and will be applied when the content script loads
    }
    
    // Show success status
    showStatus(
      autoOpenEnabled ? 'Auto-open enabled' : 'Auto-open disabled',
      'success'
    );
    
  } catch (error) {
    console.error('Toggle auto-open error:', error);
    
    // If storage failed, revert the toggle
    autoOpenEnabled = !autoOpenEnabled;
    updateToggleButton();
    
    showStatus('Could not save setting. Please try again.', 'error');
  }
}

function updateToggleButton() {
  const toggleBtn = document.getElementById('autoOpenToggle');
  if (autoOpenEnabled) {
    toggleBtn.textContent = 'ON';
    toggleBtn.className = 'toggle-btn on';
  } else {
    toggleBtn.textContent = 'OFF';
    toggleBtn.className = 'toggle-btn off';
  }
}

async function openTranscript() {
  try {
    showStatus('Opening transcript...', 'info');
    
    // Send message to content script to open transcript with retry
    const response = await sendMessageWithRetry(currentTab.id, {
      action: "openTranscript"
    });
    
    if (response && response.success) {
      showStatus('Transcript opened!', 'success');
    } else {
      showStatus('Transcript opened', 'success');
    }
  } catch (error) {
    console.error('Open transcript error:', error);
    showStatus('Could not open transcript. Refreshing page...', 'error');
    
    // Set flag to show success message after refresh
    localStorage.setItem('transcriptRefreshPending', 'true'); 
    //TODO: update error message to page refreshed after page refreshes if needed to refresh page to open transcript (new tab)
    
    setTimeout(() => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.reload(tabs[0].id);
      });
    }, 1500);
  }
}

async function downloadTranscript() {
  try {
    showStatus('Getting transcript...', 'info');
    
    const response = await sendMessageWithRetry(currentTab.id, {
      action: "getTranscript"
    });
    
    if (response?.error) {
      throw new Error(response.error);
    }
    
    if (!response?.transcript || !Array.isArray(response.transcript)) {
      throw new Error("No transcript data available");
    }
    
    if (response.transcript.length === 0) {
      throw new Error("Transcript is empty");
    }
    
    console.log("Download: Got transcript with", response.transcript.length, "entries");
    
    const videoTitle = await getVideoTitle();
    const transcriptText = formatTranscriptForDownload(response.transcript, videoTitle);
    downloadAsFile(transcriptText, `${videoTitle} - Transcript.txt`);
    
    showStatus(`Downloaded transcript with ${response.transcript.length} entries!`, 'success');
    
    console.log("Full transcript downloaded:", response.transcript.length, "entries");
  } catch (error) {
    console.error("Download failed:", error);
    if (error.message.includes("Could not establish connection")) {
      showStatus('Connection failed. Please refresh the page and wait for it to fully load before trying again.', 'error');
    } else {
      showStatus(`Download failed: ${error.message}. Make sure the video has captions available.`, 'error');
    }
  }
}

function openSupportPage() {
  chrome.tabs.create({
    url: 'https://buymeacoffee.com/caspianlack'
  });
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status-${type}`;
  statusDiv.style.display = 'block';
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}

function toggleDebugInfo() {
  const debugDiv = document.getElementById('debugInfo');
  const debugBtn = document.getElementById('debugBtn');
  const isVisible = debugDiv.style.display !== 'none';
  
  if (isVisible) {
    debugDiv.style.display = 'none';
    debugBtn.textContent = 'Show Debug Info';
    return;
  }
  
  debugDiv.style.display = 'block';
  debugBtn.textContent = 'Hide Debug Info';
  debugDiv.innerHTML = '<div>Loading debug info...</div>';
  
  sendMessageWithRetry(currentTab.id, {action: "getTranscript"})
    .then(response => {
      const debugInfo = {
        hasTranscript: !!response?.transcript,
        transcriptLength: response?.transcript?.length || 0,
        error: response?.error || null,
        sampleEntries: response?.transcript?.slice(0, 3) || [],
        currentUrl: currentTab.url,
        extensionVersion: "1.0.0",
        browser: "Chrome"
      };
      
      debugDiv.innerHTML = `<pre>${JSON.stringify(debugInfo, null, 2)}</pre>`;
    })
    .catch(error => {
      debugDiv.innerHTML = `<div class="status-error">Debug error: ${error.message}</div>`;
    });
}

function formatTranscriptForDownload(transcript, title) {
  let output = `${title}\nTranscript\n${'='.repeat(50)}\n\n`;
  
  transcript.forEach((entry, index) => {
    const timeStr = formatTime(entry.start);
    output += `[${timeStr}] ${entry.text}\n`;
    
    // Add some spacing every 10 entries for readability
    if ((index + 1) % 10 === 0) {
      output += '\n';
    }
  });
  
  output += `\n${'='.repeat(50)}\n`;
  output += `Total entries: ${transcript.length}\n`;
  output += `Generated: ${new Date().toLocaleString()}\n`;
  
  return output;
}

function downloadAsFile(content, filename) {
  // Clean filename for download
  const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '_');
  
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function getVideoTitle() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const result = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => {
        // Try multiple selectors for video title
        const titleSelectors = [
          'h1.ytd-video-primary-info-renderer',
          'h1.title',
          'h1 yt-formatted-string',
          '.watch-main-col h1'
        ];
        
        for (let selector of titleSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            return element.textContent.trim();
          }
        }
        
        // Fallback to document title
        return document.title.replace(' - YouTube', '').trim();
      }
    });
    
    const title = result[0]?.result;
    return title || "YouTube Video";
  } catch (error) {
    console.error("Error getting video title:", error);
    return "YouTube Video";
  }
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}