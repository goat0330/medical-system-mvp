const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const BASE_FONT_SIZE = 10;

export function updateDesignScale() {
  const scale = Math.min(
    window.innerWidth / DESIGN_WIDTH,
    window.innerHeight / DESIGN_HEIGHT,
  );
  document.documentElement.style.fontSize = `${BASE_FONT_SIZE * scale}px`;
  document.documentElement.dataset.designScale = scale.toFixed(4);
}

export function initDesignScale() {
  updateDesignScale();
  window.addEventListener('resize', updateDesignScale, { passive: true });
}
