import struct
import zlib
import os

SIZE = 81

def make_png(pixels):
    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        c += struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)
        return c

    ihdr = struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0)
    raw = b''
    for y in range(SIZE):
        raw += b'\x00'
        for x in range(SIZE):
            r, g, b, a = pixels[y][x]
            raw += bytes([r, g, b, a])

    idat_data = zlib.compress(raw)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', idat_data)
        + chunk(b'IEND', b'')
    )

def new_canvas():
    return [[(0, 0, 0, 0)] * SIZE for _ in range(SIZE)]

def fill_rect(pixels, x, y, w, h, color):
    if len(color) == 4:
        rgba = color
    else:
        rgba = (color[0], color[1], color[2], 255)
    for py in range(y, min(y + h, SIZE)):
        for px in range(x, min(x + w, SIZE)):
            pixels[py][px] = rgba

def draw_circle(pixels, cx, cy, radius, color):
    r, g, b = color
    for py in range(max(0, cy - radius), min(SIZE, cy + radius + 1)):
        for px in range(max(0, cx - radius), min(SIZE, cx + radius + 1)):
            if (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2:
                pixels[py][px] = (r, g, b, 255)

def draw_arc(pixels, cx, cy, radius, thickness, color, y_min_frac=0.0, y_max_frac=1.0):
    r, g, b = color
    y_lo = cy + int(radius * (y_min_frac * 2 - 1))
    y_hi = cy + int(radius * (y_max_frac * 2 - 1))
    for py in range(max(0, cy - radius - thickness), min(SIZE, cy + radius + thickness + 1)):
        for px in range(max(0, cx - radius - thickness), min(SIZE, cx + radius + thickness + 1)):
            dist = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
            if radius <= dist <= radius + thickness and py >= y_lo and py <= y_hi:
                pixels[py][px] = (r, g, b, 255)

GRAY = (153, 153, 153)
BLUE = (26, 115, 232)

def draw_calendar(color):
    p = new_canvas()
    # outer frame rect
    fill_rect(p, 10, 18, 61, 53, color)
    # punch out interior
    fill_rect(p, 15, 28, 51, 38, (0, 0, 0, 0))
    # two header bumps
    fill_rect(p, 22, 10, 12, 12, color)
    fill_rect(p, 47, 10, 12, 12, color)
    return p

def draw_tasks(color):
    p = new_canvas()
    for i, y in enumerate([22, 40, 58]):
        fill_rect(p, 12, y, 57, 8, color)
    return p

def draw_review(color):
    p = new_canvas()
    # three vertical bars of different heights
    heights = [30, 50, 38]
    xs = [12, 32, 52]
    for h, x in zip(heights, xs):
        fill_rect(p, x, SIZE - 15 - h, 17, h, color)
    return p

def draw_profile(color):
    p = new_canvas()
    # head circle
    draw_circle(p, 40, 22, 14, color)
    # body arc (lower half of big circle)
    r, g, b = color
    cx, cy, radius = 40, 52, 22
    for py in range(cy, min(SIZE, cy + radius + 1)):
        for px in range(max(0, cx - radius), min(SIZE, cx + radius + 1)):
            if (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2:
                p[py][px] = (r, g, b, 255)
    return p

out_dir = os.path.dirname(os.path.abspath(__file__))

icons = [
    ('tab-calendar.png', draw_calendar, GRAY),
    ('tab-calendar-active.png', draw_calendar, BLUE),
    ('tab-tasks.png', draw_tasks, GRAY),
    ('tab-tasks-active.png', draw_tasks, BLUE),
    ('tab-review.png', draw_review, GRAY),
    ('tab-review-active.png', draw_review, BLUE),
    ('tab-profile.png', draw_profile, GRAY),
    ('tab-profile-active.png', draw_profile, BLUE),
]

for name, draw_fn, color in icons:
    pixels = draw_fn(color)
    data = make_png(pixels)
    path = os.path.join(out_dir, name)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'created {name}')
