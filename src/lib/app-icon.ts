export const PROD_ICON_PATH = "/icon.png";

const FAVICON_SIZE = 64;
const BADGE_HEIGHT_RATIO = 0.36;
const BADGE_COLOR = "#dc2626";
const BADGE_TEXT_COLOR = "#ffffff";

export type DevBadgeContext = Pick<
  CanvasRenderingContext2D,
  "fillStyle" | "font" | "textAlign" | "textBaseline" | "fillRect" | "fillText"
>;

export function drawDevBadge(context: DevBadgeContext, size: number): void {
  const badgeHeight = Math.round(size * BADGE_HEIGHT_RATIO);
  context.fillStyle = BADGE_COLOR;
  context.fillRect(0, size - badgeHeight, size, badgeHeight);
  context.fillStyle = BADGE_TEXT_COLOR;
  context.font = `bold ${Math.round(badgeHeight * 0.8)}px Arial, Helvetica, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("DEV", size / 2, size - badgeHeight / 2);
}

export function installDevFavicon(): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;

  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = FAVICON_SIZE;
    canvas.height = FAVICON_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(image, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
    drawDevBadge(context, FAVICON_SIZE);
    link.href = canvas.toDataURL("image/png");
  };
  image.src = PROD_ICON_PATH;
}
