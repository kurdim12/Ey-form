/**
 * EY logo — the yellow beam over the "EY" wordmark.
 *
 * Recreated as an SVG so it renders crisply at any size and the wordmark can be
 * coloured for dark backgrounds (the official raster has charcoal letters that
 * would disappear on the charcoal theme). The original raster is kept at
 * /public/ey-logo.jpeg for reference.
 */
export default function EyLogo({
  className = "",
  wordColor = "#ffffff",
}: {
  className?: string;
  wordColor?: string;
}) {
  return (
    <svg
      viewBox="0 0 130 150"
      className={className}
      role="img"
      aria-label="EY"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Yellow beam */}
      <polygon points="1,63 129,17 129,43" fill="#FFE600" />
      {/* EY wordmark */}
      <text
        x="-2"
        y="147"
        fontFamily="'Arial Black', Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="94"
        letterSpacing="-5"
        fill={wordColor}
      >
        EY
      </text>
    </svg>
  );
}
