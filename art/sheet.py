"""Contact sheet of raw previews: python art/sheet.py out.png cols cellw name1 name2 ..."""
import os, sys
from PIL import Image, ImageDraw
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_raw', 'previews')
out, cols, cw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
names = sys.argv[4:]
ims = []
for n in names:
    im = Image.open(os.path.join(P, n + '.png')).convert('RGB')
    im = im.resize((cw, int(im.height * cw / im.width)), Image.LANCZOS)
    ImageDraw.Draw(im).text((6, 4), n, fill=(20, 20, 40))
    ims.append(im)
ch = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * cw, rows * ch), 'white')
for k, im in enumerate(ims):
    S.paste(im, ((k % cols) * cw, (k // cols) * ch))
S.save(out)
