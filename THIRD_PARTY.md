# Third-party components

Books+ authored source is MIT. Dependencies retain their own copyrights and terms; `package-lock.json` records exact npm versions. Electron includes Chromium, Node.js and third-party notices in its distribution.

| Component          | Upstream                                               | License                                  |
| ------------------ | ------------------------------------------------------ | ---------------------------------------- |
| Electron           | https://github.com/electron/electron                   | MIT and bundled notices                  |
| React              | https://github.com/facebook/react                      | MIT                                      |
| epub.js            | https://github.com/futurepress/epub.js                 | BSD-2-Clause                             |
| PDF.js             | https://github.com/mozilla/pdf.js                      | Apache-2.0                               |
| JSZip              | https://github.com/Stuk/jszip                          | MIT or GPL; used under MIT               |
| fast-xml-parser    | https://github.com/NaturalIntelligence/fast-xml-parser | MIT                                      |
| xmldom             | https://github.com/xmldom/xmldom                       | MIT                                      |
| Lucide             | https://github.com/lucide-icons/lucide                 | ISC                                      |
| marked             | https://github.com/markedjs/marked                     | MIT                                      |
| sanitize-html      | https://github.com/apostrophecms/sanitize-html         | MIT                                      |
| ws                 | https://github.com/websockets/ws                     | MIT                                      |
| Edge GEC helper    | https://github.com/SchneeHertz/node-edge-tts/blob/master/src/drm.ts | MIT (adapted in `desktop/edge-gec.cjs`; notice in `desktop/licenses/`) |
| sherpa-onnx 1.13.8 | https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8     | Apache-2.0 and native component licenses |
| ONNX Runtime       | https://github.com/microsoft/onnxruntime               | MIT and third-party notices              |
| espeak-ng          | https://github.com/espeak-ng/espeak-ng                 | GPL-3.0-or-later                         |
| node-tar           | https://github.com/isaacs/node-tar                     | ISC                                      |
| unbzip2-stream     | https://github.com/regular/unbzip2-stream              | MIT                                      |

Native license texts are retained under `desktop/licenses/` and packaged with the app. Upstream native sources and build instructions are at the linked repositories. Applicable GPL components retain their own terms and source-distribution requirements. The MIT license covers authored Books+ code, not all combined binaries.

Models download separately from curated sherpa-onnx release assets, with pinned SHA-256, and retain upstream license files. They are not committed or bundled:

- ZipVoice Distill INT8: [ZipVoice (Apache-2.0)](https://github.com/k2-fsa/ZipVoice), [runtime instructions](https://k2-fsa.github.io/sherpa/onnx/tts/zipvoice.html). Uses the upstream archive's `news-female.wav` and `news-female-2.wav` references and transcripts; no celebrity reference is offered. The news reference provenance is as provided in the upstream examples; do not infer a separate voice license from the model license. Vocos is downloaded separately from the runtime's vocoder release, with its own fixed SHA-256.
- Pocket TTS: [Kyutai model (CC-BY-4.0)](https://huggingface.co/kyutai/pocket-tts), ONNX conversion by [KevinAHM](https://github.com/KevinAHM/pocket-tts-onnx-export), packaged by sherpa-onnx. Books+ uses the January 2026 English model in full precision. The model archive retains its README and LICENSE; its example recordings include noncommercial material and are **not selectable or used**. Selected references are separately downloaded at a pinned revision from [Kyutai TTS voices](https://huggingface.co/kyutai/tts-voices): Alba MacKenna, `alba-mackenna/casual.wav`, [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/), unmodified; Bill Boerst, `voice-zero/bill_boerst.wav` (Voice-Zero / LibriVox), CC0, unmodified. See the [voice attribution and license list](https://huggingface.co/kyutai/tts-voices/blob/main/README.md).
- Kitten Mini 0.8: [KittenML model (Apache-2.0)](https://huggingface.co/KittenML/kitten-tts-mini-0.8), [source](https://github.com/KittenML/KittenTTS). Uses eight upstream preset voices, with sherpa-onnx's compatible voice bank.
- Legacy installed Kokoro: [Apache-2.0](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/LICENSE), [runtime instructions](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html).
- Legacy installed Piper Lessac: [model card and dataset license](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD); do not assume the model has the runtime license. Legacy models are no longer offered for download.
- Calibre is installed separately, invoked through `ebook-convert`, and not bundled. See [Calibre source](https://github.com/kovidgoyal/calibre).
- Microsoft voices and services follow their own terms; Edge access uses a third-party client.

Books+ is independent of Apple and Microsoft. No Apple fonts, purchased books, user annotations or personal cloud data are redistributed.
