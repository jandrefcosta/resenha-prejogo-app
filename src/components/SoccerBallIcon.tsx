/**
 * Soccer ball icon — custom SVG (no Heroicons equivalent).
 * Geometry: filled circle with 6 pentagon cutouts (evenodd) representing
 * the classic black-patch pattern when viewed from the center pentagon.
 *
 * Central pentagon: r=2.5 from center, pointing up.
 * 5 outer pentagons: r=1.5, centers at radius 5.5 from ball center,
 * rotated 36° offset from central vertices (standard soccer ball layout).
 */
export function SoccerBallIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2z
          M10 7.5L12.38 9.23L11.47 12.02L8.53 12.02L7.62 9.23Z
          M12.35 6.76L11.8 5.09L13.23 4.05L14.66 5.09L14.11 6.76Z
          M13.8 11.24L15.23 10.2L16.66 11.24L16.11 12.91L14.35 12.91Z
          M10 14L11.43 15.04L10.88 16.71L9.12 16.71L8.57 15.04Z
          M6.2 11.24L5.65 12.91L3.89 12.91L3.34 11.24L4.77 10.2Z
          M7.65 6.76L5.89 6.76L5.34 5.09L6.77 4.05L8.2 5.09Z
        "
      />
    </svg>
  );
}
