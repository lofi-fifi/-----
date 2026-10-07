"""生成 PWA 图标：黑色方块 + 白色「考」字。

源文件是 public/icon.svg，但 iOS 的 apple-touch-icon 不吃 SVG，
所以这里用同一套设计光栅化出 PNG。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent  # 仓库根目录
PUBLIC = ROOT / "public"

INK = (17, 17, 17, 255)  # #111111
WHITE = (255, 255, 255, 255)

# 优先用微软雅黑粗体，逐级兜底
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\Deng.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("找不到可用的中文字体")


def draw_glyph(img: Image.Image, ratio: float) -> None:
    """把「考」居中画上去。ratio = 字高占画布的比例。"""
    size = int(img.width * ratio)
    font = load_font(size)
    draw = ImageDraw.Draw(img)

    # 用字形的实际墨迹包围盒来居中，避免字体基线/行距造成视觉偏心
    left, top, right, bottom = draw.textbbox((0, 0), "考", font=font)
    x = (img.width - (right - left)) / 2 - left
    y = (img.height - (bottom - top)) / 2 - top
    draw.text((x, y), "考", font=font, fill=WHITE)


def rounded_icon(size: int, radius_ratio: float = 0.22, glyph_ratio: float = 0.56) -> Image.Image:
    """圆角黑方块 + 白字（普通图标 / favicon 用）"""
    # 4 倍超采样再缩小，边缘更干净
    scale = 4
    img = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        (0, 0, size * scale - 1, size * scale - 1),
        radius=int(size * scale * radius_ratio),
        fill=INK,
    )
    draw_glyph(img, glyph_ratio)
    return img.resize((size, size), Image.LANCZOS)


def maskable_icon(size: int, glyph_ratio: float = 0.42) -> Image.Image:
    """maskable：满幅黑底 + 更小的字，保证被裁成圆形后字还在安全区内"""
    scale = 4
    img = Image.new("RGBA", (size * scale, size * scale), INK)
    draw_glyph(img, glyph_ratio)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)

    outputs = [
        ("pwa-192x192.png", rounded_icon(192)),
        ("pwa-512x512.png", rounded_icon(512)),
        ("apple-touch-icon.png", rounded_icon(180)),
        ("pwa-maskable-512x512.png", maskable_icon(512)),
    ]

    for name, img in outputs:
        path = PUBLIC / name
        img.save(path, "PNG", optimize=True)
        print(f"{name:28} {path.stat().st_size:>7} bytes  {img.size[0]}x{img.size[1]}")

    # 顺手把 favicon 也换成同一套设计的 PNG（浏览器兼容性最好）
    rounded_icon(64, glyph_ratio=0.6).save(PUBLIC / "favicon.png", "PNG", optimize=True)
    print(f"{'favicon.png':28} {(PUBLIC / 'favicon.png').stat().st_size:>7} bytes  64x64")


if __name__ == "__main__":
    main()
