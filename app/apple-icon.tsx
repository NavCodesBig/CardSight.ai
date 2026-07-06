import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6d5cff 0%, #00c8ff 100%)",
        }}
      >
        <div
          style={{
            width: 84,
            height: 116,
            border: "9px solid #fff",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 12,
            gap: 10,
          }}
        >
          <div
            style={{
              width: 56,
              height: 42,
              background: "rgba(255,255,255,0.9)",
              borderRadius: 6,
            }}
          />
          <div
            style={{
              width: 56,
              height: 8,
              background: "rgba(255,255,255,0.85)",
              borderRadius: 4,
            }}
          />
          <div
            style={{
              width: 38,
              height: 8,
              background: "rgba(255,255,255,0.6)",
              borderRadius: 4,
              alignSelf: "flex-start",
              marginLeft: 14,
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
