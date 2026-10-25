# Books+ User Guide

[简体中文](GUIDE.md) · **English** · [Back to README](../README.en.md)

This guide covers everything from installing Books+ to syncing, reading aloud and fixing common problems. Jump to whatever you need.

> [!NOTE]
> Switch between Chinese and English with **中文 / EN** in the library’s bottom-left corner or the reader’s top-right corner. Your choice is remembered. This guide keeps Chinese labels alongside English so you can also follow the screenshots.

- [Install](#install)
- [First steps](#first-steps)
- [Organizing your library](#organizing-your-library)
- [Reading](#reading)
- [Syncing between two computers](#syncing-between-two-computers)
- [Mac and Apple Books](#mac-and-apple-books)
- [Read aloud](#read-aloud)
- [Desktop subtitles](#desktop-subtitles)
- [Deleting and restoring books](#deleting-and-restoring-books)
- [Offline reading and disk space](#offline-reading-and-disk-space)
- [Updates](#updates)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Formats](#formats)
- [FAQ](#faq)

## Install

Download the right file from the [Releases](https://github.com/EveningStudy/books-plus/releases) page:

| System                   | File                             | Notes                                         |
| ------------------------ | -------------------------------- | --------------------------------------------- |
| Windows (recommended)    | `BooksPlus-Setup-x.y.z-x64.exe`  | Installer. Can update itself from inside the app |
| Windows portable         | `BooksPlus-x.y.z-x64.exe`        | No install needed, just run it                |
| Mac (Apple Silicon)      | `BooksPlus-x.y.z-arm64.dmg`      | Open it and drag Books+ into Applications     |

You don't need Node.js, Python or anything else installed. The Mac version needs macOS 13 or later.

> [!WARNING]
> The Windows build is unsigned; the Mac build uses local ad-hoc signing and is not notarized. Windows may show a SmartScreen warning, and macOS may block the app the first time you open it.

**Windows**: run the installer and click through. The portable version doesn't need installing, but its settings still live in your user folder (`%APPDATA%\icloud-books-reader`), not next to the exe.

**Mac**: open the DMG, drag Books+ into Applications, and launch it from there. On first launch it asks how you want to use it. If you just want to read, pick **只阅读** (Reader only). The other two options are explained in [Mac and Apple Books](#mac-and-apple-books).

![The Mac library](assets/screenshots/mac-library.png)

## First steps

### Choose a library

A library is just a folder. Books+ keeps your books and reading history inside it.

1. Click **设置** (Settings) in the bottom-left corner and open **书库** (Library).
2. Click **更改…** (Change…) and choose a folder. An empty folder becomes a new library.
3. If you only read on one computer, any local folder will do. To sync between computers, pick a folder inside your cloud drive. See [Syncing between two computers](#syncing-between-two-computers).

![Library settings](assets/screenshots/settings-library.png)

### Add books

Close Settings and click **加入图书** (Add books) in the bottom-right corner of the library. You can pick many files at once. Books+ copies each book into the library and leaves the original alone. Importing the same book twice gives you two separate entries.

Once imported, click a cover to start reading.

![The library after importing](assets/screenshots/library-grid.png)

## Organizing your library

The sidebar lets you switch between **最近阅读** (Recent), **想读** (Want to read), **全部图书** (All books), **已读完** (Finished), **PDF**, **我的收藏** (Favorites) and **最近删除** (Recently deleted). Your own collections appear below under **我的精选集** (My collections).

Use the search box in the top-right corner to find a title or author. You can also change the sort order (recent, title, author, progress) and switch between grid and list views.

<table>
  <tr>
    <td><img src="assets/screenshots/library-list.png" alt="List view"></td>
    <td><img src="assets/screenshots/library-search.png" alt="Searching by author"></td>
  </tr>
  <tr>
    <td align="center"><sub>List view</sub></td>
    <td align="center"><sub>Searching by author</sub></td>
  </tr>
</table>

Hover over a book and click **…** for more options: add to favorites or want-to-read, mark as finished, keep offline, or delete.

![The book menu](assets/screenshots/book-menu.png)

## Reading

Click a cover to open the book. Turn pages with **← →** or **PageUp / PageDown**, drag the progress bar at the bottom to jump around, and click **图书** (Books) in the top-left to go back to your library. Your place is saved automatically.

![Two-page reading](assets/screenshots/reader-light.png)

### Adjusting the layout

Click **Aa** on the right of the toolbar to change the theme, font, size, line spacing, letter spacing, paragraph spacing and brightness. You can also switch between single and two-page layouts, and between paged and scrolling modes. Page turns can curl, slide, fade, or have no animation at all.

<table>
  <tr>
    <td><img src="assets/screenshots/reader-themes.png" alt="Themes and layout"></td>
    <td><img src="assets/screenshots/reader-dark.png" alt="Dark theme"></td>
  </tr>
  <tr>
    <td align="center"><sub>Themes and layout</sub></td>
    <td align="center"><sub>Focus theme</sub></td>
  </tr>
</table>

### Contents and search

The **目录与批注** (Contents & notes) button in the top-left opens the chapter list. Click a chapter to jump there. The magnifying glass in the top-right searches inside the current book.

<table>
  <tr>
    <td><img src="assets/screenshots/reader-contents.png" alt="Table of contents"></td>
    <td><img src="assets/screenshots/reader-search.png" alt="In-book search"></td>
  </tr>
  <tr>
    <td align="center"><sub>Table of contents</sub></td>
    <td align="center"><sub>Searching inside a book</sub></td>
  </tr>
</table>

### Bookmarks, highlights and notes

- Click the bookmark icon in the toolbar to bookmark the current page.
- Select some text, optionally type a note, and click **标注** (Highlight).
- Find everything under **目录与批注 → 书签与批注** (Contents & notes → Bookmarks & notes). Click an entry to jump back to it, or the trash icon to remove it.

<table>
  <tr>
    <td><img src="assets/screenshots/reader-highlight.png" alt="Adding a highlight"></td>
    <td><img src="assets/screenshots/reader-bookmarks.png" alt="Bookmarks and notes"></td>
  </tr>
  <tr>
    <td align="center"><sub>Select text and add a note</sub></td>
    <td align="center"><sub>Bookmarks and notes</sub></td>
  </tr>
</table>

### PDF

PDFs keep their original layout. Search, bookmarks and read-aloud all work, but you can't highlight text in a PDF yet. Scanned PDFs have no text layer, so you'll need to run OCR with another tool before they can be read aloud.

![Reading a PDF](assets/screenshots/reader-pdf.png)

## Syncing between two computers

Books+ doesn't upload or download anything itself. That's your cloud drive client's job. Books+ just reads and writes the folder your cloud drive keeps in sync, so **you never sign in to anything inside Books+**.

![How sync works](assets/diagrams/sync-overview.svg)

### Setting it up

1. Install the same cloud drive client on both computers and sign in to the same account.
2. On the first computer, create an empty folder in your cloud drive (say, `BooksPlus Library`) and select it in **设置 → 书库** (Settings → Library).
3. Wait for that folder to sync to the second computer.
4. On the second computer, select **the same folder**. The path can be different on each computer.
5. Add a book on one computer, wait for your cloud drive to sync, then open it on the other. Your progress and bookmarks should be there.

> [!IMPORTANT]
> Make sure the second computer opens the library the first one created. Don't create a fresh empty library on each computer and hope they'll merge. Two empty folders with the same name are two different libraries as far as Books+ is concerned.

If your cloud drive has an "always keep on this device" option, turn it on for `catalog.json`, `catalog/` and `reader-state/` in your library. They're tiny, and keeping them local makes sync snappier. The books themselves can stay online-only.

### Continue reading

Books+ checks for new reading positions about every 5 seconds. If the book you have open has moved ahead on another computer, a banner appears at the top. Click **接着读** (Continue) to jump there, or **留在此处** (Stay here) to ignore it. Books you don't have open will simply open at the latest position next time.

![The continue-reading banner](assets/screenshots/reader-resume.png)

If both computers were offline and you read the same book on each, the later change wins. So keep both computers' clocks accurate.

### Which cloud drives work

| Cloud drive                        | Status                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------- |
| iCloud Drive                       | Tested between Windows and Mac                                         |
| OneDrive                           | Tested. The client sometimes gets stuck in a queue; restarting it helps |
| Google Drive                       | Tested, using the desktop client                                       |
| Dropbox, Nutstore, Syncthing, etc. | Same principle, should work, not individually tested                   |
| Web-only storage                   | Won't work. You need a folder that syncs to your computer              |

How fast things sync depends entirely on your cloud drive client. Books+ writing to the folder doesn't mean the upload has finished.

### Things to avoid

- Don't sync Books+'s settings folder. Each computer has its own device ID, and copying it makes the two computers overwrite each other's history.
- Don't sync only the books. Progress lives in `reader-state/` and has to travel with them.
- An older `Books Export` folder can be used as a library directly. Books+ won't touch the files that are already there.

## Mac and Apple Books

Besides reading, the Mac version can sync your Apple Books library into the cloud library in the background. Pick a mode under **设置 → Mac 同步** (Settings → Mac sync):

| Mode                          | What happens                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| **只阅读** (Reader only)      | A normal reader. Apple Books is left alone                                         |
| **只同步** (Sync only)        | No Dock icon, just a menu bar item that syncs Apple Books in the background        |
| **两者都用** (Both)           | Reader and menu bar. Closing the window keeps syncing; press ⌘Q to quit            |

![Mac sync settings](assets/screenshots/mac-sync.png)

### Turning sync on

1. Make sure Books+ is in your Applications folder.
2. Choose a library folder in your cloud drive first. Don't pick Apple Books' own folders.
3. Pick **只同步** (Sync only) or **两者都用** (Both). If it says it doesn't have permission, open **System Settings → Privacy & Security → Full Disk Access**, turn on Books+, and restart the app.
4. To start syncing at login, turn on **登录后自动同步** (Sync at login) and approve the login item when macOS asks.

The first sync can take a while. The sync panel shows what's going on, including books that haven't downloaded yet or a busy Apple Books database.

### What syncs

| Item                                        | Apple Books → Books+ | Books+ → Apple Books                                       |
| ------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| DRM-free EPUB and PDF                       | ✅                   | ✅ Imported into Apple Books                               |
| EPUB reading position                       | ✅                   | ⚠️ Best effort; sometimes lands at the top of the page     |
| PDF reading position                        | ✅                   | ❌                                                         |
| Bookmarks, highlights, notes, finished      | ✅                   | ❌                                                         |
| Deleting in Books+                          | Books+ only          | Never deletes anything from Apple Books                    |
| DRM-protected books, audiobooks             | ❌                   | ❌                                                         |

Sending a reading position to Apple Books may bring Apple Books to the front. If that bothers you, turn off **自动回写 Apple Books 阅读位置** (Send position to Apple Books automatically) and click **在 Books 中继续** (Continue in Books) when you want it.

If the sync panel marks a book as "needs checking" (待核对), Apple Books stopped at the top of the page rather than the exact paragraph. Take a look in Apple Books, and confirm if it's fine.

> [!NOTE]
> Sending positions back relies on Apple Books' link handling, which Apple doesn't officially document. Future versions of Books may change it. iPhone and iPad haven't been tested.

## Read aloud

Open **设置 → 朗读** (Settings → Read aloud), choose an engine and a voice, then press play at the bottom of the reading view. Speed, volume and a sleep timer are all here, and you can have pages turn automatically as it reads.

![System voice settings](assets/screenshots/settings-voice.png)

| Engine                                 | Good for                                                         | Sends text anywhere?                                 |
| -------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| **Edge 在线** (Edge online, default)   | When you're online. Lots of voices, incl. Chinese, English, Japanese, Cantonese | Yes, the current and next sentence go to Microsoft |
| **系统离线** (System voices)           | No downloads, uses the voices already on your computer           | No                                                   |
| **神经离线** (Neural offline)          | Better voices without going online. Download a model first       | No (downloading the model needs internet)            |
| **Piper 本地** (Piper)                 | If you already have Piper and a model                            | No                                                   |

### Downloading a local voice model

1. Choose **神经离线** (Neural offline) as the engine.
2. Scroll down to **下载本地模型** (Download models). Each model lists its language, size and license. Click download.
3. When it's done, select it under **本地模型** (Local model) and pick a voice.
4. Click **试听** (Preview) to hear it. The first sentence takes a moment to load; after that it's quicker.

<table>
  <tr>
    <td><img src="assets/screenshots/settings-model-downloads.png" alt="Downloadable models"></td>
    <td><img src="assets/screenshots/settings-models.png" alt="Model settings"></td>
  </tr>
  <tr>
    <td align="center"><sub>Models you can download</sub></td>
    <td align="center"><sub>Voice, quality and threads</sub></td>
  </tr>
</table>

Which model to pick:

| Model           | Size     | Languages                         | Voices                 |
| --------------- | -------- | --------------------------------- | ---------------------- |
| ZipVoice        | ~156 MB  | Chinese, English, mixed           | Two female voices      |
| Pocket TTS      | ~162 MB  | English                           | Alba (female), Bill (male) |
| Kitten Mini 0.8 | ~64 MB   | English                           | Eight                  |

For Chinese books, start with ZipVoice. For English, compare Pocket and Kitten. What sounds good is personal, so try a few. Models run on the CPU, no graphics card needed, with 1, 2 or 4 threads. ZipVoice and Pocket also offer fast, balanced and detailed quality levels; higher quality takes longer.

Models stay on your computer and aren't synced. English models can't read Chinese, Japanese or Korean, and Books+ will suggest switching engines when that happens.

## Desktop subtitles

While reading aloud, Books+ can show subtitles in their own window on your desktop: transparent, always on top, and visible even when you switch to another app.

1. Open **设置 → 桌面字幕** (Settings → Desktop subtitles).
2. Set the font size, font, colors, outline, background opacity, number of lines (1 to 4) and alignment.
3. Click **显示桌面字幕** (Show desktop subtitles).

<table>
  <tr>
    <td><img src="assets/screenshots/settings-subtitles.png" alt="Subtitle settings"></td>
    <td><img src="assets/screenshots/desktop-subtitles.png" alt="Desktop subtitles"></td>
  </tr>
  <tr>
    <td align="center"><sub>Subtitle styling</sub></td>
    <td align="center"><sub>The subtitle window on the desktop</sub></td>
  </tr>
</table>

You can drag and resize the subtitle window. Once locked, your mouse clicks pass straight through it. Hover over it to reveal pause, previous and next buttons.

## Deleting and restoring books

Deleting a book doesn't actually remove the file. It moves to **最近删除** (Recently deleted), and you can bring it back any time.

1. In the library, open the book's **…** menu and choose **删除图书…** (Delete book…).
2. Confirm with **移到最近删除** (Move to Recently deleted).
3. To get it back, open **最近删除** (Recently deleted) in the sidebar, open the book's **…** menu and choose **恢复图书** (Restore book).

![Recently deleted](assets/screenshots/recently-deleted.png)

<table>
  <tr>
    <td><img src="assets/screenshots/delete-confirm.png" alt="Delete confirmation"></td>
    <td><img src="assets/screenshots/restore-book.png" alt="Restoring a book"></td>
  </tr>
  <tr>
    <td align="center"><sub>You're asked to confirm first</sub></td>
    <td align="center"><sub>Restoring from Recently deleted</sub></td>
  </tr>
</table>

Good to know:

- Deletions sync to your other computers, as long as they're all on 0.5.0. Older versions don't know about deletions.
- The book file, progress and notes are all kept, so deleting doesn't free up space. See the next section for that.
- The original book in Apple Books is never affected.
- There's no "delete permanently" button yet.

![How delete and restore relate](assets/diagrams/delete-restore.svg)

## Offline reading and disk space

Book files normally live in the cloud and download the first time you open them. Heading somewhere without internet? Open the book's **…** menu and choose **下载并保留离线** (Download and keep offline).

The other way around, Books+ frees the local copy of books you haven't opened in 7 days by default, leaving them in the cloud until you open them again. You can change the number of days, or turn this off, in **设置 → 书库** (Settings → Library). Books you're reading, books kept offline, and books that haven't finished uploading are never freed.

Automatic freeing only works with on-demand cloud drives on Windows (like OneDrive or iCloud for Windows) and with iCloud Drive on the Mac. For other cloud drives, manage downloads in the cloud drive's own app.

![What lives in the cloud and what stays local](assets/diagrams/data-locations.svg)

## Updates

In **设置 → 软件更新** (Settings → Software update) you can check for updates by hand, or turn on automatic checking and downloading. When an update is ready, Books+ asks before it **保存并重启安装** (saves and restarts to install). Your progress is saved first.

<table>
  <tr>
    <td><img src="assets/screenshots/settings-updates.png" alt="Updates on Windows"></td>
    <td><img src="assets/screenshots/mac-updates.png" alt="Updates on Mac"></td>
  </tr>
  <tr>
    <td align="center"><sub>Windows</sub></td>
    <td align="center"><sub>Mac</sub></td>
  </tr>
</table>

- **Windows installer**: updates right inside the app.
- **Windows portable**: updating turns it into the installed version. Your settings are kept.
- **Mac**: for now it can only tell you a new version exists; download it and replace the app yourself. Automatic installs will come once the app is properly signed.
- **Very old versions**: if there's no software update page in Settings, install the new version by hand once. It'll keep itself up to date after that.

![The update flow](assets/diagrams/update-flow.svg)

Updating never touches your library or settings.

## Keyboard shortcuts

On a Mac, use ⌘ instead of Ctrl.

| Action                    | Shortcut                     |
| ------------------------- | ---------------------------- |
| Turn page                 | ← → or PageUp / PageDown     |
| Play / pause              | Space (in the reading view)  |
| Play / pause from anywhere | Ctrl + Shift + Space        |
| Show / hide subtitles     | Ctrl + Shift + D             |
| Lock / unlock subtitles   | Ctrl + Shift + L             |
| Close panel / go back     | Esc                          |

## Formats

| How                      | Formats                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Opened directly          | EPUB, KEPUB, PDF                                                                       |
| Built-in conversion      | TXT, Markdown, HTML, FB2                                                               |
| Comics                   | CBZ, CBT                                                                               |
| Needs Calibre            | MOBI, AZW, AZW3, PRC, DOCX, ODT, RTF, LIT, PDB, DJVU, CHM, CBR, CB7 and more           |

<details>
<summary>More details</summary>

- Conversion happens when you open a book. The result is cached on your computer and the original file is never changed.
- TXT files are detected as UTF-8, UTF-16 or GB18030. If the text still looks garbled, choose the encoding by hand and reopen it.
- Local images referenced by HTML and Markdown are imported with them (up to 15 MB each, 80 MB total). Remote images and scripts are never loaded.
- Comics can have up to 3,000 pages, with each image up to 30 MB.
- A single file can be up to 512 MB.
- Calibre is a [separate install](https://calibre-ebook.com/download). Once it's installed, Books+ finds it under **设置 → 格式支持** (Settings → Formats), or you can point it to `ebook-convert` yourself.
- Old Word `.doc` files and DRM-protected books aren't supported.

![Format settings](assets/screenshots/settings-formats.png)

</details>

## FAQ

<details>
<summary><b>My other computer doesn't get my books or progress</b></summary>

Check these in order:

1. Is your cloud drive client running, signed in, and not paused or stuck in a queue? Books+ doesn't upload anything itself.
2. Are both computers using **the same** library? Two empty folders with the same name don't count.
3. Have the books, `catalog.json` and `reader-state/` all synced? Syncing only the books won't bring progress along.
4. Once your cloud drive has caught up, switch back to Books+ or click the refresh button in the bottom-left corner.
5. Books+ won't jump pages in an open book on its own. Look for the **接着读** (Continue) banner at the top.
6. Are both computers' clocks correct?

While troubleshooting, don't delete `reader-state/`, and don't copy the settings folder over from the other computer.

</details>

<details>
<summary><b>I can see the cover, but the book won't open</b></summary>

Covers and the book list usually arrive before the book itself. Check in your cloud drive client that the book has finished downloading, then try again.

MOBI, AZW3, DOCX and similar formats need Calibre; see [Formats](#formats). If a TXT file looks garbled, reopen it with a different encoding.

</details>

<details>
<summary><b>EPUB text gets cut off after opening the sidebar</b></summary>

This is a known issue: sometimes the layout doesn't refresh after the sidebar opens or closes. Resize the window a little, or close the sidebar and reopen the book.

</details>

<details>
<summary><b>I deleted a book, but didn't get any space back</b></summary>

Deleting only moves a book to Recently deleted; the file is still there. To save space, free the local copy from the book's **…** menu, or set the book to online-only in your cloud drive client.

</details>

<details>
<summary><b>"Free up space" doesn't work</b></summary>

A plain local folder has no cloud copy to fall back on, so there's nothing to free. Books you're reading, books kept offline, and books still uploading can't be freed either. Newly imported books need to finish syncing first. On a Mac, only iCloud Drive is supported; for other cloud drives, use their own app.

</details>

<details>
<summary><b>Read-aloud makes no sound</b></summary>

- Check your system volume and output device.
- Edge voices need internet, and Microsoft's service occasionally hiccups. Try again or switch to a local engine.
- Local models have to finish downloading first, and the first sentence loads slowly.
- English models can't read Chinese. Switch to ZipVoice or a Chinese Edge voice.
- Scanned PDFs and comics are images, so there's no text to read.

</details>

<details>
<summary><b>I can't see or click the desktop subtitles</b></summary>

Click **显示桌面字幕** (Show desktop subtitles) in **设置 → 桌面字幕** (Settings → Desktop subtitles), or press Ctrl + Shift + D. If you can't click it, it's probably locked: press Ctrl + Shift + L to unlock it, then drag or resize it. The preview in Settings only shows the style; real subtitles appear once read-aloud starts.

</details>

<details>
<summary><b>Apple Books sync isn't doing anything on my Mac</b></summary>

- Make sure the mode isn't **只阅读** (Reader only).
- Make sure Books+ is in Applications and has Full Disk Access. Restart Books+ after changing that.
- Check the reason shown in the sync panel. Books that haven't downloaded yet or a busy Apple Books database just need a little time.

</details>

<details>
<summary><b>Checking for updates fails</b></summary>

Check your internet connection and whether you can reach GitHub's Releases page, then try again. A failed check doesn't mean you're up to date, so feel free to look at [Releases](https://github.com/EveningStudy/books-plus/releases) directly.

</details>

<details>
<summary><b>Where is my data stored?</b></summary>

| What                                  | Where                                                    |
| ------------------------------------- | -------------------------------------------------------- |
| Books, book list, progress, notes     | The library folder you chose                             |
| Windows settings                      | `%APPDATA%\icloud-books-reader`                          |
| Windows voice models                  | `%LOCALAPPDATA%\BooksReader\models`                      |
| Mac settings                          | `~/Library/Application Support/icloud-books-reader`      |

When you move to a new computer or reinstall your system, your cloud library comes along by itself; just choose it again. You don't need to copy the settings folder, but make sure your cloud drive has finished syncing first. Progress that hasn't uploaded yet only exists on the old computer.

</details>

### Reporting a problem

Questions and bug reports are welcome in [Issues](https://github.com/EveningStudy/books-plus/issues). Please include your Books+ version, operating system, cloud drive, the book format, and how to reproduce the problem. Screenshots help a lot. Please don't post account details, passwords, or the contents of your personal library.
