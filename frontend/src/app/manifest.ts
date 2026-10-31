import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "길결 · 실내 길찾기",
    short_name: "길결",
    description: "주변 표지와 진동·음성 안내로 건물 안 목적지를 찾는 실내 길찾기",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F5F1",
    theme_color: "#F6F5F1",
    lang: "ko",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
