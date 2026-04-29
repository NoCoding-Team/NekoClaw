from PIL import Image
import numpy as np
from collections import deque
import glob, os

def remove_white_bg(img_path, threshold=240):
    img = Image.open(img_path).convert('RGBA')
    data = np.array(img, dtype=np.uint8)
    h, w = data.shape[:2]
    mask = np.zeros((h, w), dtype=bool)
    queue = deque()

    def is_white(y, x):
        r, g, b = data[y, x, 0], data[y, x, 1], data[y, x, 2]
        return int(r) + int(g) + int(b) >= threshold * 3

    # seed from all 4 edges
    for y in range(h):
        for x in [0, w-1]:
            if is_white(y, x) and not mask[y, x]:
                mask[y, x] = True; queue.append((y, x))
    for x in range(w):
        for y in [0, h-1]:
            if is_white(y, x) and not mask[y, x]:
                mask[y, x] = True; queue.append((y, x))

    while queue:
        cy, cx = queue.popleft()
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            ny, nx = cy+dy, cx+dx
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and is_white(ny, nx):
                mask[ny, nx] = True; queue.append((ny, nx))

    data[mask, 3] = 0
    Image.fromarray(data).save(img_path)
    print(f"OK: {os.path.basename(img_path)}")

images_dir = r"E:\Develop\Project\Demoidea\NekoClaw\desktop\public\animations\images"
for f in sorted(glob.glob(os.path.join(images_dir, "*.png"))):
    remove_white_bg(f)
print("Done.")
