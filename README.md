# Integrated Search for YouTube Transcript

<img src="Extension/assets/logo.png" width="50" alt="Extension Logo">

THE Chrome extension for finding keywords or phrases in YouTube videos, allowing you to jump in exactly where you want quickly, with seamless integration into YouTube's existing UI.

## Features ✨

- 🔍 **Transcript Search**: Download and search video transcripts for key words or phrases.
- ⏩ **Smart Navigation**: Jump directly to any words/phrases in the video.
- 📊 **Frequency Insights**: See how often words appear in a video.
- 🎨 **Clean UI Integration**: Minimal popup UI with transcript search integrated into YouTube's interface.
- ⚡ **High Performance**: Lightning-fast speeds for videos under an hour, with moderate performance for 10+ hour videos.

## Installation 🛠️

### Option 1: Chrome Web Store (Recommended)
1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/youtube-transcript-search/pefodabjgdohmfnaiifenaboaijhfkdd).
2. Toggle the extension to enable it.

### Option 2: Manual Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/caspianlack/YouTubeSubtitleSearch.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" (toggle in the top-right corner).
4. Click "Load unpacked" and select the zip named "Extension" in the cloned repository folder.
5. Toggle the extension to enable it.

## Usage 📋

1. **Open any YouTube video** once the extension is installed
2. The **video transcript should appear on the left** where you can search for keywords
3. **If the transcript search doesn't appear:**
- The extension automatically detects YouTube videos, opens the YouTube transcript, and reads the DOM element containing the text and timestamps
- Search functionality highlights matching terms and provides quick navigation using first exact contains matches, then falls back to Levenshtein distance similarity calculations to find similar words (handling both transcript errors and user input errors).
- Scroll through the results and click to jump to where you want to go in the video.

## How It Works 🔧

- The extension automatically detects YouTube videos; opens up the YouTube Transcript, reads the DOM element containing the text and timestamps.
- Search functionality highlights matching terms and provides quick navigation using first exact contains matches and falls back to use Levenshtein distance similarity calculations to find similar words from either transcript error or user input error.
- Scroll through the results and clickt to where you want to jump into.

## Troubleshooting 🐛

- **Transcript not loading?** Try refreshing the page or check if the video has captions available.
- **Extension not working?** Make sure it's enabled in `chrome://extensions/`.
- **Performance issues?** Skill issue.

## Contributing 🤝

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue for bug reports and feature requests.

## License 📄

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support 💬

If you encounter any issues or have suggestions, please [open an issue](https://github.com/caspianlack/YouTubeSubtitleSearch/issues) on GitHub.