# 색상 이미지 보강 2단계(2026-11-02 사용자) — 대표 이미지와 후보의 실루엣을 대조해 같은 모델만 남긴다 → extra-images.json
#   python3 catalog/silhouette.py            # local/work/colors-plan.json → local/work/silhouette.json (이미지 CDN 만, KicksDB 요청 없음)
#   python3 catalog/silhouette.py --select   # silhouette.json → extra-images.json(켤레당 5장, StockX 순위 순)
#   이미지는 메모리에서 윤곽만 뽑고 버린다(디스크에 쓰지 않는다). 0.5초 간격, 우리 UA · Referer
#   통과: IoU 0.80 이상 · 박스 모양 아님(윤곽이 외곽 사각형을 90% 넘게 채우면 박스 사진). 가로세로 비율은 보지 않는다(크롭 차이 — 사용자)
#   밝기는 보지 않는다 — 표본 298쌍에서 밝기와 IoU 상관 0.14(듀라모 SL 이 낮은 건 대표 사진 구도 탓)
import io, json, re, sys, time, urllib.request
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
WORK = ROOT / 'local/work'
IOU, BOX, KEEP = 0.80, 0.90, 5
UA = 'RUNSHOES-catalog/0.1 (non-commercial portfolio; +https://runshoes.ronanlab.dev)'

def get(u):
    u = re.sub(r'([?&])w=\d+&h=\d+', r'\1w=700&h=500', u)
    req = urllib.request.Request(u, headers={'User-Agent': UA, 'Referer': 'https://runshoes.ronanlab.dev/'})
    with urllib.request.urlopen(req, timeout=20) as r: return r.read()

def mask(b):
    im = Image.open(io.BytesIO(b)).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
    a = np.asarray(bg.convert('RGB')).astype(int)
    m = np.abs(a - 255).max(axis=2) > 14            # 흰 바탕과 다른 픽셀
    if m.sum() < 200: return None, {}
    ys, xs = np.where(m); crop = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    filled = np.zeros_like(crop)                     # 흰 신발의 빈 속: 열마다 처음 · 마지막 픽셀 사이를 채운다
    for j in range(crop.shape[1]):
        idx = np.where(crop[:, j])[0]
        if len(idx): filled[idx[0]:idx[-1] + 1, j] = True
    small = np.asarray(Image.fromarray(filled.astype(np.uint8) * 255).resize((128, 64))) > 127
    return small, {'rect': float(crop.mean())}

def iou(a, b): return float((a & b).sum() / max(1, (a | b).sum()))

def run():
    plan = json.load(open(WORK / 'colors-plan.json')); res = {}
    for r in [x for x in plan['list'] if x['all']]:
        try: rm, _ = mask(get(r['rep'])); time.sleep(0.5)
        except Exception as e: res[r['id']] = {'rep_error': str(e), 'pass': [], 'fail': []}; continue
        out = {'rep': r['rep'], 'pass': [], 'fail': []}
        if rm is None: out['rep_error'] = '대표 윤곽을 못 뽑음'; res[r['id']] = out; continue
        for e in sorted(r['all'], key=lambda x: x.get('rank') or 1e12):
            if len(out['pass']) >= KEEP: break
            item = {'sku': e['sku'], 'title': e['title'], 'img': e['image'], 'rank': e.get('rank')}
            try: cm, ci = mask(get(e['image'])); time.sleep(0.5)
            except Exception as ex: out['fail'].append({**item, 'why': f'받기 실패 {ex}'}); continue
            if cm is None: out['fail'].append({**item, 'why': '윤곽 없음'}); continue
            v = iou(rm, cm); item.update(iou=round(v, 3), rect=round(ci['rect'], 2))
            why = [w for w, bad in ((f"박스 모양(채움 {ci['rect']:.2f})", ci['rect'] > BOX), (f'IoU {v:.3f} < {IOU}', v < IOU)) if bad]
            (out['fail'] if why else out['pass']).append({**item, **({'why': ' · '.join(why)} if why else {})})
        res[r['id']] = out
    json.dump({'res': res}, open(WORK / 'silhouette.json', 'w'), ensure_ascii=False)
    print('켤레', len(res), '통과', sum(len(r['pass']) for r in res.values()))

def select():
    res = json.load(open(WORK / 'silhouette.json'))['res']; rows = {}
    for k, r in res.items():
        seen, pick = set(), []
        for x in sorted(r['pass'], key=lambda x: x.get('rank') or 1e12):
            if x['img'] in seen: continue
            seen.add(x['img']); pick.append({'url': x['img'], 'sku': x['sku'], 'title': x['title'], 'iou': x['iou']})
        if pick: rows[k] = pick[:KEEP]
    doc = json.load(open(ROOT / 'extra-images.json'))['_doc'] if (ROOT / 'extra-images.json').exists() else ''
    json.dump({'_doc': doc, 'rows': rows}, open(ROOT / 'extra-images.json', 'w'), ensure_ascii=False, indent=1)
    print('켤레', len(rows), '장', sum(len(v) for v in rows.values()))

if __name__ == '__main__':
    select() if '--select' in sys.argv else run()
