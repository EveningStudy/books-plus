<div align="center">

<img src="design/icon.svg" width="112" alt="Books+">

# Books+

**Your Apple Books library, on Windows too.**

Books+ is a desktop e-book reader that feels like Apple Books. On your Mac, it syncs your Apple Books library, progress and notes to your cloud drive. Switch to Windows, open the same shelf and continue from your saved position.<br>
When your eyes get tired, let it read to you, with subtitles floating on your desktop.

[![Release](https://img.shields.io/github/v/release/EveningStudy/books-plus?include_prereleases&label=release&color=e87822)](https://github.com/EveningStudy/books-plus/releases)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-262422)
[![License](https://img.shields.io/badge/license-MIT-8c8986)](LICENSE)

[简体中文](README.md) · **English**

[Download](https://github.com/EveningStudy/books-plus/releases) · [User guide](docs/GUIDE.en.md) · [FAQ](docs/GUIDE.en.md#faq) · [Development](docs/DEVELOPMENT.md)

<br>

<img src="docs/assets/screenshots/library-grid.png" alt="The Books+ library" width="880">

</div>

<br>

## 🍎 Picks up right where Apple Books left off

You don't have to give up Apple Books. Keep reading in it on your Mac as usual, while Books+ sits quietly in the menu bar and syncs your books and reading history to your cloud drive.

- **Books**: DRM-free EPUBs and PDFs in Apple Books show up on your Books+ shelf automatically.
- **Your place**: continue on Windows from the reading position saved on your Mac. For EPUBs with the same content revision, Books+ can also send your position back to Apple Books; page-start alignment may need manual confirmation.
- **Highlights and notes**: bookmarks, highlights, notes and "finished" status all come along.
- **Hands off**: Books+ only reads Apple Books data and never modifies its database. Deleting a book in Books+ never deletes it from Apple Books.

<table>
  <tr>
    <td><img src="docs/assets/screenshots/mac-sync.png" alt="Apple Books sync settings on the Mac"></td>
    <td><img src="docs/assets/screenshots/reader-resume.png" alt="Continue reading"></td>
  </tr>
  <tr>
    <td align="center"><sub>Turn on Apple Books sync on your Mac</sub></td>
    <td align="center"><sub>Switch computers and pick up on the same page</sub></td>
  </tr>
</table>

<sub>Books bought from the Apple Books store are DRM-protected and can't be synced; DRM-free EPUBs and PDFs you added yourself can. PDF positions and notes currently only flow out of Apple Books, not back in. See the [user guide](docs/GUIDE.en.md#mac-and-apple-books) for details.</sub>

## 🎧 Listen, with subtitles on your desktop

When you'd rather not stare at a screen, let Books+ read to you.

- **Online**: Microsoft Edge voices in Chinese, English, Japanese, Cantonese and more, ready out of the box.
- **Offline**: use your system voices, or download local neural voice models like ZipVoice, Pocket TTS or Kitten. They run on a CPU, no graphics card needed, and not a word of your book leaves your computer.
- **Handy**: adjust the speed, set a sleep timer, and let pages turn on their own as it reads.

While it reads, the subtitles can pop out of the reader into a small transparent window that stays on top. Go write a document or browse the web, and it sits quietly in a corner of your screen. With Edge voices, the current word is highlighted too. Lock it and your mouse clicks pass straight through, so it never gets in the way.

<p align="center">
  <img src="docs/assets/screenshots/desktop-subtitles.png" alt="Desktop subtitle window" width="720">
</p>

<table>
  <tr>
    <td><img src="docs/assets/screenshots/settings-models.png" alt="Local voice models"></td>
    <td><img src="docs/assets/screenshots/settings-subtitles.png" alt="Subtitle settings"></td>
  </tr>
  <tr>
    <td align="center"><sub>Pick a voice you like</sub></td>
    <td align="center"><sub>Size, color, outline and line count are all adjustable</sub></td>
  </tr>
</table>

## And also

<table>
<tr>
<td width="50%" valign="top">

### ☁️ Your library is just a folder

No account, no server. Any folder in iCloud Drive, OneDrive or Google Drive can be your library. Point two computers at the same one and your books and progress line up.

</td>
<td width="50%" valign="top">

### 🎨 Comfortable typography

Six themes, plus control over font, size and spacing. Single or two-page spreads, paged or scrolling, with an optional page-curl animation.

</td>
</tr>
<tr>
<td valign="top">

### 🖍️ Bookmarks, highlights and notes

Select text to highlight it and jot down a note. Full-text search and the table of contents sit in the sidebar.

</td>
<td valign="top">

### 📖 More than EPUB

PDF, TXT, Markdown and comics open directly. Install Calibre and MOBI, AZW3 and DOCX work too.

</td>
</tr>
</table>

## Screenshots

<table>
  <tr>
    <td><img src="docs/assets/screenshots/reader-light.png" alt="Two-page reading"></td>
    <td><img src="docs/assets/screenshots/reader-dark.png" alt="Dark theme"></td>
  </tr>
  <tr>
    <td align="center"><sub>Daytime, two pages</sub></td>
    <td align="center"><sub>Night, dark theme</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/screenshots/reader-themes.png" alt="Themes and layout"></td>
    <td><img src="docs/assets/screenshots/reader-bookmarks.png" alt="Bookmarks and notes"></td>
  </tr>
  <tr>
    <td align="center"><sub>Themes and layout</sub></td>
    <td align="center"><sub>Bookmarks and notes</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/screenshots/mac-library.png" alt="Mac library"></td>
    <td><img src="docs/assets/screenshots/reader-pdf.png" alt="Reading a PDF"></td>
  </tr>
  <tr>
    <td align="center"><sub>On the Mac</sub></td>
    <td align="center"><sub>PDFs keep their original layout</sub></td>
  </tr>
</table>

## Getting started

1. Grab an installer from [Releases](https://github.com/EveningStudy/books-plus/releases): `BooksPlus-Setup-x.y.z-x64.exe` for Windows, or the `.dmg` for Apple Silicon Macs.
2. Open Books+ and go to **设置 → 书库** (Settings → Library). Pick a folder. If you want to sync between computers, pick one inside your cloud drive.
3. Click **加入图书** (Add books) in the bottom-right corner, choose a few books, and click a cover to start reading.

The [user guide](docs/GUIDE.en.md) covers the details: sync setup, read-aloud, and fixes for common problems.

## Supported formats

|                                                                 | Formats                       |
| --------------------------------------------------------------- | ----------------------------- |
| Opened directly                                                 | EPUB, KEPUB, PDF              |
| Converted automatically                                         | TXT, Markdown, HTML, FB2      |
| Comics                                                          | CBZ, CBT                      |
| With [Calibre](https://calibre-ebook.com/download) installed    | MOBI, AZW3, DOCX, RTF and more |

DRM-protected books can't be opened. Scanned PDFs display fine, but they have no text layer, so they can't be read aloud.

## Cloud drives

Any cloud drive with a desktop client that syncs files to a local folder should work. We've tested **iCloud Drive, OneDrive and Google Drive** between a real Windows PC and a Mac. Dropbox, Nutstore and Syncthing work the same way but haven't been tested one by one. Web-only storage won't work.

<p align="center">
  <img src="docs/assets/diagrams/sync-overview.svg" alt="How Windows, the cloud folder and the Mac fit together" width="720">
</p>

## Privacy

- Books+ has no server and no account. Your books and reading history stay on your computers and in your own cloud drive.
- When you use Edge voices, the sentence being read is sent to Microsoft's speech service. If you'd rather it didn't, switch to system voices or a local model, which work fully offline.
- On a Mac, Books+ only ever reads Apple Books data. It never modifies the Apple Books database.

## Building from source

You'll need Node.js 24 or later. On a Mac, you'll also need the Xcode Command Line Tools.

```sh
npm ci
npm run dev
```

See the [development docs](docs/DEVELOPMENT.md) (in Chinese) for packaging, testing and the library format.

## License

Books+'s own code is released under the [MIT License](LICENSE). Third-party libraries, voice models and Calibre keep their own licenses, listed in [THIRD_PARTY.md](THIRD_PARTY.md).

This project isn't affiliated with Apple or Microsoft. The book titles, covers and text in the screenshots are sample content made for this project.
