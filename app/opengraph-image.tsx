import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "CardSight AI — know your card's grade before you submit";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "80px 90px",
          background:
            "radial-gradient(900px 500px at 10% -10%, rgba(109,92,255,0.45), transparent 60%), radial-gradient(700px 400px at 105% 30%, rgba(0,200,255,0.3), transparent 60%), #07080d",
          color: "#eef0f6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "linear-gradient(135deg, #6d5cff, #00c8ff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 22,
              }}
            >
              CS
            </div>
            CardSight AI
          </div>
          <div style={{ marginTop: 44, fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
            Know your card&apos;s grade before you submit.
          </div>
          <div style={{ marginTop: 28, fontSize: 28, color: "#9aa1b5", lineHeight: 1.4 }}>
            Millimeter-accurate centering · corner, edge & surface AI analysis
            · PSA / BGS / CGC estimates with confidence
          </div>
        </div>

        <div
          style={{
            width: 250,
            height: 350,
            borderRadius: 20,
            border: "5px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 150,
              height: 150,
              borderRadius: 999,
              border: "10px solid #34d399",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
              fontWeight: 800,
              color: "#fff",
              background: "rgba(7,8,13,0.7)",
            }}
          >
            9.5
          </div>
        </div>
      </div>
    ),
    size
  );
}
