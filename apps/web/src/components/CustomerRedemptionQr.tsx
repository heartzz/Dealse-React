import { toQR } from "toqr";

export function qrMatrixForCredential(credential: string): Uint8Array {
  return toQR(credential);
}

export function CustomerRedemptionQr({ credential }: { credential: string }) {
  const matrix = qrMatrixForCredential(credential);
  const size = Math.sqrt(matrix.length);
  const quietZone = 4;
  let path = "";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix[y * size + x]) path += `M${x + quietZone} ${y + quietZone}h1v1h-1z`;
    }
  }

  return (
    <svg
      className="customer-redemption-qr"
      data-testid="redemption-qr"
      role="img"
      aria-label="QR code for your offer credential"
      viewBox={`0 0 ${size + quietZone * 2} ${size + quietZone * 2}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100%" height="100%" fill="#fff" />
      <path d={path} fill="#17202a" />
    </svg>
  );
}
