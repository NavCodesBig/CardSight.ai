"""Card segmentation trainer (Road B detector model).

Trains a small U-Net to predict a card-silhouette mask from a downscaled
photo, then exports ONNX for browser inference (onnxruntime-web /
transformers.js runtime). Data comes from scripts/gen-seg-data.ts —
synthetic composites with exact masks, no manual labeling.

  python training/train_seg.py                 # defaults: 10 epochs, cpu ok
  python training/train_seg.py --epochs 20 --batch 16

Outputs:
  training/out/card-seg.pt        best checkpoint (by val dice)
  training/out/card-seg.onnx      export for the browser
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "datasets" / "seg"
OUT = Path(__file__).resolve().parent / "out"

# Training resolution (w, h) — both divisible by 32 for the 4-level U-Net.
RES = (192, 256)


class SegDataset(Dataset):
    def __init__(self, items: list[tuple[Path, Path]], augment: bool):
        self.items = items
        self.augment = augment

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i: int):
        img_p, mask_p = self.items[i]
        img = Image.open(img_p).convert("RGB").resize(RES, Image.BILINEAR)
        mask = Image.open(mask_p).convert("L").resize(RES, Image.NEAREST)

        if self.augment and random.random() < 0.5:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
            mask = mask.transpose(Image.FLIP_LEFT_RIGHT)

        x = torch.frombuffer(bytearray(img.tobytes()), dtype=torch.uint8)
        x = x.view(RES[1], RES[0], 3).permute(2, 0, 1).float() / 255.0
        y = torch.frombuffer(bytearray(mask.tobytes()), dtype=torch.uint8)
        y = y.view(1, RES[1], RES[0]).float() / 255.0
        return x, (y > 0.5).float()


def conv_block(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
    )


class TinyUNet(nn.Module):
    """4-level U-Net, ~0.5M params — small enough for phone-browser inference."""

    def __init__(self, widths=(16, 32, 64, 128)):
        super().__init__()
        w1, w2, w3, w4 = widths
        self.e1 = conv_block(3, w1)
        self.e2 = conv_block(w1, w2)
        self.e3 = conv_block(w2, w3)
        self.bott = conv_block(w3, w4)
        self.pool = nn.MaxPool2d(2)
        self.u3 = nn.ConvTranspose2d(w4, w3, 2, stride=2)
        self.d3 = conv_block(w4, w3)
        self.u2 = nn.ConvTranspose2d(w3, w2, 2, stride=2)
        self.d2 = conv_block(w3, w2)
        self.u1 = nn.ConvTranspose2d(w2, w1, 2, stride=2)
        self.d1 = conv_block(w2, w1)
        self.head = nn.Conv2d(w1, 1, 1)

    def forward(self, x):
        s1 = self.e1(x)
        s2 = self.e2(self.pool(s1))
        s3 = self.e3(self.pool(s2))
        b = self.bott(self.pool(s3))
        x = self.d3(torch.cat([self.u3(b), s3], dim=1))
        x = self.d2(torch.cat([self.u2(x), s2], dim=1))
        x = self.d1(torch.cat([self.u1(x), s1], dim=1))
        return self.head(x)  # logits


def dice_loss(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    prob = torch.sigmoid(logits)
    num = 2 * (prob * target).sum(dim=(1, 2, 3)) + 1
    den = prob.sum(dim=(1, 2, 3)) + target.sum(dim=(1, 2, 3)) + 1
    return (1 - num / den).mean()


@torch.no_grad()
def val_dice(model: nn.Module, loader: DataLoader, device: str) -> float:
    model.eval()
    scores = []
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        pred = (torch.sigmoid(model(x)) > 0.5).float()
        num = 2 * (pred * y).sum(dim=(1, 2, 3)) + 1
        den = pred.sum(dim=(1, 2, 3)) + y.sum(dim=(1, 2, 3)) + 1
        scores += (num / den).tolist()
    model.train()
    return sum(scores) / len(scores)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=2e-3)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(0)
    random.seed(0)

    images = sorted((DATA / "images").glob("*.jpg"))
    pairs = [(p, DATA / "masks" / (p.stem + ".png")) for p in images]
    pairs = [(a, b) for a, b in pairs if b.exists()]
    if len(pairs) < 100:
        raise SystemExit(
            f"Only {len(pairs)} samples in {DATA}. Run: npx tsx scripts/gen-seg-data.ts"
        )
    random.shuffle(pairs)
    split = max(50, len(pairs) // 10)
    train_ds = SegDataset(pairs[split:], augment=True)
    val_ds = SegDataset(pairs[:split], augment=False)
    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=0)
    val_dl = DataLoader(val_ds, batch_size=args.batch, num_workers=0)

    model = TinyUNet().to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"device={device} train={len(train_ds)} val={len(val_ds)} params={n_params/1e6:.2f}M")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    bce = nn.BCEWithLogitsLoss()

    OUT.mkdir(parents=True, exist_ok=True)
    best = 0.0
    for epoch in range(1, args.epochs + 1):
        total = 0.0
        for step, (x, y) in enumerate(train_dl):
            x, y = x.to(device), y.to(device)
            logits = model(x)
            loss = bce(logits, y) + dice_loss(logits, y)
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item()
            if step % 25 == 0:
                print(f"  e{epoch} s{step}/{len(train_dl)} loss={loss.item():.4f}", flush=True)
        sched.step()
        d = val_dice(model, val_dl, device)
        print(f"epoch {epoch}: avg-loss={total/len(train_dl):.4f} val-dice={d:.4f}", flush=True)
        if d > best:
            best = d
            torch.save(model.state_dict(), OUT / "card-seg.pt")

    # Export the best checkpoint to ONNX for browser inference.
    model.load_state_dict(torch.load(OUT / "card-seg.pt", map_location=device))
    model.eval()
    dummy = torch.zeros(1, 3, RES[1], RES[0], device=device)
    torch.onnx.export(
        model,
        dummy,
        OUT / "card-seg.onnx",
        input_names=["image"],
        output_names=["mask_logits"],
        dynamic_axes={"image": {0: "batch"}, "mask_logits": {0: "batch"}},
        opset_version=17,
    )
    print(f"best val-dice={best:.4f}")
    print(f"exported {OUT / 'card-seg.onnx'}")


if __name__ == "__main__":
    main()
