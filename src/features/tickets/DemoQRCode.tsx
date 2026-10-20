import React, { useMemo } from 'react';

interface DemoQRCodeProps {
  value: string;
  size?: number;
  className?: string;
  showCenterBadge?: boolean;
}

/**
 * Deterministically generates a 25x25 QR Matrix (Version 2) with
 * authentic standard finder patterns, timing belts, alignment boxes,
 * and text-hashed payload modules.
 */
function generateQRMatrix(text: string): boolean[][] {
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isReserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function addFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          isReserved[nr][nc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
              matrix[nr][nc] = true;
            }
          }
        }
      }
    }
  }

  // 3 corner finder patterns
  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    isReserved[6][i] = true;
    matrix[6][i] = i % 2 === 0;
    isReserved[i][6] = true;
    matrix[i][6] = i % 2 === 0;
  }

  // Alignment pattern at (18, 18)
  const ar = 18;
  const ac = 18;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      isReserved[ar + r][ac + c] = true;
      if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
        matrix[ar + r][ac + c] = true;
      }
    }
  }

  // Deterministic FNV-1a hash of input string
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // Distribute data modules
  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isReserved[r][c]) {
        const charCode = text.charCodeAt(bitIdx % text.length);
        const bitVal =
          ((hash >> (bitIdx % 28)) & 1) ^
          ((charCode >> (bitIdx % 8)) & 1) ^
          ((r + c) % 2 === 0 ? 1 : 0);
        matrix[r][c] = bitVal === 1;
        bitIdx++;
      }
    }
  }

  return matrix;
}

export const DemoQRCode: React.FC<DemoQRCodeProps> = ({
  value,
  size = 180,
  className = '',
  showCenterBadge = true,
}) => {
  const matrix = useMemo(() => generateQRMatrix(value), [value]);
  const matrixSize = matrix.length;
  const padding = 2;
  const totalGrid = matrixSize + padding * 2;

  return (
    <div
      className={`relative inline-flex items-center justify-center p-3 bg-white rounded-xl shadow-lg border border-white/20 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${totalGrid} ${totalGrid}`}
        className="w-full h-full"
        shapeRendering="crispEdges"
        aria-label="Demo ticket QR code"
        role="img"
      >
        <rect width={totalGrid} height={totalGrid} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <rect
                key={`${r}-${c}`}
                x={c + padding}
                y={r + padding}
                width={1}
                height={1}
                fill="#0f172a"
              />
            ) : null
          )
        )}
      </svg>

      {/* Center DEMO Badge */}
      {showCenterBadge && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-amber-400 text-navy-950 font-black text-[9px] font-mono px-1.5 py-0.5 rounded shadow border border-amber-500 uppercase tracking-widest">
            DEMO
          </div>
        </div>
      )}
    </div>
  );
};
