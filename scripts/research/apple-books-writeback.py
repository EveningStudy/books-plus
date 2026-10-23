#!/usr/bin/env python3
"""Self-generated EPUB import PoC; never writes Apple databases.
Usage: python3 scripts/research/apple-books-writeback.py generate|import|inspect|jump CHAPTER
Generated files/evidence stay in ignored .qa/apple-books-writeback/.
"""
import hashlib,json,sqlite3,subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'.qa/apple-books-writeback'
BOOK=OUT/'BooksPlus-Writeback-Test.epub'
IDENT='urn:uuid:a356504b-8fa9-420f-92d8-97c337c90e39'
TITLE='BooksPlus Writeback Test a356504b'
def generate():
 OUT.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(BOOK,'w') as z:
  z.writestr('mimetype','application/epub+zip',compress_type=zipfile.ZIP_STORED)
  z.writestr('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  manifest='<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'+''.join(f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(1,4))
  z.writestr('OEBPS/content.opf',f'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">{IDENT}</dc:identifier><dc:title>{TITLE}</dc:title><dc:language>en</dc:language><dc:creator>BooksPlus Research</dc:creator><meta property="dcterms:modified">2026-10-23T20:00:00Z</meta></metadata><manifest>{manifest}</manifest><spine>'+''.join(f'<itemref idref="c{i}"/>' for i in range(1,4))+'</spine></package>')
  z.writestr('OEBPS/nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>'+''.join(f'<li><a href="c{i}.xhtml">Chapter {i}</a></li>' for i in range(1,4))+'</ol></nav></body></html>')
  for i in range(1,4):
   text=f'<h1>Chapter {i}</h1><p id="target">WRITEBACKTARGET{i} Chapter {i} opening marker.</p>'+''.join(f'<p>Chapter {i}, paragraph {j}. This is original synthetic test text for checking Apple Books reading position. We observe where the reader opens and whether it remembers that position after restarting. No personal book content is used.</p>' for j in range(1,61))
   z.writestr(f'OEBPS/c{i}.xhtml',f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter {i}</title></head><body>{text}</body></html>')
 print(json.dumps({'file':str(BOOK),'sha256':hashlib.sha256(BOOK.read_bytes()).hexdigest(),'identifier':IDENT}))
def test_rows():
 rows=[]
 for p in (Path.home()/'Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary').glob('*.sqlite'):
  with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as src, sqlite3.connect(':memory:') as c:
   src.backup(c); c.row_factory=sqlite3.Row
   rows += [dict(r) for r in c.execute('SELECT * FROM ZBKLIBRARYASSET WHERE ZTITLE = ?', (TITLE,))]
 # Only test book columns; binary/private cloud metadata excluded.
 safe=[{k:v for k,v in row.items() if not isinstance(v,bytes) and not any(s in k for s in ('DSID','ACCOUNT','CLOUD','TOKEN','CKSYSTEM'))} for row in rows]
 return safe
def inspect():
 print(json.dumps(test_rows(),indent=2))
def jump(chapter):
 if chapter not in (1,2,3): raise SystemExit('Chapter must be 1, 2 or 3')
 rows=[r for r in test_rows() if r.get('ZEPUBID')==IDENT]
 if len(rows)!=1: raise SystemExit('Expected exactly one test EPUB; import and inspect first')
 asset=rows[0]['ZASSETID']
 if not asset.isalnum(): raise SystemExit('Unexpected asset ID')
 cfi=f'epubcfi(/6/{chapter*2}!/4/4/1:0)'
 url=f'ibooks://assetid/{asset}#{cfi}'
 subprocess.run(['/usr/bin/open',url],check=True,timeout=15)
 print(json.dumps({'asset_id':asset,'cfi':cfi,'url':url,'status':'submitted; verify in Books and inspect after closing book'}))
if __name__=='__main__':
 command=sys.argv[1] if len(sys.argv)>1 else ''
 if command=='generate': generate()
 elif command=='import':
  if not BOOK.exists(): raise SystemExit('Run generate first')
  subprocess.run(['/usr/bin/open','-a','Books',str(BOOK)],check=True)
  print('Open event submitted; verify import with inspect and Books UI.')
 elif command=='inspect': inspect()
 elif command=='jump': jump(int(sys.argv[2]))
 else: raise SystemExit(__doc__)
