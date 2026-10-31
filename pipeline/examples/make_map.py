"""Create a reproducible five-place raster floor plan for pipeline testing."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def make_map(path: Path):
    image = Image.new("RGB", (1000, 700), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 23)
        small = ImageFont.truetype("DejaVuSans.ttf", 18)
    except OSError:
        font, small = ImageFont.load_default(size=23), ImageFont.load_default(size=18)
    wall = "#333d34"
    room = "#e8eddf"
    draw.rectangle((80, 100, 920, 600), fill=room, outline=wall, width=5)
    draw.polygon([(80, 310), (920, 310), (920, 390), (190, 390), (190, 600), (110, 600), (110, 390), (80, 390)], fill="#fcfcf7")
    lines = [((80, 310), (110, 310)), ((190, 310), (380, 310)), ((500, 310), (660, 310)), ((780, 310), (920, 310)),
             ((80, 390), (110, 390)), ((190, 390), (800, 390)), ((880, 390), (920, 390)),
             ((110, 390), (110, 520)), ((190, 390), (190, 520)), ((110, 580), (110, 600)), ((190, 580), (190, 600)),
             ((300, 100), (300, 310)), ((580, 100), (580, 310)), ((580, 390), (580, 600)), ((300, 390), (300, 600))]
    for a, b in lines:
        draw.line((a, b), fill=wall, width=4)
    # Mark openings with door swing arcs rather than routes or graph hints.
    for x, y in ((110, 310), (380, 310), (660, 310)):
        draw.arc((x, y - 60, x + 120, y + 60), 180, 270, fill="#89977b", width=2)
        draw.line((x, y, x, y - 60), fill="#89977b", width=2)
    draw.arc((800, 330, 920, 450), 90, 180, fill="#89977b", width=2)
    draw.rounded_rectangle((115, 180, 255, 230), radius=12, fill="#b5c5a0")
    draw.rounded_rectangle((340, 140, 540, 185), radius=5, fill="#b5c5a0")
    for x in (355, 440, 525):
        draw.ellipse((x - 15, 205, x + 15, 235), fill="#c5d2b8")
    for y in (470, 515, 560):
        draw.rectangle((625, y, 875, y + 16), fill="#bacba5")
    for text, position in [("RECEPTION", (180, 270)), ("CAFE", (440, 265)), ("RESTROOMS", (745, 265)), ("LIBRARY", (750, 435))]:
        draw.text(position, text, fill=wall, font=font, anchor="mm")
    draw.text((150, 650), "ENTRANCE", fill=wall, font=small, anchor="mm")
    draw.text((500, 40), "THE COMMONS - GROUND FLOOR", fill=wall, font=font, anchor="mm")
    image.save(path)


if __name__ == "__main__":
    target = Path(__file__).with_name("map.png")
    make_map(target)
    print(target)
