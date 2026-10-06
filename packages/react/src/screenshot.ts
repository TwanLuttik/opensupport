import html2canvas from "html2canvas-pro";

/** Photographs the page behind the bubble. The chat itself is left out. */
export async function capturePage(root: HTMLElement | null): Promise<File> {
  if (typeof document === "undefined") throw new Error("Screenshots only work in the browser.");
  const previous = root?.style.visibility ?? "";
  if (root) root.style.visibility = "hidden";
  try {
    const canvas = await html2canvas(document.documentElement, {
      backgroundColor: "#ffffff",
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
      logging: false,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (element) => Boolean(root && (element === root || root.contains(element))),
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not take the screenshot.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([blob], `screenshot-${stamp}.png`, { type: "image/png" });
  } finally {
    if (root) root.style.visibility = previous;
  }
}
