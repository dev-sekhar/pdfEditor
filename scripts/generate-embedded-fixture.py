"""Create a public synthetic graphics/font fixture; no user documents needed."""
from pathlib import Path
import reportlab
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

root = Path(__file__).resolve().parent.parent
fonts = Path(reportlab.__file__).parent / 'fonts'
pdfmetrics.registerFont(TTFont('FixtureVera', str(fonts / 'Vera.ttf')))
c = canvas.Canvas(str(root / 'tests/fixtures/embedded-layout.pdf'), pagesize=(400, 500), invariant=1)
c.setFillColorRGB(.06, .09, .16)
c.rect(0, 0, 400, 500, fill=1, stroke=0)
c.setFillColorRGB(1, 1, 1)
c.setFont('FixtureVera', 24)
c.drawString(30, 400, 'When Excel stops')
c.setFont('FixtureVera', 14)
c.drawString(30, 350, 'Product data and details')
c.setStrokeColorRGB(.3, .6, 1)
c.line(30, 330, 360, 330)
c.save()
(root / 'tests/fixtures/bitstream-vera-license.txt').write_bytes((fonts / 'bitstream-vera-license.txt').read_bytes())
