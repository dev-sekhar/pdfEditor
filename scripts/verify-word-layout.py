"""Render synthetic browser-exported DOCX samples for layout verification in CI."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from zipfile import ZipFile

samples = sorted(Path('test-results').rglob('*.docx'))
if not 2 <= len(samples) <= 20:
    raise RuntimeError(f'Expected 2–20 generated Word samples, got {len(samples)}')
output = Path('word-layout-results').resolve()
output.mkdir(parents=True, exist_ok=True)
manifest = []
for number, sample in enumerate(samples, 1):
    destination = output / f'{number:02d}-{sample.stem}'
    destination.mkdir()
    target = destination / sample.name
    shutil.copy2(sample, target)
    with ZipFile(sample) as archive:
        xml = ET.fromstring(archive.read('word/document.xml'))
    sections = len(xml.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}sectPr'))
    with tempfile.TemporaryDirectory(prefix='word-render-') as profile:
        command = ['soffice', '--headless', f'-env:UserInstallation={Path(profile).as_uri()}',
                   '--convert-to', 'pdf:writer_pdf_Export', '--outdir', str(destination), str(target)]
        subprocess.run(command, check=True, timeout=120)
    pdf = target.with_suffix('.pdf')
    if not pdf.is_file():
        raise RuntimeError(f'No PDF was rendered from {sample}')
    info = subprocess.run(['pdfinfo', str(pdf)], capture_output=True, text=True, check=True, timeout=30).stdout
    pages = int(re.search(r'^Pages:\s+(\d+)', info, re.MULTILINE).group(1))
    # These short fixtures contain one PDF page per Word section. Unexpected
    # blank or overflow pages are a conversion regression, not a passing render.
    if pages != sections or not 1 <= pages <= 12:
        raise RuntimeError(f'{sample}: expected {sections} pages, rendered {pages}')
    subprocess.run(['pdftoppm', '-scale-to', '1400', '-png', str(pdf), str(destination / 'page')], check=True, timeout=120)
    images = sorted(destination.glob('page-*.png'))
    if len(images) != pages:
        raise RuntimeError(f'{sample}: missing page preview images')
    manifest.append({'source': str(sample), 'pages': pages,
                     'images': [str(path.relative_to(output)) for path in images]})
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps(manifest, indent=2))