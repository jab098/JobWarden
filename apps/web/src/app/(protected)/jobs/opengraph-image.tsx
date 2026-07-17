import { ImageResponse } from "next/og";

export const alt = "JobWarden UK jobs workspace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f4f1ea",
        color: "#172033",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, fontWeight: 600 }}>
        JobWarden
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            color: "#596173",
            fontSize: 22,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          United Kingdom only
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 72,
            fontWeight: 650,
            letterSpacing: -3,
          }}
        >
          Find the right UK role.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          width: 180,
          height: 8,
          background: "#2458a6",
        }}
      />
    </div>,
    size,
  );
}
